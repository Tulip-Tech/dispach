# Runtime, agents, and sessions

Dispach has four different identifiers that an integration should keep separate.

| Concept | Lifetime | Responsibility |
| --- | --- | --- |
| Runtime | Process | Loads agents, owns stores, executes turns, and exposes transports |
| Agent | Configuration and workspace | Defines model, tools, policy, limits, identity, and memory |
| Session | Conversation | Groups messages and history under an agent |
| Turn | One accepted input | Runs the model/tool loop to a terminal result |

One runtime can host many agents. Each agent owns independent configuration and persistent data. An agent can have many sessions, and each session can contain many turns.

The API chooses `api:default` when a sender does not provide a session key. A product with its own conversations should choose stable session keys and store them with its conversation records.

The key a turn runs in can differ from the one sent. `sessions.scope` decides: the schema default is <!-- fact:default:sessions.scope -->channel-peer<!-- /fact -->; under `channel-peer` the key sent is the key used; under `owner`, which `init` writes, every turn from the agent's assigned owner, from any channel, the web console, or the terminal, lands in one `owner:` conversation; `peer` does the same for each registered participant. The `202` from `POST /v1/agents/:id/messages` returns the `sessionKey` actually used, and `POST /v1/agents/:id/sessions/resolve` answers the same question before sending, changing nothing. A client that follows a turn's events by session key should follow that key, not the one it sent.

Turns are detached from connections. Losing an SSE stream or closing a browser does not change turn ownership or lifetime; the caller reattaches by agent ID and turn ID.

Agent IDs and session keys are routing identifiers, not authorization. Use [scoped operator keys and deployment isolation](security-and-trust.md) for access control.
