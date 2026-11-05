/**
 * The OpenAPI document, **generated** — never written down.
 *
 * ## Why this is safe to have, when a hand-written one would not be
 *
 * `09-API-GUIDE.md` records the argument against a generated reference: *"a third description of a
 * surface that already has two… would drift from both and look the most authoritative."* That
 * lands squarely on a hand-maintained `openapi.yaml`, which would be a **fourth** list of routes in
 * a repo that has paid for `NO_MANIFEST`, `DOCUMENTED_CTRL_LETTERS`, `THRESHOLD_ORDER` and two spec
 * tables. It does not land on a derived one.
 *
 * Both halves come from something that already exists and is already checked:
 *
 * - **Paths and methods** from `Router.routes()`, whose own docstring says a hand-kept copy "is
 *   right when it is written and wrong at the next addition". `OPTIONS`, the `Allow` header and the
 *   spec guard already derive from that table; this is the fourth consumer, not a new list.
 * - **Bodies** from the Zod schemas in `wire-schemas.ts`, via `z.toJSONSchema` — which also carries
 *   each field's `code` and `hint`, so the reference documents the *refusal* rather than only the
 *   happy path.
 *
 * What is left hand-written is one line of prose per route — a summary. That cannot drift silently,
 * because `spec.test.ts` fails when a registered route has none.
 *
 * ## What it deliberately omits
 *
 * **The browser surface.** `/`, `/assets/app.js` and `/assets/app.css` are a served *page*, not an
 * API, and listing them would invite a client to treat the UI's asset paths as a contract. Excluded
 * by prefix rather than by name, so a fourth asset does not need remembering.
 *
 * **Most success bodies.** A route declares a response schema (`responses`, from the schemas in
 * `wire-schemas.ts`) where a client branches on the body; the rest document their status only. That
 * line is honest rather than aspirational because of who checks it. `@dispach/client`'s types are
 * *not* a check — its `request()` ends in `.json() as T`, so `tsc` believes whatever the type says.
 * What checks this document is `test/harness.ts`: every handler a test builds through it parses each
 * JSON response against the schema its route declares for that status, and fails on a status the
 * route does not declare at all. A declared shape the handler stopped producing is a red suite.
 *
 * Every failure status carries `components.schemas.Error`, generated from `ErrorBody` — the one
 * envelope `respond.ts` writes — and checked by the same harness on every 4xx and 5xx.
 */

import { VERSION } from "@dispach/core"
import { z } from "zod"
import { PROTOCOL } from "./auth.ts"
import {
    ActionList,
    Activity,
    AgentList,
    AgentReloaded,
    AgentRemoved,
    AgentResource,
    AgentSwitched,
    AgentUsage,
    ApprovalBody,
    ApprovalDecided,
    ApprovalList,
    AssigneeBody,
    AssigneeCleared,
    AssigneeRead,
    Assignment,
    Bundle,
    ChannelPatchBody,
    ChannelPatched,
    ChannelUnpaired,
    CompactBody,
    CompactResult,
    ConfigApplied,
    ConfigBody,
    ConfigListing,
    ContextPreview,
    Conversation,
    ConversationBody,
    ConversationList,
    ConversationLog,
    ConversationMessage,
    ConversationMessageBody,
    DecisionBody,
    DeferredAction,
    Deleted,
    DeliveryAccepted,
    DeliveryBody,
    ErrorBody,
    Health,
    ImportBody,
    ImportResult,
    KeyBody,
    KeyList,
    KeyMinted,
    KeyRecord,
    MembersBody,
    MemoryNote,
    MemoryReads,
    MessageAccepted,
    MessageBody,
    MessagePage,
    NoteBody,
    NoteList,
    OpenApiDocument,
    Participant,
    ParticipantBody,
    ParticipantList,
    PhaseBody,
    PhaseSet,
    PresenceBody,
    Project,
    ProjectBody,
    ProjectList,
    ProvisionBody,
    ProvisionResult,
    ProvisionSteps,
    Ready,
    RecallBody,
    RecallSet,
    ResolveBody,
    ResolveResult,
    RotateBody,
    RotateResult,
    ScheduleList,
    SchedulePreview,
    ScheduleRecord,
    ScheduleRemoved,
    ScheduleRunAccepted,
    SecretStatus,
    SecretsBody,
    SecretsWritten,
    SessionCleared,
    SessionList,
    SessionRecord,
    SkillList,
    SpaceWriter,
    SpaceWriterBody,
    StopBody,
    TemplateList,
    ToolList,
    ToolsRefreshBody,
    ToolsRefreshed,
    TurnPage,
    TurnRecord,
    TurnStopAccepted,
    Usage,
    VarsApplied,
    VarsBody,
    VarsRecord,
    WebhookBody,
    WebhookCreated,
    WebhookList,
    WorkspaceFile,
    WorkspaceFileBody,
    WorkspaceList,
    WorkspaceWritten,
} from "./wire-schemas.ts"

/**
 * A response body: JSON matching a schema, an event stream, or either (the `/messages` 202, whose
 * media type the request's `stream` decides).
 */
type ResponseBody = z.ZodType | Media | { readonly json: z.ZodType; readonly sse: true }

/** A body that is not JSON, by the media type it is served as. */
type Media = "sse" | "text" | "html" | "gzip"

const MEDIA: Readonly<Record<Media, { readonly type: string; readonly about: string }>> = {
    sse: {
        type: "text/event-stream",
        about: "Server-sent events. Each frame's `data` is one event; the event table is in the wire spec (docs/04-SPEC-WIRE.md).",
    },
    text: { type: "text/plain", about: "Plain text." },
    html: { type: "text/html", about: "An HTML page." },
    gzip: { type: "application/gzip", about: "A gzip-compressed tar archive." },
}

