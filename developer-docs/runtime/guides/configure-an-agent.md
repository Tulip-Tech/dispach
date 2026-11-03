# Configure an agent

An agent is a validated manifest plus workspace files and secret environment values. Start with the generator instead of copying the full schema by hand.

## Generate and validate

```bash
dispach init
dispach validate milo
```

For an isolated experiment, relocate the entire runtime home:

```bash
DISPACH_HOME=/tmp/dispach-sandbox dispach init
DISPACH_HOME=/tmp/dispach-sandbox dispach run
```

## Edit supported settings

```bash
dispach config milo
dispach config list milo
dispach config set milo model.main.id gpt-4.1-mini
dispach config env milo MODEL_API_KEY
```

The interactive editor and HTTP configuration endpoint use the same field catalogue. Validation happens before a file is replaced. The HTTP response reports persistence and activation separately: `applied: false` means the file was saved and the change is not yet in force, and `pending.code` says why:

- `reload_pending`: turns were running. The reload applies by itself once they finish; they complete on the settings they started with. Watch for `agent.reloaded`; nothing needs to be called.
- `agent_not_running`: the agent is stopped. `POST /v1/agents/:id/start` loads it from the files as they are now.
- Any other code is the reload refusing the new files, for example a workspace file over budget. Fix the cause, then `POST /v1/agents/:id/reload` or restart the agent.

## Model endpoint shape

`baseUrl` ends at the API version segment. Dispach appends `/chat/completions`:

```yaml
model:
  main:
    id: gpt-4.1-mini
    baseUrl: https://api.openai.com/v1
    apiKeyEnv: MODEL_API_KEY
```

Keep the secret in the named environment variable. A literal key in the manifest fails validation.

The model's tool dialect is explicit configuration. The schema default is `nlt`, but `init` writes `native` where the capability registry knows the model calls tools natively, and `nlt` otherwise. Use `native` for those models: on the multi-turn harness benchmark it tied or beat `nlt` on all 13 models measured both ways. Dispach does not change dialect when the model ID changes.

The binding field reference is the Agent manifest specification. The generated starter at
`examples/reference/agent.yaml` shows a complete current manifest.
