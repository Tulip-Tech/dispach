# Configuration

`agent.yaml` is the declarative source for an agent. The loader rejects unknown or invalid values and reports a corrective hint.

| Area | Controls |
| --- | --- |
| Identity | `apiVersion` and `id` (required), `name`, a one-line `description` (at most 200 characters, shown to peers and in `GET /v1/agents`), and `extends`, a base manifest merged shallowly with arrays replaced |
| `model` | Roles, model IDs, endpoints, key environment names, and capabilities, including `promptStyle` and its `examplesIn` placement. `model.<role>.fallbacks` lists whole roles tried in order when the endpoint fails (unreachable, a 5xx, or 408/429 after retries) before the first chunk |
| `context` | Workspace tiers, budgets, soul selection, output reserve, observation size, and compaction thresholds as shares of the window: `context.thresholds.snip` <!-- fact:default:context.thresholds.snip -->0.6<!-- /fact -->, `micro` <!-- fact:default:context.thresholds.micro -->0.7<!-- /fact -->, `collapse` <!-- fact:default:context.thresholds.collapse -->0.8<!-- /fact -->, `reset` <!-- fact:default:context.thresholds.reset -->0.88<!-- /fact -->, `trim` <!-- fact:default:context.thresholds.trim -->0.95<!-- /fact --> |
| `tools` | Dialect, pinned providers and tools, policy, untrusted-write behavior, and provider settings |
| `phases` | Per-phase instructions, transitions, and visible tools |
| `skills` | Skill directories, selection, and which skills' scripts become tools |
| `knowledge` | Keyword-gated reference entries and their per-turn budget |
| `limits` | `maxSteps` (<!-- fact:default:limits.maxSteps -->40<!-- /fact -->), `noProgress`, `turnTimeoutMs` (<!-- fact:default:limits.turnTimeoutMs -->1800000<!-- /fact -->), `toolTimeoutMs` (<!-- fact:default:limits.toolTimeoutMs -->120000<!-- /fact -->), `maxParallelTools` (<!-- fact:default:limits.maxParallelTools -->4<!-- /fact -->, read-only tools only), `maxConcurrentTurns` (unlimited when absent; over it a turn is refused), `reloadHoldMs` (<!-- fact:default:limits.reloadHoldMs -->30000<!-- /fact -->), `maxHops` (<!-- fact:default:limits.maxHops -->4<!-- /fact -->, room reply depth), and `tokens` |
| `memory` | Store and retrieval behavior |
| `sessions` | `sessions.scope`: `channel-peer` (the key sent is the key used), `owner` (every turn from the assigned owner, on any surface, shares one conversation), or `peer` (the same per registered participant). The default is `<!-- fact:default:sessions.scope -->channel-peer<!-- /fact -->`; `init` writes `owner` |
| `schedules` | Cron, interval, and one-shot inbound triggers |
| `channels` | Transport configuration and inbound allowlists |
| `delivery` | Default and named outbound routing targets |
| `team` | Members a supervisor agent delegates to |
| `subagents` | Throwaway children of the same agent: started for routed tool calls, or by the model with `delegate` when a child declares `spawn: true` |
| `media` | Transcription, image generation, and spoken replies (experimental in 0.2.x) |
| `standIn` | Answering for a member while they are away (experimental in 0.2.x) |
| `delegation` | Delegation between members' agents (experimental in 0.2.x) |
| `plugins` | Packages loaded at boot and their configuration |
| `server` | HTTP binding and server behavior for the agent runtime |

Use the CLI field catalogue when possible:

```bash
dispach config list milo
dispach config set milo model.main.id gpt-4.1-mini
dispach validate milo
```

Secrets are values in the environment; configuration stores only their variable names. Plugins resolve at boot, and the runtime never installs packages on demand.

The authoritative field-by-field contracts are the Agent manifest specification and Workspace
specification. The current full example is `examples/reference/agent.yaml`.
