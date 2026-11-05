/**
 * A routed call's subagent in the web transcript (pilot.6): the child's calls fold under the tool row,
 * and a child's `turn.end` does not end the parent's turn. Props in, markup out.
 */

import { describe, expect, test } from "bun:test"
import type { TurnStreamItem } from "@dispach/client"
import type { EventDataMap, EventType } from "@dispach/core/wire"
import { renderToStaticMarkup } from "react-dom/server"
import { Rows } from "../src/chat.tsx"
import { EMPTY, reduce } from "../src/lib/transcript.ts"

const CHILD = "subagent:r1"

/** Typed against `EventDataMap`, so a field the wire does not carry is a compile error here. */
function event<K extends EventType>(type: K, data: EventDataMap[K], child = false): TurnStreamItem {
    return {
        kind: "event",
        event: {
            v: 1,
            type,
            data,
            ts: "2026-10-02T10:00:00.000Z",
            runtimeId: "rt",
            sessionKey: child ? CHILD : "api:w",
            ...(child ? { parentTurnId: "turn_p", parentSessionKey: "api:w" } : {}),
        },
    } as unknown as TurnStreamItem
}

const ITEMS: readonly TurnStreamItem[] = [
    event("turn.start", { source: "api", inputTokens: 3, trust: "trusted" }),
    event("tool.call", { slug: "mail_list", callId: "c1", argsHash: "h", mutating: false }),
    event("handoff.start", {
        member: "test",
        task: "t",
        sessionKey: CHILD,
        kind: "self",
        name: "inbox",
        callId: "c1",
    }),
    event("tool.call", { slug: "mail_read", callId: "k1", argsHash: "h", mutating: false }, true),
    event(
        "tool.result",
        {
            slug: "mail_read",
            callId: "k1",
            ok: true,
            latencyMs: 9,
            bytes: 10,
            truncated: false,
            trust: "trusted",
        },
        true,
    ),
    event(
        "turn.end",
        { reason: "final", steps: 2, tokens: { prompt: 800, output: 200 }, durationMs: 4 },
        true,
    ),
    event(
        "tool.call",
        { slug: "submit_artifact", callId: "k9", argsHash: "h", mutating: false },
        true,
    ),
    event("handoff.result", {
        member: "test",
        sessionKey: CHILD,
        kind: "self",
        name: "inbox",
        callId: "c1",
        outcome: "ok",
        steps: 2,
        tokens: { prompt: 800, output: 200 },
    }),
    event("tool.result", {
        slug: "mail_list",
        callId: "c1",
        ok: true,
        latencyMs: 30,
        bytes: 200,
        truncated: false,
        trust: "trusted",
    }),
]

describe("a subagent in the web transcript", () => {
    test("its calls fold under the routed row, and its turn.end leaves the parent running", () => {
        const state = ITEMS.reduce(reduce, EMPTY)
        const tools = state.rows.filter((row) => row.kind === "tool")
        expect(tools.length).toBe(1)
        const row = tools[0]
        if (row?.kind !== "tool") throw new Error("no tool row")
        expect(row.subagents?.[0]?.calls).toEqual([
            { callId: "k1", slug: "mail_read", ok: true, latencyMs: 9 },
        ])
        expect(row.subagents?.[0]?.outcome).toBe("ok")
        expect(state.running).toBe(true)

        const html = renderToStaticMarkup(<Rows state={state} onAnswer={() => {}} />)
        expect(html).toContain('<details class="subagent">')
        expect(html).toContain("subagent inbox · 2 steps · 1000 tokens · ok")
        expect(html).toContain("mail_read")
    })
})

describe("a delegate call in the web transcript", () => {
    test("holds one block per task, in task order, each labelled", () => {
        const start = (sessionKey: string, index: number, label: string) =>
            event("handoff.start", {
                member: "test",
                task: "t",
                sessionKey,
                kind: "self",
                name: "researcher",
                callId: "d1",
                index,
                label,
            })
        // Started out of order, as concurrent children can be; the row keeps the call's order.
        const state = [
            event("turn.start", { source: "api", inputTokens: 3, trust: "trusted" }),
            event("tool.call", { slug: "delegate", callId: "d1", argsHash: "h", mutating: false }),
            start("subagent:b", 1, "competitors"),
            start("subagent:a", 0, "pricing"),
            event("handoff.result", {
                member: "test",
                sessionKey: "subagent:b",
                kind: "self",
                name: "researcher",
                callId: "d1",
                index: 1,
                label: "competitors",
                outcome: "budget",
                steps: 12,
                tokens: { prompt: 10, output: 5 },
            }),
        ].reduce(reduce, EMPTY)
        const row = state.rows.find((item) => item.kind === "tool")
        if (row?.kind !== "tool") throw new Error("no tool row")
        expect(row.subagents?.map((block) => block.label)).toEqual(["pricing", "competitors"])
        expect(row.subagents?.[1]?.outcome).toBe("budget")
        const html = renderToStaticMarkup(<Rows state={state} onAnswer={() => {}} />)
        expect(html).toContain("subagent researcher · pricing · running…")
        expect(html).toContain("subagent researcher · competitors · 12 steps")
    })
})
