# Events and streaming

Events use an append-only type catalogue within wire version `v: 1`. Every event has the same envelope:

```ts
{
  v: 1,
  ts: string,              // RFC 3339 UTC
  runtimeId: string,
  agentId?: string,
  sessionKey?: string,
  turnId?: string,
  stepId?: string,
  parentTurnId?: string,     // a subagent's events: the turn that ran it
  parentSessionKey?: string,
  type: string,
  data: unknown              // type-specific
}
```

The catalogue, by family:

| Family | Types |
| --- | --- |
| `runtime` | `runtime.ready`, `runtime.stopping`, `runtime.released` |
| `store` | `store.ready` |
| `agent` | `agent.loaded`, `agent.disposed`, `agent.reloaded`, `agent.warning`, `agent.tools.refreshed`, `agent.channel.status`, `agent.channel.error`, `agent.channel.rejected`, `agent.assigned` |
| `plugin` | `plugin.loaded`, `plugin.slow` |
| `tools` | `tools.refreshed` |
| `turn` | `turn.start`, `turn.end` |
| `model` | `model.call`, `model.chunk`, `model.retry`, `model.fallback`, `model.result` |
| `tool` | `tool.usage`, `tool.call`, `tool.result`, `tool.gated`, `tool.repair` |
| `context` | `context.assembled`, `context.dropped`, `context.pressure`, `context.reset` |
| `compaction` | `compaction.stage` |
| `session` | `session.compacted` |
| `phase` | `phase.changed` |
| `memory` | `memory.read`, `memory.recalled`, `memory.forgotten` |
| `approval` | `approval.requested`, `approval.resolved` |
| `action` | `action.deferred`, `action.decided` |
| `handoff` | `handoff.start`, `handoff.result` |
| `peer` | `peer.ask`, `peer.answer` |
| `conversation` | `conversation.message`, `conversation.skipped` |
| `delivery` | `delivery.sent`, `delivery.retry`, `delivery.failed`, `delivery.uncertain` |
| `schedule` | `schedule.fired`, `schedule.skipped`, `schedule.deferred`, `schedule.error`; `schedules.reconciled` |
| `media` | `media.result` |
| `error` | `error` |

`turn.end.data.reason` is one of `final`, `max_steps`, `no_progress`, `truncated`, `stopped`, `timeout`, or `error`. A failed turn also emits `error` with the code, message, and hint.

## SSE control frames

These frames are written by the server around the event stream. They are not in the catalogue and never reach webhooks.

| Frame | When |
| --- | --- |
| `turn.accepted` | First frame of `POST /v1/agents/:id/messages` with `stream: true`: the same `{turnId, sessionKey}` the non-streaming `202` returns |
| `stream.replay` | Before replayed frames on a turn stream: how many events were replayed, whether early ones were dropped, and whether token history is complete |
| `stream.ended` | Turn stream for a turn that finished and has no buffer here; carries the final status |
| `stream.unavailable` | Turn stream with no buffer in this process for a turn that is still running, or whose buffer is gone; read the turn resource instead |
| `stream.subscribed` | First frame of `/v1/events`: the agent and type filter and whether chunks are on |

Every SSE stream also sends a `: ping` comment every 15 seconds so proxies do not close an idle connection. SSE clients ignore it.

## Turn streams

`GET /v1/agents/:id/turns/:turnId/stream` is an SSE stream for one turn. A turn ID that does not exist answers `404 turn_not_found`. Query parameters:

- `chunks=true` opts that connection into per-token `model.chunk` events.
- `children=true` includes the events of subagents the turn ran; they carry `parentTurnId`.

Turn execution is detached from this connection. Reconnect with the same turn ID or read the stored turn resource.

## Runtime event stream

`GET /v1/events` streams every event the key can reach. `agentId` narrows it to one agent, `types` to a comma-separated list of catalogue types (an unknown type is refused with `400 unknown_event_type`), and `chunks=true` adds `model.chunk`; naming `model.chunk` in `types` also turns chunks on. `/v1/ws` carries the same events over a WebSocket. Webhooks use the same catalogue but accept only webhook-eligible types.

In TypeScript, `dispach/wire` exports the types `AnyEvent`, `EventEnvelope`, `EventType`, `EventDataMap`, `EventContext`, and `TurnEndReason`, the `EVENT_TYPES` list, `parseSSE`, `endNote` and `endedBadly` for describing how a turn ended, and the stream filters `createNltStreamFilter` and `passThroughFilter`, which strip NLT tool-call blocks out of `model.chunk` text. Or consume the discriminated stream items returned by `dispach/client`.

The authoritative schemas and delivery rules are in the Wire protocol specification. The current
endpoint shapes are in the [generated HTTP API](../../reference/README.md).
