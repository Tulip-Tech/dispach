# Run with Docker

The image starts the runtime, the browser UI, and persisted state with no model call during boot. No checkout is needed. To install the command on your machine instead, see [Install and serve](install-and-serve.md).

## Start the server

```bash
export DISPACH_API_TOKEN="$(openssl rand -hex 32)"

docker run -d --init --name dispach -p 7420:7420 \
  -v dispach-home:/home/dispach \
  -e DISPACH_API_TOKEN \
  ghcr.io/moeen-mahmud/dispach:<version>
```

Use the version from the [releases page](https://github.com/moeen-mahmud/dispach/releases); pin it rather than using `latest`. The image binds every interface inside the container, so it refuses to start without `DISPACH_API_TOKEN`. `--init` reaps the processes the shell tool starts, and the `dispach-home` volume keeps agents, conversations, and keys when the container is removed.

The server is ready when this request succeeds:

```bash
curl --fail http://localhost:7420/v1/ready
```

Readiness does not require a model key. Dispach deliberately completes local startup before it connects to channels or remote tool catalogues.

## Authenticate API calls

```bash
export TOKEN="$DISPACH_API_TOKEN"

curl --fail \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:7420/v1/agents
```

Every endpoint is in the [HTTP API reference](../../reference/README.md). A running server also serves its own copy at `http://localhost:7420/docs`, which loads its viewer from a CDN, and the raw document at `/v1/openapi.json`.

The browser application is served from the same origin. To sign in, open the one-time claim link the server prints at start:

```bash
docker logs dispach
```

## With Compose

The repository's `docker-compose.yml` runs the same image with the containment settings described in the README:

```bash
git clone https://github.com/moeen-mahmud/dispach.git
cd dispach
cp .env.example .env        # set DISPACH_API_TOKEN to a long random value
docker compose up -d --wait
docker compose logs server  # the claim link
```

Compose pulls the published image; add `--build` only when you want to build from the checkout. It stores runtime data in a named volume. `docker compose down` stops the deployment without deleting that volume. `docker compose down -v` deletes it and should only be used when you intend to remove all runtime data.

Continue with [Create an agent](create-an-agent.md).
