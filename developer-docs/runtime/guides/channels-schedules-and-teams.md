# Channels, schedules, and teams

Channels and schedules are inbound transports into the same turn lifecycle used by HTTP.

## Channels

Telegram, WhatsApp, Slack, Microsoft Teams, and A2A are first-party channel packages bundled with the binary; Slack, Teams, and A2A are experimental in 0.2.x. Other channels can ship as plugins. Channel connections start after runtime readiness so an unavailable network cannot block local boot.

Use `allowFrom` to restrict inbound senders. It has no effect on outbound permission: a bot still needs a valid destination and provider permission to deliver there.

```bash
dispach config allow milo @ada_lovelace
dispach channels list milo
```

## Schedules

Schedules support cron, interval, and one-shot triggers. Named time zones and daylight-saving transitions are handled by the scheduler. Manifest schedules are declarative; reconciliation restores their configured state after restart.

Validate a schedule through the CLI or configuration API before relying on it. The same parser runs for validation and execution, so an invalid cron expression cannot pass one path and fail the other.

## Teams and handoffs

Work moves between agents three ways:

- **`handoff`** sends one self-contained task to a `team` member, which returns a typed artifact. The member runs its own turn under its own manifest and policy. `handoff` is a mutating call, so it is never retried and the write gate applies to it in a turn tainted by untrusted output.
- **Subagents** are children of the same agent, started for a routed tool call or by the model with `delegate`, which fans up to eight tasks out to children that declare `spawn: true`. A child inherits the parent's taint, stand-in deferral and acting participant, runs only its own `tools`, and ends inside the parent call's deadline.
- **`ask_agent`** puts a free-form question to another agent the same person owns, when both declare `delegation.ask`. It is one hop: the asked turn cannot hand off or ask in turn.

None of these fences the receiving turn's input. Fencing, and a turn that starts tainted so the write gate applies from step one, belong to a message sent over HTTP with `from.kind: "agent"`. Persist handoff and turn identifiers when a product needs to show work across agents.

For an embeddable product, prefer HTTP and the typed client as the ownership boundary. A channel adapter should remain a transport, not the place where agent state or business authorization lives.