/** One line per route, plus its body when it reads one. The only hand-written half. */
interface RouteDoc {
    readonly summary: string
    readonly body?: z.ZodObject
    /**
     * The status the route answers when it did what it was asked. `200` when omitted, and always
     * listed — it used to be inferred from `statuses`, which dropped a route's ordinary `200`
     * whenever its rarer `202` was the one somebody wrote down.
     */
    readonly success?: number
    /** The body a status carries, where a client reads it. Checked by `test/harness.ts`. */
    readonly responses?: Readonly<Record<number, ResponseBody>>
    /** Statuses worth naming beyond the success and the shared 400/401/403/404/500. */
    readonly statuses?: readonly { readonly code: number; readonly when: string }[]
    /** Query parameters, named because a path pattern cannot carry them. */
    readonly query?: readonly { readonly name: string; readonly about: string }[]
    /** Request headers the route reads. */
    readonly headers?: readonly { readonly name: string; readonly about: string }[]
}

/**
 * Keyed `METHOD path`, matching `Router.routes()` exactly.
 *
 * A missing entry is a **failing test**, not a blank page: `spec.test.ts` walks the router and
 * demands one. That is what keeps this honest without making it a second route list — it cannot
 * contain a route that does not exist (nothing would read it) and it cannot omit one that does.
 */
