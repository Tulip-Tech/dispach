# Build with Dispach

Dispach is a self-hosted agent runtime that your product calls over HTTP. One process can host many
agents; each agent has its own model, workspace, memory, tools, schedules, channels, and policy.

Choose the path that matches what you are building:

- [Install from npm and serve](quickstart/install-and-serve.md), or
  [run the server with Docker](quickstart/run-with-docker.md), and reach readiness without first
  configuring a model.
- Look up any endpoint in the [API reference](../reference/README.md).
- [Create an agent](quickstart/create-an-agent.md), then
  [send and stream a turn](quickstart/send-and-stream-a-turn.md).
- Check [stable and pre-releases](releases.md) before choosing an install or deployment tag.
- Use the [TypeScript client](guides/typescript-client.md) when Dispach sits behind an application.
- Read [runtime, agents, and sessions](concepts/runtime-agents-and-sessions.md) before designing a
  multi-tenant integration.
- Read [security and trust](concepts/security-and-trust.md) before enabling system or web tools.

This site documents the current 0.2.x release; [what's new since 0.2.0](whats-new-since-0-2-0.md) lists what each
release added. Experimental surfaces say so where they are described; the [release guide](releases.md)
explains the release lines. A server reports its exact version at `GET /v1/health`, and every endpoint
is in the [API reference](../reference/README.md).

Dispach is the runtime layer: it runs the model loop, executes tools, assembles and compacts context,
persists sessions, and applies control mechanisms. Your product still owns users, billing, product
authorization, and the experience around the agent.
