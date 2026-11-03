# What's new since 0.2.0

What 0.2.1 through the current 0.2.x release added on top of [0.2.0](whats-new-0-2-0.md). Everything is additive: a manifest, store, or client written for 0.2.0 keeps working. The [changelog](https://github.com/moeen-mahmud/dispach/blob/main/CHANGELOG.md) has every entry, each release's store migrations, and its "Upgrading" notes.

## 0.2.3

- **Fan-out with `delegate`.** The model sends up to 8 tasks to its own subagents in one call. Each runs in a fresh context and returns one finding. A child opts in with `subagents[].spawn: true`. Read-only children run together, and a child that can write runs its tasks one at a time. See [Channels, schedules, and teams](guides/channels-schedules-and-teams.md).
- **Session checkpoints.** When compaction reaches its `reset` stage, the digest is saved and the next turn starts from it instead of compacting the whole history again. `POST /v1/agents/:id/sessions/:key/compact` saves one on demand. Every message stays stored. See [Turn lifecycle](concepts/turn-lifecycle.md).
- **`POST /v1/agents/:id/sessions/resolve`** answers which session key a turn would run in before you send it.

## 0.2.2

- **One conversation per person.** `sessions.scope: owner` puts the owner's turns from Telegram, WhatsApp, the web, the terminal, and the API into one session. The `202` from `POST …/messages` returns the key the turn actually runs in. See [Runtime, agents, and sessions](concepts/runtime-agents-and-sessions.md).
- **Peer ask.** `ask_agent` lets an agent ask another agent working for the same person and get the reply as text, one hop.
- **Shared memory for one person's agents** (`agents:<owner>`, `memory.shared`).
- **Web console pages** for schedules, tools, usage, turns, people, rooms, actions, memory, webhooks, keys and backup, with Markdown replies.
- **Install without Node**: a standalone archive per platform and `install.sh`. See [Install and serve](quickstart/install-and-serve.md).
- **Bedrock** through `init --preset bedrock --region <region>`.

## 0.2.1

- Fixes: a phase set over HTTP takes effect on the next turn, and WhatsApp pairing errors name their own code.