const DOCS: Readonly<Record<string, RouteDoc>> = {
    "GET /v1/health": {
        summary: "Liveness, the version, and how many agents are hosted.",
        responses: { 200: Health },
    },
    "GET /v1/ready": {
        summary: "Whether a turn can be served yet.",
        responses: { 200: Ready, 503: Ready },
        statuses: [
            {
                code: 503,
                when: "`starting` (not ready yet) or `draining` (on the way down); the body has the same shape as the 200",
            },
        ],
    },
    "GET /v1/activity": {
        responses: { 200: Activity },
        summary:
            "Whether the process is idle, and when it must next be woken. For an external waker.",
        statuses: [{ code: 403, when: "the key is scoped to agents or sessions" }],
    },
    "GET /v1/agents": {
        responses: { 200: AgentList },
        summary: "Every agent this server knows about, hosted or switched off.",
    },
    "GET /v1/agents/:id": {
        summary: "One agent, with its dialect, window, counts and warnings.",
        responses: { 200: AgentResource },
    },
    "GET /v1/backup": {
        responses: { 200: "gzip" },
        summary:
            "The silo as a tar.gz: a consistent store snapshot and every hosted agent's directory, with a backup.json manifest. No .env or .git unless asked for. An admin key with no agents scope.",
        query: [
            {
                name: "include",
                about: "Any of env, git, home, comma-separated: each agent's .env (its secrets), its .git directories, and the rest of the state directory under home/.",
            },
        ],
        statuses: [
            {
                code: 400,
                when: "include names something other than env, git or home, or home on a server with no state directory",
            },
            { code: 403, when: "the key is scoped to some agents" },
        ],
    },
    "GET /v1/agents/:id/export": {
        responses: { 200: Bundle },
        summary:
            "A slice of the agent as a JSON bundle: its carried memory file, memory archive and knowledge. Never the manifest, secrets or skills.",
        query: [
            {
                name: "paths",
                about: "Narrow the bundle to these sections, comma-separated: MEMORY.md, memory/, knowledge/.",
            },
        ],
        statuses: [{ code: 400, when: "`paths` names something a bundle cannot carry" }],
    },
    "POST /v1/agents/:id/import": {
        responses: { 200: ImportResult },
        summary:
            "Merge a bundle into the agent: memory note by note, knowledge kept or overwritten. Reloads when the carried file or knowledge changed, and restores everything if that reload refuses.",
        body: ImportBody,
        statuses: [
            {
                code: 400,
                when: "a path a bundle cannot carry, or a bundle the agent would not load",
            },
        ],
    },
    "GET /v1/agents/:id/workspace": {
        responses: { 200: WorkspaceList },
        summary:
            "The files the agent's prompt is built from: name, tier, field, whether it exists, size.",
        statuses: [
            { code: 409, when: "the manifest does not parse, so its files cannot be named" },
        ],
    },
    "GET /v1/agents/:id/workspace/:file": {
        responses: { 200: WorkspaceFile },
        summary: "One declared workspace file's text, for an editor to show before it replaces it.",
        statuses: [
            { code: 404, when: "not a file the manifest declares" },
            { code: 409, when: "the manifest does not parse" },
        ],
    },
    "PUT /v1/agents/:id/workspace/:file": {
        responses: { 200: WorkspaceWritten },
        summary:
            "Replace one of the agent's declared workspace files; reload it, or diagnose it when it is not running.",
        body: WorkspaceFileBody,
        statuses: [
            {
                code: 400,
                when: "a running agent would not load with the new text (the old text is put back)",
            },
            { code: 404, when: "a file the manifest does not declare" },
            {
                code: 409,
                when: "an agent with no manifest file, or one whose manifest does not parse",
            },
        ],
    },
    "GET /v1/agents/:id/vars": {
        responses: { 200: VarsRecord },
        summary:
            "The template an agent was made from and the plain variable values it was last rendered with. Secrets never appear.",
        statuses: [
            { code: 409, when: "an agent with no template record" },
            { code: 501, when: "a server with no templates directory (an embedded handler)" },
        ],
    },
    "PATCH /v1/agents/:id/vars": {
        responses: { 200: VarsApplied, 202: VarsApplied },
        summary:
            "Apply changed template variables: re-render the files nobody edited since they were rendered, then reload.",
        body: VarsBody,
        statuses: [
            { code: 200, when: "applied: `reload` says whether the agent was reloaded" },
            {
                code: 202,
                when: "files changed and a turn is running: the reload lands when it ends",
            },
            {
                code: 400,
                when: "a secret or undeclared variable, or a result the agent would not load (every file is put back)",
            },
            { code: 409, when: "the agent was not made from a template on 0.2.0 or later" },
            { code: 501, when: "this server has no templates" },
        ],
    },
    "POST /v1/agents/:id/tools/refresh": {
        responses: { 200: ToolsRefreshed, 202: ToolsRefreshed },
        summary:
            "Fetch the tool providers' catalogues and schemas now, and reload the agent only if what it serves changed.",
        body: ToolsRefreshBody,
        statuses: [
            { code: 200, when: "refreshed; reloaded now if what the agent serves changed" },
            {
                code: 202,
                when: "something changed and a turn is running: the reload lands when it ends",
            },
            {
                code: 400,
                when: "a provider the agent does not have, or a reload the agent refuses",
            },
            { code: 409, when: "a turn is in flight and the runtime refused to hold the reload" },
        ],
    },
    "POST /v1/agents/:id/reload": {
        responses: { 200: AgentReloaded, 202: AgentReloaded },
        summary: "Re-read the manifest by replacing the agent with a new instance.",
        statuses: [
            { code: 200, when: "loaded: `adopted` lists every agent that came back" },
            {
                code: 202,
                when: "a turn is running: it finishes on the old configuration and the swap follows, announced by agent.reloaded",
            },
            { code: 400, when: "a team member, which has no manifest of its own" },
            { code: 409, when: "the runtime refused to hold the swap behind a running turn" },
        ],
    },
    "GET /v1/provision": {
        responses: { 200: ProvisionSteps },
        summary: "The questions creating an agent asks, and whether this server can answer them.",
    },
    "POST /v1/agents": {
        summary:
            "Create an agent, from answers or from a template, and adopt it into this host, live.",
        body: ProvisionBody,
        success: 201,
        responses: { 201: ProvisionResult },
        statuses: [
            { code: 201, when: "created; `adopted` is empty with an `error` if it is not running" },
            {
                code: 403,
                when: "neither a loopback bind nor an authenticated admin credential",
            },
            { code: 501, when: "this server has no provisioner" },
        ],
    },
    "POST /v1/webhooks": {
        responses: { 201: WebhookCreated },
        summary: "Subscribe a URL to event types. The signing secret is returned once.",
        body: WebhookBody,
        success: 201,
        statuses: [
            { code: 201, when: "created; `secret` is in this response and no other" },
            {
                code: 400,
                when: "a refused URL, an undeliverable type, or agents outside this key's reach",
            },
        ],
    },
    "POST /v1/participants": {
        responses: { 201: Participant },
        summary: "Register a human participant under the embedder's own id. No account is stored.",
        body: ParticipantBody,
        success: 201,
        statuses: [{ code: 201, when: "registered, or updated if the id existed" }],
    },
    "GET /v1/participants": {
        summary: "The registered human participants.",
        responses: { 200: ParticipantList },
    },
    "DELETE /v1/participants/:participantId": {
        responses: { 200: Deleted },
        summary: "Remove a participant and their conversation memberships.",
    },
    "POST /v1/conversations": {
        responses: { 201: Conversation },
        summary: "Create a room or a DM among participants and agents (agent:<id>).",
        body: ConversationBody,
        success: 201,
        statuses: [
            { code: 201, when: "created" },
            { code: 403, when: "a participant-bound key creating a conversation it is not in" },
        ],
    },
    "GET /v1/conversations": {
        summary: "The conversations this credential can see.",
        responses: { 200: ConversationList },
    },
    "GET /v1/conversations/:conversationId": {
        summary: "One conversation and its members.",
        responses: { 200: Conversation },
    },
    "PATCH /v1/conversations/:conversationId/members": {
        responses: { 200: Conversation },
        summary: "Add or remove members of a room.",
        body: MembersBody,
    },
    "POST /v1/conversations/:conversationId/messages": {
        responses: { 202: ConversationMessage },
        summary:
            "Post a human member's message. In a room only the mentioned agents answer; in a DM the agent always does. Their replies arrive as conversation.message.",
        body: ConversationMessageBody,
        success: 202,
        statuses: [
            { code: 202, when: "logged; the turns it starts run behind the response" },
            { code: 403, when: "a participant-bound key naming another author" },
        ],
    },
    "GET /v1/conversations/:conversationId/messages": {
        responses: { 200: ConversationLog },
        summary: "The conversation's log, oldest first, after a sequence number.",
    },
    "PUT /v1/participants/:participantId/presence": {
        responses: { 200: Participant },
        summary:
            "Push whether a person is there. In a DM between two people, an offline person's agent stands in for them.",
        body: PresenceBody,
        statuses: [{ code: 403, when: "a participant-bound key setting someone else's presence" }],
    },
    "POST /v1/memory/notes": {
        responses: { 201: MemoryNote },
        summary:
            "Add a note to a shared memory scope — the space, a person's owner scope, or a project. Agents recall it when a turn is about it.",
        body: NoteBody,
        success: 201,
        statuses: [
            { code: 201, when: "saved" },
            { code: 403, when: "this participant may not write that scope" },
            { code: 404, when: "the scope's owner or project does not exist" },
        ],
    },
    "GET /v1/memory/notes": {
        responses: { 200: NoteList },
        summary:
            "Every note in one shared scope, oldest first. An owner scope is readable by its owner.",
    },
    "DELETE /v1/memory/notes/:noteId": {
        responses: { 200: Deleted },
        summary: "Remove a note. Whoever may write its scope may remove it.",
    },
    "GET /v1/participants/:participantId/memory/reads": {
        responses: { 200: MemoryReads },
        summary:
            "The person's audit: every time an agent recalled their owner scope for somebody else, stand-ins included.",
    },
    "GET /v1/projects": {
        summary: "Projects, each with the agents that share its memory.",
        responses: { 200: ProjectList },
    },
    "PUT /v1/projects/:projectId": {
        responses: { 200: Project },
        summary: "Define a project, or replace which agents share its memory. An admin's act.",
        body: ProjectBody,
    },
    "DELETE /v1/projects/:projectId": {
        responses: { 200: Deleted },
        summary: "Remove a project and its notes.",
    },
    "PUT /v1/memory/space/writer": {
        responses: { 200: SpaceWriter },
        summary:
            "Name the one non-admin who may write the space. An agent named here saves its memory_write to the space.",
        body: SpaceWriterBody,
    },
    "GET /v1/actions": {
        responses: { 200: ActionList },
        summary:
            "Mutating calls stand-ins queued for their owners. A member-bound key sees its own.",
    },
    "POST /v1/actions/:actionId": {
        responses: { 200: DeferredAction },
        summary:
            "Approve or decline a queued action. Approved, the exact call runs as the owner's agent and the outcome is posted in the DM.",
        body: DecisionBody,
        statuses: [
            { code: 404, when: "no such action, or not this key's to decide" },
            { code: 409, when: "already decided" },
        ],
    },
    "PUT /v1/agents/:id/assignee": {
        responses: { 200: Assignment },
        summary: "Record which member an agent works for. An admin participant's act.",
        body: AssigneeBody,
    },
    "GET /v1/agents/:id/assignee": {
        responses: { 200: AssigneeRead },
        summary:
            "Who the agent is assigned to, as `{id, assignment}`; `assignment` is null when nobody.",
    },
    "DELETE /v1/agents/:id/assignee": {
        summary: "Clear an agent's assignment.",
        responses: { 200: AssigneeCleared },
    },
    "GET /v1/webhooks": {
        responses: { 200: WebhookList },
        summary:
            "The subscriptions this credential can see, with their delivery health. Never a secret.",
    },
    "DELETE /v1/webhooks/:webhookId": {
        responses: { 200: Deleted },
        summary: "Delete a subscription and anything it still owed.",
        statuses: [{ code: 404, when: "no such subscription, or one outside this key's reach" }],
    },
    "GET /v1/usage": {
        responses: { 200: Usage },
        summary:
            "What every agent in scope cost, per model call, grouped by agent, model, day or sender.",
        statuses: [{ code: 400, when: "an unknown grouping or a date that does not parse" }],
    },
    "GET /v1/agents/:id/usage": {
        responses: { 200: AgentUsage },
        summary: "What this agent cost, from the meter.",
        statuses: [{ code: 400, when: "an unknown grouping or a date that does not parse" }],
    },
    "GET /v1/agents/:id/turns": {
        summary:
            "Every turn this agent has taken, newest first, across sessions, paged by `before`.",
        responses: { 200: TurnPage },
        query: [
            { name: "limit", about: "How many to return, up to 200. Default 50." },
            { name: "before", about: "The previous page's `nextBefore`." },
        ],
        statuses: [{ code: 400, when: "`limit` or `before` is not a positive whole number" }],
    },
    "GET /v1/templates": {
        responses: { 200: TemplateList },
        summary: "The templates an agent can be created from, and the variables each declares.",
    },
    "GET /v1/agents/:id/secrets": {
        responses: { 200: SecretStatus },
        summary:
            "Which variables the agent's manifest reads, and whether each is set. Never a value.",
        statuses: [{ code: 501, when: "this server has no credential writer" }],
    },
    "PUT /v1/agents/:id/secrets": {
        responses: { 200: SecretsWritten },
        summary: "Write the agent's credentials into its .env and apply them: reload or adopt.",
        body: SecretsBody,
        statuses: [
            { code: 200, when: "written; `applied` says whether the agent is running on them" },
            { code: 400, when: "a variable the manifest does not read, or an empty value" },
            { code: 501, when: "this server has no credential writer" },
        ],
    },
    "DELETE /v1/agents/:id": {
        responses: { 200: AgentRemoved },
        summary:
            "Delete an agent for good: off this host, its rows out of the store, its directory off disk. Needs ?confirm=<id>.",
        statuses: [
            { code: 400, when: "no ?confirm=<id>" },
            { code: 409, when: "two sandbox directories declare this id" },
            { code: 501, when: "this server cannot delete agents" },
        ],
    },
    "POST /v1/agents/:id/stop": {
        responses: { 200: AgentSwitched },
        summary: "Switch an agent off durably and drop it from this host now.",
        body: StopBody,
        statuses: [{ code: 409, when: "a turn is running" }],
    },
    "POST /v1/agents/:id/start": {
        responses: { 200: AgentSwitched },
        summary: "Switch it back on and have this host adopt it.",
        statuses: [
            {
                code: 400,
                when: "the agent's manifest would not load; the row is put back to stopped",
            },
            { code: 501, when: "this server cannot look up manifests" },
        ],
    },
    "POST /v1/agents/:id/messages": {
        summary: "Start a turn. Returns once accepted; the turn runs detached.",
        body: MessageBody,
        success: 202,
        responses: {
            200: MessageAccepted,
            202: { json: MessageAccepted, sse: true },
        },
        headers: [
            {
                name: "Idempotency-Key",
                about: "1-255 printable ASCII characters unique to this logical message. A retry with the same key and the same text and session answers 200 with the original turn (`replayed: true`) and runs nothing; with different text it is a 409. Remembered for 24 hours.",
            },
        ],
        statuses: [
            {
                code: 200,
                when: "a replay of an Idempotency-Key already used for this message: the original turn, `replayed: true`",
            },
            {
                code: 202,
                when: "accepted: `{turnId, sessionKey}`, or with `stream: true` an event stream whose first frame is that object",
            },
            { code: 403, when: "a participant-bound key naming another sender in `from`" },
            {
                code: 409,
                when: "idempotency_key_reused: the key belongs to a turn with different text or session",
            },
            {
                code: 429,
                when: "over limits.maxConcurrentTurns or limits.tokens; nothing recorded",
            },
        ],
    },
    "POST /v1/agents/:id/deliveries": {
        success: 202,
        responses: { 202: DeliveryAccepted },
        summary:
            "Send exact text on one of the agent's channels, with no turn. It joins that conversation's history as the agent's.",
        body: DeliveryBody,
        statuses: [
            { code: 202, when: "queued, or already queued under this key" },
            { code: 404, when: "the agent has no running channel with that id" },
        ],
    },
    "POST /v1/agents/:id/turns/:turnId/stop": {
        summary: "Cooperatively stop a turn this API started.",
        success: 202,
        responses: { 202: TurnStopAccepted },
        statuses: [{ code: 409, when: "no cancel handle — a channel or schedule started it" }],
    },
    /**
     * The two SSE routes, which a generated document can only describe so far.
     *
     * OpenAPI has no vocabulary for an event stream's *frames*, so the summary says what the stream
     * is and `04-SPEC-WIRE.md` remains the place the event table lives — where it is checked
     * against `EVENT_TYPES` by a compile-time assertion, which is a stronger guarantee than any
     * prose here could be.
     */
    "GET /v1/agents/:id/turns/:turnId/stream": {
        summary: "One turn's events as SSE, replayed from the start and then live.",
        responses: { 200: "sse" },
        query: [
            { name: "chunks", about: "Include per-token frames. Off by default." },
            {
                name: "children",
                about: "Include the events of subagents this turn runs. Off by default.",
            },
            { name: "types", about: "Narrow to these event types, comma-separated." },
        ],
        statuses: [{ code: 200, when: "an event stream; see the event table in the wire spec" }],
    },
    "GET /v1/events": {
        summary: "Every event this process emits, as SSE. The firehose.",
        responses: { 200: "sse" },
        query: [
            { name: "agentId", about: "Narrow to one agent." },
            { name: "sessionKey", about: "Narrow to one conversation." },
            { name: "chunks", about: "Include per-token frames. Off by default." },
            { name: "types", about: "Narrow to these event types, comma-separated." },
        ],
        statuses: [
            { code: 200, when: "an event stream; see the event table in the wire spec" },
            { code: 400, when: "`types` names an event type that does not exist" },
            { code: 404, when: "`agentId` names no agent this key reaches" },
        ],
    },
    "GET /v1/agents/:id/approvals": {
        summary: "Questions waiting on a person, oldest first.",
        responses: { 200: ApprovalList },
    },
    "POST /v1/agents/:id/approvals/:approvalId": {
        responses: { 200: ApprovalDecided },
        summary: "Answer one blocked tool call.",
        body: ApprovalBody,
    },
    "POST /v1/keys": {
        summary: "Mint an operator key. The secret is returned once and never again.",
        body: KeyBody,
        success: 201,
        responses: { 201: KeyMinted },
        statuses: [{ code: 201, when: "minted" }],
    },
    "GET /v1/keys": {
        summary: "Every key, live and revoked. Never a secret.",
        responses: { 200: KeyList },
    },
    "DELETE /v1/keys/:keyId": {
        summary:
            "Revoke a key. A soft delete; the row survives, and revoking a revoked key answers its original stamp.",
        responses: { 200: KeyRecord },
    },
    "GET /v1/agents/:id/turns/:turnId": {
        summary: "One turn's stored row.",
        responses: { 200: TurnRecord },
    },
    "GET /v1/agents/:id/sessions": {
        summary: "Conversations, most recently active first.",
        responses: { 200: SessionList },
    },
    "GET /v1/agents/:id/sessions/:key": {
        summary: "One conversation's stored record.",
        responses: { 200: SessionRecord },
    },
    "GET /v1/agents/:id/sessions/:key/messages": {
        summary: "A page of a conversation's messages.",
        responses: { 200: MessagePage },
        query: [
            { name: "limit", about: "How many to return." },
            { name: "before", about: "Page backwards from this message id." },
        ],
    },
    "DELETE /v1/agents/:id/sessions/:key": {
        responses: { 200: SessionCleared },
        summary: "Drop a conversation's history, turns and derived index.",
    },
    "POST /v1/agents/:id/sessions/:key/phase": {
        responses: { 200: PhaseSet },
        summary: "Move a session into a declared phase.",
        body: PhaseBody,
    },
    "POST /v1/agents/:id/sessions/:key/compact": {
        summary:
            "Fold a conversation's older turns into a saved digest; the next turn starts from it, and every message stays stored.",
        body: CompactBody,
        responses: { 200: CompactResult },
        statuses: [
            {
                code: 409,
                when: "session_too_short: nothing older than the turns kept verbatim to fold",
            },
        ],
    },
    "POST /v1/agents/:id/sessions/:key/recall": {
        responses: { 200: RecallSet },
        summary: "Keep a conversation out of history recall, or put it back; its messages stay.",
        body: RecallBody,
    },
    "POST /v1/agents/:id/sessions/resolve": {
        summary:
            "The conversation a message naming this sessionKey would run in, before sending it; nothing changes.",
        body: ResolveBody,
        responses: { 200: ResolveResult },
        statuses: [{ code: 403, when: "a participant-bound key naming another sender in `from`" }],
    },
    "POST /v1/agents/:id/sessions/rotate": {
        summary:
            "Start the caller's conversation afresh on every surface (sessions.scope owner or peer).",
        body: RotateBody,
        responses: { 200: RotateResult },
        statuses: [
            { code: 403, when: "a participant-bound key naming another sender in `from`" },
            {
                code: 409,
                when: "session_not_rotatable: no conversation of the caller's to start afresh (sessions.scope channel-peer, or a sender with no person behind it)",
            },
        ],
    },
    "GET /v1/agents/:id/config": {
        responses: { 200: ConfigListing },
        summary: "Every manifest field this surface may set, what it does, and its current value.",
    },
    "PATCH /v1/agents/:id/config": {
        responses: { 200: ConfigApplied },
        summary: "Set one manifest field, then replace the agent so it takes effect.",
        body: ConfigBody,
        statuses: [
            { code: 409, when: "the field carries a confirm sentence and `confirm` was not true" },
            { code: 409, when: "the agent came from an object, so there is no manifest to edit" },
            { code: 400, when: "the path is not settable here, or the result would not validate" },
        ],
    },
    "PATCH /v1/agents/:id/channels/:channelId": {
        responses: { 200: ChannelPatched },
        summary: "Connect or disconnect a channel, and set its credential.",
        body: ChannelPatchBody,
        statuses: [
            {
                code: 400,
                when: "neither `enabled` nor `credential` was sent, or the channel is unknown",
            },
            { code: 409, when: "the agent came from an object, so there is no manifest to edit" },
            { code: 501, when: "the host supplied no channel actions" },
        ],
    },
    "POST /v1/agents/:id/channels/:channelId/unpair": {
        responses: { 200: ChannelUnpaired },
        summary: "Forget a channel's stored pairing, so the next start offers a new code.",
        statuses: [
            { code: 404, when: "this agent has no such channel" },
            { code: 409, when: "the channel stores no pairing — a typed credential is a PATCH" },
        ],
    },
    "GET /v1/agents/:id/schedules": {
        summary: "Every schedule, from the store.",
        responses: { 200: ScheduleList },
    },
    "POST /v1/agents/:id/schedules": {
        responses: { 201: ScheduleRecord },
        summary: "Create a schedule. Validated by the manifest's own schedule rules.",
        success: 201,
        statuses: [{ code: 201, when: "created" }],
    },
    "GET /v1/agents/:id/schedules/preview": {
        responses: { 200: SchedulePreview },
        summary:
            "What an expression means before it is written: the next instants, zone and jitter.",
        statuses: [{ code: 400, when: "an expression core's own parser refuses, with its hint" }],
    },
    "GET /v1/agents/:id/schedules/:sid": {
        summary: "One schedule's row.",
        responses: { 200: ScheduleRecord },
    },
    "PATCH /v1/agents/:id/schedules/:sid": {
        responses: { 200: ScheduleRecord },
        summary: "Replace a schedule the API created.",
        statuses: [
            { code: 409, when: "the manifest declares it, so reconciliation would undo the write" },
        ],
    },
    "DELETE /v1/agents/:id/schedules/:sid": {
        responses: { 200: ScheduleRemoved },
        summary: "Delete a schedule the API created.",
        statuses: [
            { code: 409, when: "the manifest declares it, so the next boot would re-create it" },
        ],
    },
    "POST /v1/agents/:id/schedules/:sid/run": {
        summary: "Fire a schedule now, out of band.",
        success: 202,
        responses: { 202: ScheduleRunAccepted },
        statuses: [{ code: 429, when: "over a governor limit; nothing recorded" }],
    },
    "GET /v1/agents/:id/tools": {
        summary: "The resolved catalogue, with trust and phases.",
        responses: { 200: ToolList },
    },
    "GET /v1/agents/:id/skills": {
        summary: "What the skills index holds.",
        responses: { 200: SkillList },
    },
    "GET /v1/agents/:id/context": {
        responses: { 200: ContextPreview },
        summary: "The prompt the next turn would be given, without running one.",
        query: [
            { name: "sessionKey", about: "Which conversation to assemble for." },
            { name: "input", about: "Pretend this is the next message." },
        ],
    },
    "POST /v1/channels/:channelId/webhook/:agentId": {
        responses: { 200: "text", 404: "text" },
        summary: "A channel provider's webhook. Open by design; the provider authenticates itself.",
    },
    "GET /v1/openapi.json": {
        summary: "This document.",
        responses: { 200: OpenApiDocument },
    },
    "GET /docs": {
        summary: "A browser reference over this document.",
        responses: { 200: "html" },
    },
}

