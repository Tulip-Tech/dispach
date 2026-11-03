#!/usr/bin/env bun
/**
 * Check the developer docs the site publishes: every top-level directory under `developer-docs/` is a
 * section with a `README.md` and a `SUMMARY.md`, every page is in its summary, every local link and
 * anchor resolves, and the site's own section lists name exactly these directories.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const DOCS = join(ROOT, "developer-docs")
const failures: string[] = []

const sections = readdirSync(DOCS)
    .filter((name) => statSync(join(DOCS, name)).isDirectory())
    .sort()
const directories = sections.map((name) => join(DOCS, name))
for (const name of sections) {
    if (!existsSync(join(DOCS, name, "README.md")))
        failures.push(`developer-docs/${name} has no README.md`)
}

// The site names its sections twice, as literals its build needs: the sidebar order in `tree.ts` and
// the page globs in `source.ts`. A directory missing from either is a section the site never shows.
const named = (file: string, pattern: RegExp): string[] =>
    [...readFileSync(join(ROOT, file), "utf8").matchAll(pattern)]
        .map((match) => match[1] ?? "")
        .sort()
const sidebar = named("site/lib/tree.ts", /"([\w-]+)"(?=[^\n]*\] as const)/g)
for (const [file, listed] of [
    ["site/lib/tree.ts", sidebar],
    ["site/lib/source.ts", named("site/lib/source.ts", /"([\w-]+)\/\*\*\/\*\.md"/g)],
] as const) {
    if (listed.join(",") !== sections.join(","))
        failures.push(
            `${file} lists sections ${listed.join(", ")}; developer-docs has ${sections.join(", ")}`,
        )
}

const markdownFiles = (directory: string): string[] => {
    const found: string[] = []
    const walk = (current: string): void => {
        for (const name of readdirSync(current)) {
            const path = join(current, name)
            if (statSync(path).isDirectory()) walk(path)
            else if (extname(path) === ".md") found.push(path)
        }
    }
    walk(directory)
    return found
}

const slug = (heading: string): string =>
    heading
        .toLowerCase()
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-")

const headings = new Map<string, Set<string>>()
const links = new Map<string, string[]>()
const allPages = directories.flatMap(markdownFiles)
for (const file of allPages) {
    const text = readFileSync(file, "utf8")
    headings.set(
        file,
        new Set(
            [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => slug(match[1]?.trim() ?? "")),
        ),
    )
    links.set(
        file,
        [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]?.trim() ?? ""),
    )
}

const navigated = new Set<string>()
for (const [source, targets] of links) {
    for (const raw of targets) {
        if (raw === "" || /^(?:https?:|mailto:)/.test(raw)) continue
        const [encodedPath, anchor] = raw.split("#", 2)
        const localPath = decodeURIComponent(encodedPath ?? "")
        let target = localPath === "" ? source : resolve(dirname(source), localPath)
        if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "README.md")
        if (!existsSync(target)) {
            failures.push(`${relative(ROOT, source)} links to missing ${raw}`)
            continue
        }
        // A Markdown page and an image become site routes; any other local file is dead on the site
        // even though it exists on disk (`openapi.json` was linked like this and 404'd).
        if (extname(target) !== ".md" && !/\.(?:png|jpe?g|gif|svg|webp)$/i.test(target)) {
            failures.push(
                `${relative(ROOT, source)} links to ${raw}, which is not a page on the site; link a page, or the file on GitHub`,
            )
            continue
        }
        if (extname(target) === ".md") {
            if (source.endsWith("SUMMARY.md")) navigated.add(target)
            if (anchor !== undefined && anchor !== "" && !headings.get(target)?.has(anchor)) {
                failures.push(`${relative(ROOT, source)} links to missing heading ${raw}`)
            }
        }
    }
}

for (const directory of directories) {
    const summary = join(directory, "SUMMARY.md")
    if (!existsSync(summary)) failures.push(`${relative(ROOT, directory)} has no SUMMARY.md`)
}
for (const page of allPages) {
    if (page.endsWith("SUMMARY.md")) continue
    if (!navigated.has(page)) failures.push(`${relative(ROOT, page)} is absent from its SUMMARY.md`)
}

// The site's own pages link into the docs by route. A route that names no page is a 404 on the
// landing page, which nothing above reads.
const pageFor = (route: string): string | undefined => {
    const path = route.replace(/^\/docs\/?/, "").replace(/[#?].*$/, "")
    for (const candidate of [`${path}.md`, join(path, "README.md")]) {
        const file = join(DOCS, candidate)
        if (existsSync(file)) return file
    }
    return undefined
}
const siteFiles = [
    ...new Bun.Glob("site/{app,lib,components}/**/*.{ts,tsx}").scanSync({ cwd: ROOT }),
]
for (const file of siteFiles) {
    const text = readFileSync(join(ROOT, file), "utf8")
    for (const match of text.matchAll(/["`](\/docs\/[\w/.-]+)["`]/g)) {
        const route = match[1] ?? ""
        // Generated API pages and the redirecting `/docs` root are routes, not files.
        if (route.startsWith("/docs/reference/http")) continue
        if (pageFor(route) === undefined)
            failures.push(`${file} links ${route}, which is no docs page`)
    }
}

// The search index ids each page's headings `<page url>-<n>`, so a page whose path is another's plus
// `-<number>` (`whats-new-0-2` beside `whats-new-0-2-0`) makes `/api/search` throw
// DOCUMENT_ALREADY_EXISTS in production — every query, while every page still renders.
const routes = allPages
    .filter((page) => !page.endsWith("SUMMARY.md"))
    .map((page) => relative(DOCS, page).replace(/(?:\/README)?\.md$/, ""))
for (const route of routes) {
    const clash = routes.find(
        (other) => other !== route && new RegExp(`^${route}-\\d+$`).test(other),
    )
    if (clash !== undefined)
        failures.push(
            `developer-docs/${route} and developer-docs/${clash} collide in the search index (heading ids are <url>-<n>); rename one`,
        )
}

// The landing page's primary button must lead to the page that installs what the hero shows.
const landing = readFileSync(join(ROOT, "site/app/(home)/page.tsx"), "utf8")
const quickstart = /const QUICKSTART = "([^"]+)"/.exec(landing)?.[1]
const quickstartPage = quickstart === undefined ? undefined : pageFor(quickstart)
if (quickstartPage === undefined) failures.push("site/app/(home)/page.tsx has no QUICKSTART page")
else if (!readFileSync(quickstartPage, "utf8").includes("npm install"))
    failures.push(
        `${relative(ROOT, quickstartPage)} is the landing page's quickstart and never shows \`npm install\`, which the hero prints`,
    )

// The runtime section must reach the HTTP reference without the section switcher (site/lib/tree.ts
// puts it first in this group).
if (!/^- Runtime reference$/m.test(readFileSync(join(DOCS, "runtime", "SUMMARY.md"), "utf8")))
    failures.push(
        'developer-docs/runtime/SUMMARY.md has no "Runtime reference" group for the HTTP API link',
    )

// Every operation in the generated reference says what it answers: a success body (or a status that
// has none) and the error shape. An omitted body renders as "Empty", which reads as a fact.
const openapi = JSON.parse(readFileSync(join(DOCS, "reference", "openapi.json"), "utf8")) as {
    paths: Record<string, Record<string, { responses?: Record<string, { content?: unknown }> }>>
}
const bodiless = new Set(["101", "204", "301", "302", "304"])
for (const [path, operations] of Object.entries(openapi.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
        const responses = Object.entries(operation.responses ?? {})
        const success = responses.filter(([code]) => /^[123]/.test(code))
        if (
            success.length === 0 ||
            success.some(([code, r]) => !bodiless.has(code) && r.content === undefined)
        )
            failures.push(
                `openapi.json ${method.toUpperCase()} ${path} has a success status with no body`,
            )
        if (responses.some(([code, r]) => /^[45]/.test(code) && r.content === undefined))
            failures.push(
                `openapi.json ${method.toUpperCase()} ${path} has an error status with no error body`,
            )
    }
}

if (failures.length > 0) {
    process.stderr.write(
        `developer documentation failed ${failures.length} check(s):\n${failures
            .map((failure) => `  - ${failure}`)
            .join("\n")}\n`,
    )
    process.exit(1)
}

process.stdout.write(
    `developer documentation: ${sections.length} sections, ${allPages.length} Markdown files\n`,
)
