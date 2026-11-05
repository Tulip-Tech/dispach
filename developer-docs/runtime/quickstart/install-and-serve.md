# Install and serve

Install the command, create an agent, and start the HTTP server on `127.0.0.1:7420`. For a container instead, see [Run with Docker](run-with-docker.md).

## Install

With Node <!-- fact:node -->24<!-- /fact --> or later:

```bash
npm install --global dispach
dispach --version
```

Without Node, one line installs a standalone build that carries its own Node (macOS and Linux, arm64 and x64, no root):

```bash
curl -fsSL https://github.com/moeen-mahmud/dispach/releases/latest/download/install.sh | sh
```

It checks the archive against the release's `SHA256SUMS`, unpacks it into `~/.dispach/versions/<version>`, links `~/.dispach/bin/dispach`, and adds that directory to `PATH` in your shell's rc file, saying which. Open a new shell, or run the line it prints, before `dispach --version`. Run it again to upgrade; `DISPACH_VERSION=<version>` pins a release.

Homebrew (`brew install moeen-mahmud/tap/dispach`) installs the same command. The [README](https://github.com/moeen-mahmud/dispach#install) lists every route.

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