/**
 * `GET /v1/ws`, which no `Router` route answers: the upgrade is taken in `serve.ts` before the
 * handler is reached, because a `Response` cannot be a WebSocket. Listed here by hand, and the only
 * such entry — `phantomRoutes` checks `DOCS` against the router, so this cannot live there without
 * reading as a summary for a route nothing registers.
 */
const EXTRA_PATHS: Readonly<Record<string, Record<string, unknown>>> = {
    "/v1/ws": {
        get: {
            summary:
                "The event stream over a WebSocket: the same events as GET /v1/events, plus subscribe and stop frames. Answered by serve(), not by an embedded handler.",
            description: `Authenticate with the subprotocol list a browser will send: \`new WebSocket(url, ["${PROTOCOL}", key])\`; the server echoes \`${PROTOCOL}\`. An \`Authorization\` header works for a client that can set one. \`?token=\` is still accepted and is deprecated, because a credential in a URL reaches access logs and \`Referer\`.`,
            parameters: [
                {
                    name: "Sec-WebSocket-Protocol",
                    in: "header",
                    required: false,
                    description: `\`${PROTOCOL}, <key>\`: the credential, for a browser.`,
                    schema: { type: "string" },
                },
                {
                    name: "agentId",
                    in: "query",
                    required: false,
                    description: "Narrow to one agent. Omitted, every agent this key reaches.",
                    schema: { type: "string" },
                },
                {
                    name: "chunks",
                    in: "query",
                    required: false,
                    description:
                        "Include per-token frames. Off by default; a subscribe frame can change it.",
                    schema: { type: "string" },
                },
                {
                    name: "token",
                    in: "query",
                    required: false,
                    deprecated: true,
                    description:
                        "The credential as a query parameter. Use the subprotocol instead.",
                    schema: { type: "string" },
                },
            ],
            responses: {
                "101": { description: "Switching protocols: the socket is open." },
                "401": errorResponse("No credential, or one this server does not accept."),
                "403": errorResponse("An origin or Host this server does not accept."),
                "404": errorResponse("`agentId` names no agent this key reaches."),
            },
        },
    },
}

