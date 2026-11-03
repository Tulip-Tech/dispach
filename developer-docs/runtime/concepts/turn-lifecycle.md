# Turn lifecycle

Every inbound message follows the same path whether it came from HTTP, a channel, or a schedule:

```text
resolve agent and session
  -> assemble budgeted context
  -> call the model
  -> parse and validate tool calls
  -> execute allowed tools
  -> append observations and repeat
  -> deliver through the idempotent outbox
  -> persist the result
```

## Acceptance and execution

The HTTP message endpoint returns `202` after the turn has been accepted. Execution continues independently. The runtime records lifecycle and tool events while the turn is live and persists its final status and text.

Limits in the manifest bound steps, time, output, and context pressure. When context approaches its threshold, the harness applies progressive compaction rather than waiting for one emergency summary. The five stages run in order of how much they destroy, each at its own share of the window (`context.thresholds`): `snip` (<!-- fact:default:context.thresholds.snip -->0.6<!-- /fact -->) and `micro` (<!-- fact:default:context.thresholds.micro -->0.7<!-- /fact -->) move large observations out behind an `artifact_read` pointer, `collapse` (<!-- fact:default:context.thresholds.collapse -->0.8<!-- /fact -->) and `reset` (<!-- fact:default:context.thresholds.reset -->0.88<!-- /fact -->) replace older history with a digest, and `trim` (<!-- fact:default:context.thresholds.trim -->0.95<!-- /fact -->) drops history outright. Pinned instruction blocks survive every stage, and so do the person's own requests.

When `reset` fires, its digest is saved as the session's checkpoint, keeping the current turn verbatim, so later turns start from it instead of compacting the whole conversation again. `POST /v1/agents/:id/sessions/:key/compact` saves one on demand, keeping the last two turns by default. Every message stays stored.

## Completion

A turn ends with one of these reasons: `final` (an answer), `stopped` (an explicit stop), `max_steps` (the step budget ran out), `no_progress` (the same call repeated without progress), `truncated` (the reply hit an output limit), `timeout`, or `error`. A model that declines to answer ends as `error` with the code `model_refused`. A caller should handle all of them. Treat the stored turn resource as the final record. A stream is a live view that may begin late or reconnect after its buffer has lost early frames.

## Delivery

Channel delivery is routed through an outbox with derived idempotency keys. Persisting an outbound
item before delivery prevents duplicate enqueue and lets the runtime recover unfinished work after a
crash.

Exactly-once delivery still depends on the channel provider. If a process dies after sending bytes
but before receiving the provider acknowledgement, a recovered item is retried and marked
`uncertain`. A provider with idempotent sends can deduplicate that retry; Telegram cannot, so that
specific crash window can produce a duplicate rather than silently lose the reply.
