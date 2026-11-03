# Install and serve

Install the command from npm, create an agent, and start the HTTP server on `127.0.0.1:7420`. This needs Node 24 or later. For a container instead, see [Run with Docker](run-with-docker.md).

## Install

```bash
npm install --global dispach
dispach --version
```

Homebrew (`brew install moeen-mahmud/tap/dispach`) and a standalone archive with its own Node (`curl -fsSL https://github.com/moeen-mahmud/dispach/releases/latest/download/install.sh | sh`) install the same command. The [README](https://github.com/moeen-mahmud/dispach#install) lists every route.

## Create an agent

```bash
dispach init
```

`init` asks for your name, the agent's name, a model endpoint, and the key, which it writes to the agent's `.env` with mode `0600`. The agent lands in `~/.dispach/agents/<name>`. `dispach init --yes --name milo` takes every default without asking.

On macOS, the default answer to "Keep it running in the background?" installs a LaunchAgent that serves every agent on `127.0.0.1:7420` and starts at login. Pass `--daemon none` to skip it, and `dispach daemon uninstall` removes it later. If you installed with Homebrew and use `brew services start dispach`, pass `--daemon none`: two background servers contend for the same agents.

## Start the server

Skip this step if `init` installed the background service.

```bash
dispach serve
```

```
Dispach serving on http://127.0.0.1:7420
  web UI http://127.0.0.1:7420/ · API reference http://127.0.0.1:7420/docs
  milo — no channels
  open once to claim this server:
    http://127.0.0.1:7420/?claim=dispach_…
    without a browser: curl -sX POST http://127.0.0.1:7420/v1/keys -H 'Authorization: Bearer dispach_…' -H 'content-type: application/json' -d '{"label":"my browser"}'
  ctrl-c to stop — this ends when the terminal does. `dispach daemon install milo` keeps it running.
```

`serve` hosts every agent in `~/.dispach/agents`. An agent whose model key is still blank is reported as not served; the server still starts.

## Check it

```bash
curl --fail http://localhost:7420/v1/ready
```

```json
{"status":"ready","agents":1}
```

`/v1/ready` and `/v1/health` need no credential. Every other route does, even on loopback. Open the claim link from the banner once in a browser, or run the `curl` line under it, which mints an API key and prints it:

```bash
export TOKEN='dispach_…'   # the "secret" field from that response
```

## Keep it running on Linux

```bash
dispach daemon install milo
```

This writes a systemd user unit and prints three commands to run yourself: `systemctl --user daemon-reload`, `systemctl --user enable --now <unit>`, and `loginctl enable-linger <user>`. Without lingering, the server stops when you log out.

Continue with [Send and stream a turn](send-and-stream-a-turn.md). Every endpoint is in the [HTTP API reference](../../reference/README.md).