/** Paths that are the browser surface rather than the API. See the module comment. */
function isApiPath(pattern: string): boolean {
    return pattern.startsWith("/v1/") || pattern === "/docs"
}

export interface RouteRef {
    readonly method: string
    readonly pattern: string
    /** From `Route.capability`; `"open"` drops the credential requirement from the operation. */
    readonly capability?: string
}

/** A route that exists and has no summary. Read by `spec.test.ts`, which fails on a non-empty list. */
export function undocumentedRoutes(routes: readonly RouteRef[]): readonly string[] {
    return routes
        .filter((route) => isApiPath(route.pattern))
        .map((route) => `${route.method} ${route.pattern}`)
        .filter((key) => DOCS[key] === undefined)
        .sort()
}

/** A summary for a route nothing registers — the other direction, and just as much a defect. */
export function phantomRoutes(routes: readonly RouteRef[]): readonly string[] {
    const real = new Set(routes.map((route) => `${route.method} ${route.pattern}`))
    return Object.keys(DOCS)
        .filter((key) => !real.has(key))
        .sort()
}

/** One status a route declares: what it means, and the body it carries, if any is described. */
export interface DeclaredResponse {
    readonly description: string
    readonly json?: z.ZodType
    /** The media type of a non-JSON body: `text/event-stream`, `text/plain`, … */
    readonly media?: string
}

