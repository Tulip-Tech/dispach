# Tools, skills, and plugins

Dispach resolves capabilities at startup so each turn sees a known, validated tool set.

## Tools

Tools are pinned by slug in the manifest. Unknown slugs fail resolution instead of disappearing from the prompt. Phase configuration can narrow the visible set during a turn, which reduces tool-choice errors without changing the installed catalogue.

Provider catalogues may refresh after readiness. Warm a remote provider before latency-sensitive use rather than moving network work into boot.

The system provider supplies shell and file access outside core. Its policy evaluates the command string, while deployment isolation controls the filesystem and process boundary. Web search and provider catalogue search are separate tools.

## Skills

Skills package instructions and supporting resources. The harness ranks skills against each turn's input and injects the best matches; it does not depend on a model deciding to browse a directory. At most `skills.maxActive` (default <!-- fact:default:skills.maxActive -->1<!-- /fact -->) skills activate per turn, and only above `skills.threshold` (default <!-- fact:default:skills.threshold -->0.35<!-- /fact -->, a normalised BM25 score). There is no token budget: the catalogue shows each skill's size, and `skills validate` warns above 5,000 tokens. `skills.trusted` limits whose scripts become tools. Validate third-party skills before placing them in a catalogue available to agents.

## Plugins

Plugins extend channels, tools, lifecycle hooks, and middleware through the public plugin API. They run as trusted code in the runtime process. Install them at boot through the manifest; runtime package installation is deliberately unsupported. Writing one in 0.2.x needs a repository checkout, because the plugin types are in a private workspace package rather than the published `dispach` package.

First-party plugins use the same public contracts as external plugins. If an integration cannot be expressed through those contracts, improve the contract instead of reaching into core internals.

See the Plugin API specification and the contributor guide to [extending
Dispach](../../contributing/extending.md).
