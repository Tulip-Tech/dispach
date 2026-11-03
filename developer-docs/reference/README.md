# API reference

Every HTTP endpoint the runtime serves, <!-- fact:endpoints -->90<!-- /fact --> operations, is listed in this section's sidebar under **HTTP API**, grouped by resource. Each page gives the request body, parameters, the success response body, every status the route returns, and the error shape. They are generated from the server's registered routes and the same Zod schemas the server validates requests with, and the server's test suite checks every response it produces against the declared schema, so a page cannot describe a body the server does not send.

Start with these:

- `POST /v1/agents/{id}/messages` starts a turn. The `202` body is `{turnId, sessionKey}`; keep the turn ID.
- `GET /v1/agents/{id}/turns/{turnId}/stream` streams that turn's events over SSE.
- `GET /v1/agents/{id}/turns/{turnId}` reads the finished turn.
- `POST /v1/keys` mints an API key.

`GET /v1/ready` and `GET /v1/health` need no credential; every other route takes `Authorization: Bearer <key>`. A running server also serves the raw document at `/v1/openapi.json` and a browser for it at `/docs`, which loads its viewer from a CDN.

The binding contracts behind these pages:

- [Agent manifest specification](https://github.com/moeen-mahmud/dispach/blob/main/docs/02-SPEC-MANIFEST.md): every `agent.yaml` field.
- [Plugin API specification](https://github.com/moeen-mahmud/dispach/blob/main/docs/03-SPEC-PLUGIN-API.md): the extension contract.
- [Wire protocol specification](https://github.com/moeen-mahmud/dispach/blob/main/docs/04-SPEC-WIRE.md): routes, events, and the WebSocket.
- [Workspace specification](https://github.com/moeen-mahmud/dispach/blob/main/docs/07-SPEC-WORKSPACE.md): workspace file tiers and authoring rules.

The guides cover [events and streaming](../runtime/reference/events-and-streaming.md), [configuration](../runtime/reference/configuration.md), and [errors](../runtime/reference/errors.md).

The generated document's `info.version` is the release the source tree was last cut as; `bun run release` regenerates it. To match a contract to a running server, use `GET /v1/health` on the deployed image.