const SUCCESS_TEXT: Readonly<Record<number, string>> = {
    200: "OK",
    201: "Created",
    202: "Accepted",
}

/**
 * Every status a route may answer, with its body — the document's `responses` and the harness's
 * contract are both this, so the two cannot describe different servers.
 *
 * The shared statuses are named here once rather than per route, because every route answers them
 * the same way and repeating them eighty times is the copy that comes to disagree:
 *
 * - `400` on a route that reads a body: not JSON, too large, or failing its schema.
 * - `401` and `403` on an authenticated route; `403` on an open one too, since the origin guard
 *   runs before every route when the server knows its bind.
 * - `404` on any path with a parameter, which is how an out-of-scope id answers as well.
 * - `500` on every route, carrying `internal_error`.
 *
 * `undefined` for a route this document does not describe — a plugin's, or the browser surface.
 */
export function declaredResponses(
    route: RouteRef,
): Readonly<Record<string, DeclaredResponse>> | undefined {
    if (!isApiPath(route.pattern)) return undefined
    const doc = DOCS[`${route.method} ${route.pattern}`]
    if (doc === undefined) return undefined

    const text: Record<string, string> = {}
    const note = (code: number, when: string) => {
        const key = String(code)
        text[key] = text[key] === undefined ? when : `${text[key]}; or ${when}`
    }
    for (const status of doc.statuses ?? []) note(status.code, status.when)
    const fallback = (code: number, when: string) => {
        if (text[String(code)] === undefined) note(code, when)
    }
    const success = doc.success ?? 200
    fallback(success, SUCCESS_TEXT[success] ?? "OK")
    for (const code of Object.keys(doc.responses ?? {})) {
        fallback(Number(code), SUCCESS_TEXT[Number(code)] ?? "See the schema.")
    }
    if (doc.body !== undefined) {
        fallback(
            400,
            "The body is not JSON, is over the size limit, or fails its schema: request_body_invalid, or the failing field's own code.",
        )
    }
    if (route.capability !== "open") {
        fallback(401, "No credential, or one this server does not accept.")
        fallback(
            403,
            "capability_required: a scoped key without this route's capability; or an origin or Host this server does not accept.",
        )
    } else {
        fallback(403, "An origin or Host this server does not accept.")
    }
    if (route.pattern.includes(":")) {
        fallback(
            404,
            route.pattern.includes(":id")
                ? "No such agent, or it is switched off, or it is outside this key's scope; or no such resource under it."
                : "No such resource, or one outside this key's scope.",
        )
    }
    fallback(500, "internal_error: not caused by the request. The server's log has the cause.")

    const out: Record<string, DeclaredResponse> = {}
    for (const [key, description] of Object.entries(text)) {
        const code = Number(key)
        const body = doc.responses?.[code]
        if (body === undefined) {
            // The one envelope on a failure. A success with nothing declared stays bare here, and
            // `scripts/check-docs.ts` refuses a document that has one.
            out[key] = code >= 400 ? { description, json: ErrorBody } : { description }
        } else if (typeof body === "string") {
            out[key] = { description, media: MEDIA[body].type }
        } else if ("json" in body) {
            out[key] = { description, json: body.json, media: MEDIA.sse.type }
        } else {
            out[key] = { description, json: body }
        }
    }
    return out
}

