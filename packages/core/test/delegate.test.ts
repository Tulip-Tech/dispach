/**
 * `delegate` (decision 15.20, `docs/25-SPEC-FAN-OUT.md`): the model fans tasks out to its own
 * subagents. Driven through a real `Runtime` and read off request bodies and tool handlers, like
 * `subagents.test.ts`, because every rule here crosses the executor, the agent and the child turns.
 */

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BRAND } from "../src/brand.ts"
import { ConfigError } from "../src/errors.ts"
import type { AnyEvent } from "../src/events/types.ts"
import type { ActingParticipant } from "../src/loop/sender.ts"
import type { FetchLike } from "../src/model/provider.ts"
import { Runtime } from "../src/runtime/runtime.ts"
import type { Tool, ToolProviderFactory } from "../src/tools/types.ts"
import { describe, expect, test } from "./_harness.ts"

const READER = `subagents:
  - name: researcher
    task: Research one question and report what you found.
    tools: [web_lookup]
    spawn: true`

const WRITER = `subagents:
  - name: scribe
    task: Write one note.
    tools: [note_write]
    spawn: true`

function manifest(subagents: string): string {
    const dir = mkdtempSync(join(tmpdir(), "delegate-"))
    writeFileSync(
        join(dir, "agent.yaml"),
        `apiVersion: ${BRAND.apiVersion}
id: test
model:
  main:
    id: gpt-4o-mini
    baseUrl: https://api.example.com/v1
    apiKeyEnv: MODEL_API_KEY
tools:
  providers:
    web: {}
  pinned: [web_lookup, note_write]
${subagents}
`,
    )
    return join(dir, "agent.yaml")
}

/** How many calls ran at once at most, the participant each carried, and what was written. */
interface Seen {
    running: number
    peak: number
    participants: (ActingParticipant | null | undefined)[]
    written: number
}

function web(seen: Seen): ToolProviderFactory {
    const tool = (slug: string, mutating: boolean): Tool => ({
        spec: {
            slug,
            provider: "web",
            summary: `The ${slug} tool.`,
            whenToUse: "When asked.",
            whenNotToUse: "Otherwise.",
            mutating,
            tags: [],
            trust: "trusted",
            trustReason: "A test fixture.",
            parameters: { type: "object", properties: { q: { type: "string" } } },
        },
        handler: async (_args, context) => {
            seen.participants.push(context.actingParticipant)
            seen.running += 1
            seen.peak = Math.max(seen.peak, seen.running)
            await new Promise((resolve) => setTimeout(resolve, 40))
            seen.running -= 1
            if (mutating) seen.written += 1
            return `RAW-RESULT ${"filler ".repeat(200)}`
        },
    })
    return () => ({
        id: "web",
        resolve: async (slugs) =>
            [tool("web_lookup", false), tool("note_write", true)].filter((entry) =>
                slugs.includes(entry.spec.slug),
            ),
    })
}

const TASKS = `ACTION: delegate
tasks: [{"task": "Find the pricing", "label": "pricing"}, {"task": "Find the competitors", "label": "competitors"}, {"task": "Find the hiring news", "label": "hiring"}]
END`

/**
 * The parent calls `delegate` once and then answers. Each child calls its tool once, then submits a
 * summary naming its own task, so the parent's next request shows which answer came from where.
 */
function model(childScript: (task: string, step: number) => string) {
    const parent: string[] = []
    const children: string[] = []
    const fetch: FetchLike = async (_url, init) => {
        const body = String(init?.body ?? "")
        // A child's prompt carries its task heading; the parent's never does, even after it has read
        // the children's answers.
        const isChild = body.includes("## Your task")
        ;(isChild ? children : parent).push(body)
        const messages = (JSON.parse(body) as { messages: { role: string; content: string }[] })
            .messages
        const step = messages.filter((message) => message.role === "assistant").length
        const task = /## Your task\\n\\n([^"\\]+)/.exec(body)?.[1] ?? "?"
        const content = isChild
            ? childScript(task, step)
            : step === 0
              ? TASKS
              : "Here is what I found."
        const frame = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
        return new Response(`${frame}data: [DONE]\n\n`, {
            headers: { "content-type": "text/event-stream" },
        })
    }
    return { fetch, parent, children }
}

const LOOKUP_THEN_SUBMIT = (task: string, step: number) =>
    step === 0
        ? "ACTION: web_lookup\nq: it\nEND"
        : step === 1
          ? `ACTION: submit_artifact\nsummary: ANSWER for ${task}\nEND`
          : "Done."

async function boot(subagents: string, child = LOOKUP_THEN_SUBMIT) {
    const seen: Seen = { running: 0, peak: 0, participants: [], written: 0 }
    const scripted = model(child)
    const runtime = await Runtime.create({
        agents: [manifest(subagents)],
        env: { MODEL_API_KEY: "k" },
        fetch: scripted.fetch,
        toolProviders: { web: web(seen) },
    })
    const events: AnyEvent[] = []
    runtime.bus.on("*", (event) => events.push(event))
    return { runtime, seen, events, ...scripted }
}

