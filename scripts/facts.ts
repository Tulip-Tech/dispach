#!/usr/bin/env bun
/**
 * One source of truth for every fact the README and the docs repeat: the version and Node floor from
 * `packages/cli/package.json`, defaults from the manifest schema, the image from the brand and the
 * repository field, counts from the generated OpenAPI document, the console's pages from its own
 * sidebar lists. Nothing here is typed twice.
 *
 *     bun scripts/facts.ts           rewrite every copy from the sources
 *     bun scripts/facts.ts --check   fail naming each copy that disagrees (part of `docs:check`)
 *
 * Two ways a copy is kept:
 *
 * - **Prose**: `<!-- fact:NAME -->value<!-- /fact -->`. The comment is dropped by every renderer,
 *   so GitHub, npm and the site all show the value. `NAME` is one of `FACTS` or `default:<path>`,
 *   any dotted manifest path, read off the parsed schema rather than restated.
 * - **Copyable text** (code fences, where a comment would print): fixed patterns in `PATTERNS`
 *   name the image tag, `--version` output and version variables, and are rewritten in place.
 *   A fence is what somebody pastes, so it must be current; prose may say "since 0.1.3".
 *
 * `bun run release` runs this after bumping the version, so a release can never leave a copy behind.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { BRAND } from "../packages/core/src/brand.ts"
import { AgentManifestSchema } from "../packages/core/src/manifest/schema.ts"
import { AGENT_PANELS, SERVER_PANELS } from "../packages/web/src/panels.tsx"

const ROOT = resolve(import.meta.dirname, "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

const cli = JSON.parse(read("packages/cli/package.json")) as {
    version: string
    engines: { node: string }
    repository: { url: string }
}
const owner = /github\.com\/([^/]+)\//.exec(cli.repository.url)?.[1]
if (owner === undefined)
    throw new Error("packages/cli/package.json repository.url names no GitHub owner")
const openapi = JSON.parse(read("developer-docs/reference/openapi.json")) as {
    paths: Record<string, Record<string, unknown>>
}

const labels = (panels: readonly { label: string }[]) =>
    panels.map((entry) => entry.label).join(", ")

/** Every named fact. Add one here and it can be used anywhere. */
export const FACTS: Readonly<Record<string, string>> = {
    version: cli.version,
    node: cli.engines.node.replace(/^>=\s*/, ""),
    image: `ghcr.io/${owner}/${BRAND.slug}`,
    endpoints: String(
        Object.values(openapi.paths).reduce((n, ops) => n + Object.keys(ops).length, 0),
    ),
    "console:agent": labels(AGENT_PANELS),
    "console:server": labels(SERVER_PANELS),
}

/** The smallest manifest the schema accepts; every default is read off what it parses to. */
const MINIMAL = {
    apiVersion: BRAND.apiVersion,
    id: "facts",
    model: { main: { id: "m", baseUrl: "https://example.invalid/v1", apiKeyEnv: "K" } },
}

/** A manifest default by dotted path, creating each absent parent block so its own defaults apply. */
function schemaDefault(path: string): string {
    const keys = path.split(".")
    const input: Record<string, unknown> = structuredClone(MINIMAL)
    let at = input
    for (const key of keys.slice(0, -1)) {
        at[key] ??= {}
        at = at[key] as Record<string, unknown>
    }
    let value: unknown = AgentManifestSchema.parse(input)
    for (const key of keys) value = (value as Record<string, unknown> | undefined)?.[key]
    if (value === undefined || typeof value === "object")
        throw new Error(`default:${path} has no scalar default in the manifest schema`)
    return String(value)
}

/**
 * A pre-release is never what a reader should install, so while the tree is on one every copy keeps
 * naming the last stable release and the version is neither checked nor rewritten.
 */
const PRERELEASE = cli.version.includes("-")

function fact(name: string): string {
    if (name.startsWith("default:")) return schemaDefault(name.slice("default:".length))
    const value = FACTS[name]
    if (value === undefined)
        throw new Error(
            `unknown fact "${name}"; known: ${Object.keys(FACTS).join(", ")}, default:<path>`,
        )
    return value
}

const semver = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?`
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")

/**
 * Copyable forms of a fact, kept wherever they appear. Group 1 is kept and group 2 becomes the
 * fact; group 3, when present, is kept after it.
 */
const PATTERNS: readonly (readonly [RegExp, string])[] = [
    [new RegExp(`(${literal(FACTS.image ?? "")}:)(${semver})`, "g"), "version"],
    [new RegExp(`(${BRAND.slug} --version\\s+#\\s*)(${semver})`, "g"), "version"],
    [new RegExp(`(${BRAND.envPrefix}VERSION=)(${semver})`, "g"), "version"],
    [new RegExp(`(\\b${BRAND.slug}@)(${semver})`, "g"), "version"],
    [/(\bNode )(\d+)(\+)/g, "node"],
]

/**
 * Files the facts are kept in. History is excluded on purpose: the changelog and the what's-new
 * pages describe releases that happened, and rewriting them would make history wrong.
 */
const FILES = [
    "README.md",
    "docker-compose.yml",
    "scripts/install.sh",
    ".github/assets/quickstart.tape",
    "packages/control/README.md",
    ...new Bun.Glob("developer-docs/**/*.md").scanSync({ cwd: ROOT }),
].filter((file) => !/whats-new|CHANGELOG/.test(file))

const MARKER = /<!-- fact:([\w:.-]+) -->([\s\S]*?)<!-- \/fact -->/g

export function stampFacts(write: boolean): string[] {
    const stale: string[] = []
    for (const file of FILES) {
        const before = read(file)
        let after = before.replace(MARKER, (all, name: string, old: string) => {
            if (PRERELEASE && name === "version") return all
            const value = fact(name)
            if (old !== value)
                stale.push(`${file}: fact ${name} reads "${old}", source says "${value}"`)
            return `<!-- fact:${name} -->${value}<!-- /fact -->`
        })
        for (const [pattern, name] of PATTERNS) {
            if (PRERELEASE && name === "version") continue
            const value = fact(name)
            after = after.replace(pattern, (_all, keep: string, old: string, tail?: string) => {
                if (old !== value)
                    stale.push(`${file}: "${keep}${old}" should read ${name} ${value}`)
                return `${keep}${value}${typeof tail === "string" ? tail : ""}`
            })
        }
        if (write && after !== before) writeFileSync(join(ROOT, file), after)
    }
    return stale
}

if (import.meta.main) {
    const check = process.argv.includes("--check")
    const stale = stampFacts(!check)
    if (check && stale.length > 0) {
        process.stderr.write(
            `facts: ${stale.length} cop${stale.length === 1 ? "y is" : "ies are"} stale:\n${stale.map((line) => `  - ${line}`).join("\n")}\n  hint: run \`bun scripts/facts.ts\` to rewrite them from the sources.\n`,
        )
        process.exit(1)
    }
    process.stdout.write(
        `facts: ${check ? "every copy matches" : `${stale.length} cop${stale.length === 1 ? "y" : "ies"} rewritten`} (${relative(ROOT, join(ROOT, "scripts/facts.ts"))})\n`,
    )
}