function errorResponse(description: string): Record<string, unknown> {
    return {
        description,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    }
}

/** A Zod schema as the document carries it. `$schema` is the document's to state, not each body's. */
function jsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
    // `io` matters: a schema with defaults describes a *different* shape going in than coming out.
    const { $schema: _, ...rest } = z.toJSONSchema(schema, { target: "draft-2020-12", io })
    return io === "output" ? withoutOpenEnds(rest) : rest
}

/**
 * A response schema is a loose object so a field added within `v: 1` does not fail the harness's
 * guard — and `additionalProperties: {}` is how JSON Schema spells that. Rendered, it is a
 * `[key: string]: unknown` row on every body and `property1: null` in every example, which reads as
 * a field the server sends. JSON Schema permits extra properties when the keyword is absent, so
 * dropping the open form says the same thing without the noise. A closed or typed one is kept.
 */
function withoutOpenEnds(node: unknown): Record<string, unknown> {
    const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(walk)
        if (typeof value !== "object" || value === null) return value
        const out: Record<string, unknown> = {}
        for (const [key, inner] of Object.entries(value)) {
            const open =
                key === "additionalProperties" &&
                typeof inner === "object" &&
                inner !== null &&
                Object.keys(inner).length === 0
            if (!open) out[key] = walk(inner)
        }
        return out
    }
    return walk(node) as Record<string, unknown>
}

