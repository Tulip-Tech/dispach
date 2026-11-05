# 25 — Fan-out subagents, and compacting a session on demand

Status: **accepted and built** (Moeen, 2026-11-02; issue #99; decisions 15.20, 15.21). Phase 37,
0.2.3. Asked for by VelaCrew. This document is binding the way `02` and `04` are: a field, route, or
event it names changes here in the same PR as the code.

## The problem

A person asks the agent to research several things. Today all of it lands in one context: every
search result, every fetched page, all of it billed on every later step and every later turn.

The runtime already has the pieces for a better shape: a child of the same agent, in its own
session, returning one artifact (pilot.6, `team/subagents.ts`). But a child starts only when the
parent calls a **routed tool**, the harness's decision. Nothing lets the model say "these three
questions, separately". VelaCrew wants that Claude Code shape: N tasks, N small contexts, N
findings handed back.

Separately, VelaCrew wants a "compact now" control for a long chat. Reading the code for it found
that compaction has nothing durable to act on (see Part 2), so that half is a design, not a route.

## What exists (read from the code at 145cb09)

- **A routed child** is `Agent.#subagent` (`runtime/agent.ts:1146-1182`). It runs `#send` with:
  - the child's `tools` as `toolsAllow`;
  - `child.model`, else `model.subagent`, else main;
  - the parent's stand-in deferral and taint;
  - `usageRole: "subagent"` and `parent: {turnId, sessionKey}`.
  - It reuses `runHandoff` with `sessionPrefix: "subagent"`, `kind: "self"`, `callId` and the
    acting participant (`team/subagents.ts:75-117`).
- **Depth 1 is structural.** A child gets the unrouted runtime (`agent.ts:1096`).
- **A child bypasses the governor.** It calls `#send`, not `send`, so it takes no
  `maxConcurrentTurns` slot (`agent.ts:1333`). It has its own session key, so the per-key lock
  never makes it wait on its parent.
- **Parallelism exists only through `batch()`** (`tools/execute.ts:632`). Consecutive read-only
  calls run together, up to `limits.maxParallelTools` (default 4). A routed tool keeps its own spec,
  so N routed reads in one step already run N children at once.
- **Nesting in a view needs no new event.** A child's events carry `parentTurnId` and
  `parentSessionKey` in the envelope (`events/types.ts:20-22`). `POST /messages {children: true}`
  includes them in the stream. `handoff.start` and `handoff.result` carry `kind`, `name` and
  `callId` (`events/types.ts:215-245`).

---

## Part 1 — `delegate`: the model fans out

### Manifest

```yaml
subagents:
  - name: researcher
    task: Research one question on the web and report what you found, with sources.
    tools: [web_search, web_fetch]
    spawn: true          # new: the model may start this child with delegate(). Default false.
    model: fast          # optional, as today
    maxSteps: 12         # optional, as today
    timeoutMs: 180000    # optional; for a spawned child, the bound on each task
```

- `spawn: boolean`, default `false`. With at least one `spawn: true` child, the agent gets the core
  tool `delegate`.
- `route` becomes optional. A child must declare `route`, `spawn: true`, or both; neither is
  refused at load (`subagent_unreachable`). A child that is routed and spawnable runs the same
  configuration whichever way it starts.
- Every existing rule still applies: each tool must be pinned or local, and each routed slug
  belongs to one child (`validateManifest`).
- Written through `PATCH /config` path `subagents`, a person-only row. `config_set` refuses it,
  as today (`manifest/settings.ts:346`). So `spawn` needs no new setting.
- `init` writes nothing new. A generated agent has no `subagents`.

### The tool

```
delegate(tasks)
  tasks  array, 1..8, each:
    task      string, required: everything the child needs. It sees nothing of this conversation.
    subagent  string, enum of spawn children's names. Omitted from the schema when there is only one.
    label     string, optional, ≤ 60 chars: how this task is named back ("pricing", "competitors").
```

- **One call carries every task.** Moeen's choice (2026-11-02): a small model makes one call more
  reliably than N parallel ones, and N calls in one step is the shape `batch()` needs but nothing
  guarantees. The handler runs the tasks itself.
- **Concurrency inside the handler.** Tasks for a child whose tools are all read-only run
  concurrently, at most `limits.maxParallelTools` at a time. Tasks for a child holding any
  mutating tool run one after another, after the read-only ones. This is the same rule `batch()`
  applies (decision 10.11's reason: children share a filesystem and `exec`).
- **`mutating`** is true when any spawn child holds a mutating tool, else false. It is fixed at
  load, because a spec cannot vary per call. A mutating `delegate` runs alone in its step, is never
  retried, and is refused in a tainted turn under `onMutate: refuse`, as `handoff` is.
- **Trust.** The observation is `untrusted` when any task's child saw untrusted content. This is
  `routedTool`'s `trustOf` rule, applied per call. It can only lower trust.
- **No policy argument.** `tasks` is an array, and a policy rule matches one scalar. `deny
  delegate` refuses the whole tool; narrowing which children it may start is the manifest's job.
- **The cap of 8** bounds one call's cost. It is a constant, not a setting, until someone needs
  more (`delegate_tasks_invalid` names it).
- **Description**, slot 1: one line per spawn child, giving its name, its task and its tools. It
  also says the child starts with nothing from this conversation.
- **Deadline.** The call is bounded by `max(timeoutMs)` over the spawn children, else
  `limits.toolTimeoutMs`. That uses `ToolRuntime.timeoutFor`, the mechanism routed children
  already use. Each task's child ends 5 s before its own bound (`SUBAGENT_DEADLINE_MARGIN_MS`), so
  it reports a timeout rather than being abandoned.

### Each task

- `runHandoff` with the existing `#subagent` runner. Task text: the child's `task`, then
  `## Your task`, then the model's `task` string.
- The child gets a fresh `subagent:<runId>` session, its `tools` plus `submit_artifact`, and the
  default `{summary}` artifact unless it declares one.
- It inherits taint, stand-in deferral, the acting participant, the policy and the parent's
  cancel signal, exactly as a routed child does.
- Depth 1: the child's runtime is the unrouted one and its `toolsAllow` is its own `tools`, so it
  never sees `delegate`, `handoff` or `ask_agent`.
- Usage rows carry `role: "subagent"`, as today.

### What the parent reads

One observation, one section per task, in the order given:

```
3 tasks ran in subagents.

### pricing (researcher): ok
{"summary": "…"}

### competitors (researcher): stopped (max_steps) after 12 steps
It got as far as: …  Transcript: session subagent:01J…

### hiring (researcher): failed
The fetch timed out.  Transcript: session subagent:01J…
```

- A task that fails is a section, not a thrown call: two good answers are not lost to a third.
- Only when **every** task fails does the call throw (`delegate_failed`). Its hint names the
  sessions, and says that calling again with the same tasks will end the same way.
- The parent's prompt never holds a transcript, asserted on the request body, as 10B did.

### Events and views

- `handoff.start` and `handoff.result` gain an optional `index`: the task's position in the call.
  They are emitted once per task with `kind: "self"`, `name`, `callId` and the task's `label`
  (new, optional). Both fields are additive within `v: 1`; the spec rows and `EVENT_TYPES`'s test
  change with them.
- The child's own events already nest through `parentTurnId`/`parentSessionKey`. A view groups
  them by `callId`, then `index`.
- **Web console:** a `delegate` tool row renders as a collapsible "Researching 3 things" block,
  with one line per task (label, status, steps, tokens), expandable to that child's steps. This is
  docs/19 §5's block.
- **TUI:** the same one-line-per-task summary. Expansion is a non-goal here.

### Errors (each with a hint)

`subagent_unreachable` (load), `delegate_tasks_invalid` (empty, more than 8, or a task without
text), `delegate_subagent_unknown`, `delegate_failed`.

---

## Part 2 — compacting a session on demand

### What the code does today

- **Compaction rewrites the prompt and never the store** (CLAUDE.md, "Compaction rewrites the
  prompt, never the store").
  - Every turn assembles the whole stored history and runs the ladder over it again.
  - The digest a `collapse` or `reset` writes is a prompt-only message (`origin: "digest"`,
    `compaction/stages.ts:471,498`), and nothing caches it (`agent.ts:505-522`).
- **So a long session repays its compaction on every turn.** A configured compactor model is
  called again each turn the history is over `collapse` (`compaction/ladder.ts:164-184`).
- **So a "compact now" route would have nothing to write.** Running the ladder outside a turn
  changes nothing the next turn reads.
- **A model digest needs a declared compactor.** Without `model.compactor` the ladder writes a
  mechanical digest, because asking the busy main model mid-turn is how compaction overflows the
  window (`agent.ts:3011-3018`). The role itself falls back to main (`model/roles.ts:4`), but
  compaction does not use that fallback.

### Design: a session checkpoint

- **Migration 35:** `session_checkpoints (agent_id, session_key, through_message_id, digest TEXT,
  source TEXT, tokens INTEGER, created_at TEXT, PRIMARY KEY (agent_id, session_key))`. It is purged
  with the agent and cleared with the session.
- **Assembly.** With a checkpoint, history is one `origin: "digest"` message holding the digest,
  then the messages after `through_message_id`. The ladder runs on that, as it does now. The store
  keeps every message: the transcript, `GET …/sessions/:key`, recall indexing and `memory_forget`
  are unchanged.
- **The route:** `POST /v1/agents/:id/sessions/:key/compact`, capability `write`, body
  `{keepTurns?: integer ≥ 1, default 2}`.
  - It runs under the session's per-key lock, so it waits for a running turn and never races one.
  - It digests everything before the last `keepTurns` turn starts, with the compactor model if one
    is declared, else mechanically (and says which).
  - It writes or replaces the checkpoint, and emits `session.compacted`.
  - It answers `200 {sessionKey, before, after, digest: "model"|"mechanical", keptTurns}`.
  - A session too short to compact answers `409 session_too_short`.
  - An unknown session answers `404`.
- **Event:** `session.compacted {before, after, digest, keptTurns}`, a new type (append-only in
  `v: 1`). It is not a new `compaction.stage` member: a client's exhaustive switch over that union
  would break.
- **Wire:** `SessionSummary` gains an optional `compactedAt`.
- **Client:** `compactSession(agentId, key, {keepTurns?})`.
- **Web console:** a "Compact" action on a session.
- **Caching.** The history moves once, at the checkpoint, and is byte-stable after it, where today
  a session over `collapse` re-digests every turn. Slots 0 and 1 are untouched.
- **A clear removes the checkpoint;** a rotation leaves the old session's checkpoint where it is.

### The automatic `reset` writes a checkpoint too

Decided by Moeen, 2026-11-02.

- When the ladder's `reset` stage changes history during a turn, the turn ends by writing the
  session's checkpoint the way the route does, keeping **one** turn: `reset` fired because the last
  two did not fit, so keeping two (as `collapse` and the route's default do) would leave the next turn
  over `reset` again.
- Only `reset` writes one: `snip` and `micro` leave `artifact_read` pointers and lose nothing, and
  `collapse` keeps the request spine. Only `reset` replaces the history, so only `reset` repays its
  work on every later turn.
- **Why this is needed, not just tidier.** Without it, a session whose history is over `reset`
  fires `reset` on every turn. That costs a compactor call per turn when one is declared. It also
  emits `context.reset`'s "more than once" warning every turn from the second
  (`loop/turn.ts:959-977`). VelaCrew's 100k thresholds hit exactly this.
- **The checkpoint is written after the turn's messages are stored, under the per-key lock.**
  A crash before the write loses only the checkpoint; the next turn recomputes it.
- **`context.reset`'s count** then means "resets of a session that had already been checkpointed".
  A second one is still the configuration problem its warning names.
- **Acceptance addition:** a session pushed past `reset` fires it on one turn, writes a checkpoint,
  and does not fire it on the next turn. The next turn's request body starts from the saved digest.

## Non-goals

- Grandchildren, or `delegate` inside a child.
- A child that talks to the person, or asks the parent anything back.
- Children of a *different* agent: that is `handoff` (members) and `ask_agent` (peers).
- Rewriting or deleting stored messages on compaction.
- TUI expansion of a child's steps (`/compact` and the nested view come later).

## Acceptance

1. A manifest with one `spawn: true` child gets `delegate`; one with none does not. A child with
   neither `route` nor `spawn` is refused by `validate` and `run` alike.
2. `delegate` with 3 tasks on a read-only child runs them concurrently: a fake tool's start times
   overlap, capped at `maxParallelTools`. On a mutating child they run in sequence.
3. The parent's next request body holds three artifacts and no child transcript.
4. One failed task among three returns two answers and one failure. Three failures throw
   `delegate_failed`.
5. The child inherits taint (revert-checked), the acting participant (the MCP header seen by a fake
   server), stand-in deferral and cancel (stopping the parent stops all children).
6. `handoff.start` and `handoff.result` carry `index` and `label`. A `children: true` stream
   carries the children's events with `parentSessionKey`.
7. `POST …/compact` on a 40-turn session writes a checkpoint. The next turn's request body holds
   the digest and the last 2 turns. `GET …/sessions/:key` still returns all 40.
8. A compact during a running turn waits for it. A compact of a 1-turn session answers `409`.
9. Every existing subagent, compaction and session test passes unchanged.

## Decisions

- 15.20 — `delegate(tasks[])`: one call that fans out, opt-in per child (`spawn`), parallel only
  for read-only children.
- 15.21 — Session checkpoints: compaction's first durable state. The store stays canonical, and
  the prompt starts from the checkpoint.
