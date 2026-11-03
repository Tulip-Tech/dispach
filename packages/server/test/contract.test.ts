/**
 * The happy path of every route no other test reaches, so its declared response schema is checked.
 *
 * The assertions here are deliberately thin: the point is that `contractChecked` (in `harness.ts`)
 * sees a real success response from each route and parses it against what the OpenAPI document
 * says it carries. A route whose schema no test ever exercised is a description nothing verifies,
 * which is the state the whole reference was in before the harness checked it.
 */

import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BRAND, type ChannelHost, Runtime } from "@dispach/core"
import { createHandler } from "../src/handler.ts"
import { cleanupWorkspaces, contractChecked, harness } from "./harness.ts"

afterAll(cleanupWorkspaces)

describe("routes with no other happy-path test", () => {
    test("import takes back what export gave", async () => {
        const { call } = await harness()
        const bundle = await (await call("GET", "/v1/agents/assistant/export")).json()
        const imported = await call("POST", "/v1/agents/assistant/import", { body: { bundle } })
        expect(imported.status).toBe(200)
    })

    test("a conversation is read, its members changed, its log read, and a participant removed", async () => {
        const { call } = await harness()
        for (const id of ["user:ada", "user:bob"]) {
            expect((await call("POST", "/v1/participants", { body: { id } })).status).toBe(201)
        }
        const room = (await (
            await call("POST", "/v1/conversations", {
                body: { kind: "room", members: ["user:ada", "agent:assistant"] },
            })
        ).json()) as { id: string }
        const path = `/v1/conversations/${room.id}`
        expect((await call("GET", path)).status).toBe(200)
        const members = await call("PATCH", `${path}/members`, { body: { add: ["user:bob"] } })
        expect(members.status).toBe(200)
        expect((await call("GET", `${path}/messages`)).status).toBe(200)
        expect((await call("DELETE", "/v1/participants/user:bob")).status).toBe(200)
    })

    test("a note is removed, and projects are listed and removed", async () => {
        const { call } = await harness()
        const note = (await (
            await call("POST", "/v1/memory/notes", {
                body: { scope: "space", text: "Ship on Fridays." },
            })
        ).json()) as { id: string }
        expect((await call("DELETE", `/v1/memory/notes/${note.id}`)).status).toBe(200)
        const project = await call("PUT", "/v1/projects/apollo", {
            body: { agents: ["assistant"] },
        })
        expect(project.status).toBe(200)
        expect((await call("GET", "/v1/projects")).status).toBe(200)
        expect((await call("DELETE", "/v1/projects/apollo")).status).toBe(200)
    })

    test("one schedule is read back", async () => {
        const { call } = await harness()
        const created = await call("POST", "/v1/agents/assistant/schedules", {
            body: { id: "brief", kind: "every", expr: "1h", task: "Say hi.", deliver: "none" },
        })
        expect(created.status).toBe(201)
        expect((await call("GET", "/v1/agents/assistant/schedules/brief")).status).toBe(200)
    })

    test("a channel is patched and unpaired through the host's channel actions", async () => {
        const { call } = await harness({
            channels: {
                setEnabled: async () => ({ note: "switched", changed: true }),
                setCredential: () => ({ note: "stored", variable: "TG_TOKEN" }),
                unpair: () => ({ note: "forgotten" }),
            },
        })
        const patched = await call("PATCH", "/v1/agents/assistant/channels/tg", {
            body: { enabled: false },
        })
        expect(patched.status).toBe(200)
        expect((await call("POST", "/v1/agents/assistant/channels/tg/unpair")).status).toBe(200)
    })
})

test("a channel webhook answers in the channel's own words, as text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "contract-"))
    writeFileSync(
        join(dir, "agent.yaml"),
        `apiVersion: ${BRAND.apiVersion}
id: hooked
model:
  main:
    id: test-model
    baseUrl: https://example.invalid/v1
    apiKeyEnv: MODEL_API_KEY
channels:
  - type: stub
    id: hook
`,
    )
    const runtime = await Runtime.create({
        agents: [join(dir, "agent.yaml")],
        env: { MODEL_API_KEY: "test-key" },
        store: ":memory:",
        startChannels: true,
        channels: {
            stub: (context) => ({
                id: context.id,
                type: "stub",
                limits: { maxMessageChars: 4096, idempotentSend: false },
                start: async (host: ChannelHost) => host.status("connected"),
                stop: async () => {},
                send: async () => ({ ok: true as const, providerMessageId: "1" }),
                webhook: async () => ({ status: 200, detail: "ok" }),
            }),
        },
    })
    try {
        const handler = contractChecked(createHandler({ runtime, allowUnauthenticated: true }))
        const response = await handler(
            new Request("http://127.0.0.1:7420/v1/channels/hook/webhook/hooked", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
            }),
        )
        expect(response.status).toBe(200)
        expect(await response.text()).toBe("ok")
    } finally {
        await runtime.stop()
    }
})
