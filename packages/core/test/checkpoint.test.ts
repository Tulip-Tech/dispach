/**
 * Session checkpoints (decision 15.21, `docs/25-SPEC-FAN-OUT.md`): compaction's first durable state.
 *
 * Read off the request bodies the next turn sends and the rows the store holds, never off the
 * function's return value: the property is that a *later* turn starts from the checkpoint.
 */

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BRAND } from "../src/brand.ts"
import type { AnyEvent } from "../src/events/types.ts"
import type { FetchLike } from "../src/model/provider.ts"
import { Runtime } from "../src/runtime/runtime.ts"
import { describe, expect, test } from "./_harness.ts"

function manifest(context = ""): string {
    const dir = mkdtempSync(join(tmpdir(), "checkpoint-"))
    writeFileSync(
        join(dir, "agent.yaml"),
        `apiVersion: ${BRAND.apiVersion}
id: test
model:
  main:
    id: gpt-4o-mini
    baseUrl: https://api.example.com/v1
    apiKeyEnv: MODEL_API_KEY
${context}`,
    )
    return join(dir, "agent.yaml")
}

/** Replies `REPLY-<n>` to the n-th request and keeps every request body. */
function model(detail: number) {
    const bodies: string[] = []
    const fetch: FetchLike = async (_url, init) => {
        bodies.push(String(init?.body ?? ""))
        // Long enough that folding a reply into a digest is a saving.
        const content = `REPLY-${bodies.length} ${"and some detail about it ".repeat(detail)}`
        const frame = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
        return new Response(`${frame}data: [DONE]\n\n`, {
            headers: { "content-type": "text/event-stream" },
        })
    }
    return { fetch, bodies }
}

async function boot(context = "", detail = 100) {
    const scripted = model(detail)
    const runtime = await Runtime.create({
        agents: [manifest(context)],
        env: { MODEL_API_KEY: "k" },
        fetch: scripted.fetch,
    })
    const events: AnyEvent[] = []
    runtime.bus.on("*", (event) => events.push(event))
    const agent = runtime.agent("test")
    if (agent === undefined) throw new Error("no agent")
    return { runtime, agent, events, ...scripted }
}

describe("compactSession", () => {
    test("the next turn starts from the digest and the kept turns; the store keeps everything", async () => {
        const { runtime, agent, bodies, events } = await boot()
        for (const n of [1, 2, 3, 4, 5]) await agent.send(`QUESTION-${n}`, { sessionKey: "api:c" })
        const stored = (await agent.history("api:c")).length

        const result = await agent.compactSession("api:c")
        expect(result.keptTurns).toBe(2)
        expect(result.digest).toBe("mechanical")
        expect(result.after).toBeLessThan(result.before)
        expect(events.some((event) => event.type === "session.compacted")).toBe(true)

        await agent.send("QUESTION-6", { sessionKey: "api:c" })
        const next = bodies.at(-1) ?? ""
        expect(next).toContain("Earlier in this conversation")
        // The person's requests survive verbatim; the replies to the folded turns do not.
        expect(next).toContain("QUESTION-1")
        expect(next).not.toContain("REPLY-1")
        expect(next).not.toContain("REPLY-3")
        // The kept turns are verbatim.
        expect(next).toContain("REPLY-4")
        expect(next).toContain("REPLY-5")

        // The transcript is untouched: every message, plus the new turn's two.
        expect((await agent.history("api:c")).length).toBe(stored + 2)
        const summary = (await agent.sessions()).find((session) => session.sessionKey === "api:c")
        expect(summary?.compactedAt).toBeDefined()
        await runtime.stop()
    })

    test("a second compaction folds the first one's digest in", async () => {
        const { runtime, agent, bodies } = await boot()
        for (const n of [1, 2, 3, 4]) await agent.send(`QUESTION-${n}`, { sessionKey: "api:d" })
        await agent.compactSession("api:d")
        for (const n of [5, 6, 7]) await agent.send(`QUESTION-${n}`, { sessionKey: "api:d" })
        await agent.compactSession("api:d", { keepTurns: 1 })
        await agent.send("QUESTION-8", { sessionKey: "api:d" })
        const next = bodies.at(-1) ?? ""
        // One digest, not two stacked, and only the last kept turn's reply.
        expect(next.split("Earlier in this conversation").length - 1).toBe(1)
        expect(next).not.toContain("REPLY-6")
        expect(next).toContain("REPLY-7")
        await runtime.stop()
    })

    test("a session with nothing before its kept turns is refused", async () => {
        const { runtime, agent } = await boot()
        await agent.send("QUESTION-1", { sessionKey: "api:s" })
        let code: string | undefined
        try {
            await agent.compactSession("api:s")
        } catch (error) {
            code = (error as { code?: string }).code
        }
        expect(code).toBe("session_too_short")
        await runtime.stop()
    })

    test("clearing a session removes its checkpoint", async () => {
        const { runtime, agent } = await boot()
        for (const n of [1, 2, 3]) await agent.send(`QUESTION-${n}`, { sessionKey: "api:x" })
        await agent.compactSession("api:x", { keepTurns: 1 })
        await agent.store.sessions.clear(agent.id, "api:x")
        expect(await agent.store.sessions.checkpoint(agent.id, "api:x")).toBeUndefined()
        await runtime.stop()
    })
})

describe("the automatic reset", () => {
    test("a turn whose reset fired saves a checkpoint", async () => {
        // A window where a few long replies cannot fit, so the ladder reaches `reset`. The questions
        // are short, as a person's are: the request spine is kept verbatim through every stage.
        const { runtime, agent, events } = await boot(
            `context:
  window: 4000
  reserveOutput: 500
`,
            200,
        )
        const resetIn = (from: number) =>
            events
                .slice(from)
                .some(
                    (event) =>
                        event.type === "compaction.stage" &&
                        (event.data as { stage: string; changed: boolean }).stage === "reset" &&
                        (event.data as { changed: boolean }).changed,
                )
        // Turns until one resets.
        let n = 0
        let seen = 0
        do {
            seen = events.length
            n += 1
            await agent.send(`QUESTION-${n}`, { sessionKey: "api:r" })
        } while (!resetIn(seen) && n < 10)
        expect(resetIn(seen)).toBe(true)
        expect(await agent.store.sessions.checkpoint(agent.id, "api:r")).toBeDefined()
        expect(events.slice(seen).some((event) => event.type === "session.compacted")).toBe(true)

        // The point of saving it: the very next turn starts from the checkpoint and does not reset.
        // Without the checkpoint the whole history is compacted again, and it resets on every turn.
        const after = events.length
        await agent.send(`QUESTION-${n + 1}`, { sessionKey: "api:r" })
        expect(resetIn(after)).toBe(false)
        await runtime.stop()
    })
})