describe("delegate", () => {
    test("exists only when a child declares spawn", async () => {
        const routedOnly = `subagents:
  - name: researcher
    task: Research.
    tools: [web_lookup]
    route:
      tools: [web_lookup]`
        const off = await boot(routedOnly)
        expect(off.runtime.agent("test")?.tools.has("delegate")).toBe(false)
        await off.runtime.stop()
        const on = await boot(READER)
        expect(on.runtime.agent("test")?.tools.has("delegate")).toBe(true)
        await on.runtime.stop()
    })

    test("a child with neither route nor spawn is refused at load", async () => {
        const nothing = `subagents:
  - name: idle
    task: Nothing starts me.
    tools: [web_lookup]`
        let error: unknown
        try {
            await Runtime.create({
                agents: [manifest(nothing)],
                env: { MODEL_API_KEY: "k" },
                toolProviders: { web: web({ running: 0, peak: 0, participants: [], written: 0 }) },
            })
        } catch (caught) {
            error = caught
        }
        expect(error instanceof ConfigError || error instanceof Error).toBe(true)
        expect(String((error as Error).message)).toContain("neither route nor spawn")
    })

    test("read-only tasks run concurrently, and the parent reads every answer and no raw output", async () => {
        const { runtime, seen, parent, events } = await boot(READER)
        const result = await runtime.agent("test")?.send("research three things", {
            sessionKey: "api:p",
        })
        expect(result?.reason).toBe("final")
        expect(seen.peak).toBeGreaterThan(1)
        const after = parent[1] ?? ""
        for (const label of ["pricing", "competitors", "hiring"]) expect(after).toContain(label)
        expect(after).toContain("ANSWER for Find the pricing")
        expect(after).toContain("ANSWER for Find the hiring news")
        expect(after).not.toContain("RAW-RESULT")

        const starts = events.filter((event) => event.type === "handoff.start")
        expect(starts.length).toBe(3)
        const indexes = starts.map((event) => (event.data as { index?: number }).index).sort()
        expect(indexes).toEqual([0, 1, 2])
        const labels = starts.map((event) => (event.data as { label?: string }).label)
        expect(labels).toContain("competitors")
        await runtime.stop()
    })

    test("a child that can write runs its tasks one at a time", async () => {
        const write = (task: string, step: number) =>
            step === 0
                ? "ACTION: note_write\nq: it\nEND"
                : step === 1
                  ? `ACTION: submit_artifact\nsummary: WROTE ${task}\nEND`
                  : "Done."
        const { runtime, seen } = await boot(WRITER, write)
        expect(runtime.agent("test")?.tools.resolve("delegate").spec.mutating).toBe(true)
        await runtime.agent("test")?.send("write three notes", { sessionKey: "api:w" })
        expect(seen.written).toBe(3)
        expect(seen.peak).toBe(1)
        await runtime.stop()
    })

    test("one failed task keeps the others' answers", async () => {
        const flaky = (task: string, step: number) =>
            task.includes("competitors")
                ? "I could not find anything."
                : LOOKUP_THEN_SUBMIT(task, step)
        const { runtime, parent } = await boot(READER, flaky)
        await runtime.agent("test")?.send("research three things", { sessionKey: "api:f" })
        const after = parent[1] ?? ""
        expect(after).toContain("2 came back with an answer")
        expect(after).toContain("ANSWER for Find the pricing")
        expect(after).toContain("finished without an answer")
        await runtime.stop()
    })

    test("every task failing fails the call with delegate_failed", async () => {
        const { runtime, parent } = await boot(READER, () => "Nothing found.")
        await runtime.agent("test")?.send("research three things", { sessionKey: "api:x" })
        expect(parent[1] ?? "").toContain("None of the 3 task(s) came back")
        await runtime.stop()
    })

    test("each child acts for the parent's participant", async () => {
        const { runtime, seen } = await boot(READER)
        await runtime.agent("test")?.send("research three things", {
            sessionKey: "api:a",
            from: { id: "user:ada", kind: "user" },
        })
        expect(seen.participants.length).toBe(3)
        for (const participant of seen.participants) expect(participant?.id).toBe("user:ada")
        await runtime.stop()
    })

    test("a tainted parent cannot start a child that writes", async () => {
        const write = (task: string, step: number) =>
            step === 0
                ? "ACTION: note_write\nq: it\nEND"
                : `ACTION: submit_artifact\nsummary: ${task}\nEND`
        const { runtime, seen } = await boot(WRITER, write)
        await runtime.agent("test")?.send("write three notes", {
            sessionKey: "api:t",
            from: { id: "agent:peer", kind: "agent" },
        })
        expect(seen.written).toBe(0)
        await runtime.stop()
    })
})