/**
 * Build the document.
 *
 * `:id` becomes `{id}` because OpenAPI spells a path parameter differently from this router — the
 * one translation in here, and the reason it is a function rather than a constant.
 */
export function openapiDocument(input: {
    readonly routes: readonly RouteRef[]
    readonly serverUrl?: string
}): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {}

    for (const route of input.routes) {
        const doc = DOCS[`${route.method} ${route.pattern}`]
        const declared = declaredResponses(route)
        if (doc === undefined || declared === undefined) continue

        const openapiPath = route.pattern.replace(/:([A-Za-z0-9_]+)/g, "{$1}")
        const params = [...route.pattern.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
            name: match[1],
            in: "path",
            required: true,
            schema: { type: "string" },
        }))
        const query = (doc.query ?? []).map((entry) => ({
            name: entry.name,
            in: "query",
            required: false,
            description: entry.about,
            schema: { type: "string" },
        }))
        const headers = (doc.headers ?? []).map((entry) => ({
            name: entry.name,
            in: "header",
            required: false,
            description: entry.about,
            schema: { type: "string" },
        }))
        const parameters = [...params, ...query, ...headers]

        const responses: Record<string, unknown> = {}
        for (const [code, entry] of Object.entries(declared)) {
            if (Number(code) >= 400 && entry.json === ErrorBody) {
                responses[code] = errorResponse(entry.description)
                continue
            }
            const content: Record<string, unknown> = {}
            if (entry.json !== undefined) {
                content["application/json"] = { schema: jsonSchema(entry.json, "output") }
            }
            if (entry.media !== undefined) {
                const media = Object.values(MEDIA).find((m) => m.type === entry.media)
                content[entry.media] = {
                    schema: {
                        type: "string",
                        ...(entry.media === MEDIA.gzip.type ? { format: "binary" } : {}),
                        ...(media === undefined ? {} : { description: media.about }),
                    },
                }
            }
            responses[code] = {
                description: entry.description,
                ...(Object.keys(content).length === 0 ? {} : { content }),
            }
        }

        paths[openapiPath] ??= {}
        const operation: Record<string, unknown> = {
            summary: doc.summary,
            ...(parameters.length === 0 ? {} : { parameters }),
            ...(route.capability === "open" ? { security: [] } : {}),
            responses,
        }
        if (doc.body !== undefined) {
            operation.requestBody = {
                required: true,
                content: { "application/json": { schema: jsonSchema(doc.body, "input") } },
            }
        }
        paths[openapiPath][route.method.toLowerCase()] = operation
    }
    for (const [path, operations] of Object.entries(EXTRA_PATHS)) {
        paths[path] = { ...paths[path], ...operations }
    }

    return {
        openapi: "3.1.0",
        info: {
            title: "Dispach agent server",
            version: VERSION,
            description:
                "Generated from the router table and the request and response schemas — see openapi.ts. Every declared response body is checked against the handler by the server's test harness. The binding contract is docs/04-SPEC-WIRE.md, which is checked against the code.",
        },
        ...(input.serverUrl === undefined ? {} : { servers: [{ url: input.serverUrl }] }),
        components: {
            securitySchemes: {
                bearer: {
                    type: "http",
                    scheme: "bearer",
                    description: "An operator key or the configured token.",
                },
            },
            schemas: { Error: jsonSchema(ErrorBody, "output") },
        },
        security: [{ bearer: [] }],
        paths,
    }
}
