import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree"
import { source } from "./source"

/**
 * One tab per section, in this order. Titles come from each SUMMARY.md. `docs:check` fails when this
 * list and the directories under `developer-docs/` disagree.
 */
const SECTIONS = ["runtime", "contributing", "control-plane", "reference"] as const
const DOCS = join(process.cwd(), "..", "developer-docs")

const byPath = new Map(source.getPages().map((page) => [page.path, page]))

function item(section: string, href: string, name: string): Item {
    const page = byPath.get(`${section}/${href}`)
    // A SUMMARY.md naming a page that did not load is a broken build, not a missing sidebar row.
    if (page === undefined)
        throw new Error(`${section}/SUMMARY.md links ${href}, which is not a loaded page`)
    return { type: "page", name, url: page.url }
}

/**
 * `SUMMARY.md` stays the navigation source (check-docs already verifies it): `- [Title](path.md)` is a
 * page, a bare `- Title` is a group, and two spaces of indent nest one level.
 */
function section(dir: string): Folder {
    const text = readFileSync(join(DOCS, dir, "SUMMARY.md"), "utf8")
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? dir
    // Every folder needs an $id: the tab switcher matches roots by id, and undefined === undefined matches all of them.
    const folder: Folder = { $id: dir, type: "folder", name: title, root: true, children: [] }
    const stack: { depth: number; children: Node[] }[] = [{ depth: -1, children: folder.children }]

    for (const line of text.split("\n")) {
        const match = line.match(/^( *)- (?:\[(.+?)\]\((.+?)\)|(.+))$/)
        if (match === null) continue
        const depth = (match[1]?.length ?? 0) / 2
        while ((stack.at(-1)?.depth ?? -1) >= depth) stack.pop()
        const parent = stack.at(-1)?.children ?? folder.children
        const [, , name, href, group] = match
        if (href !== undefined && name !== undefined) {
            const node = item(dir, href, name)
            if (href === "README.md" && depth === 0) folder.index = node
            else parent.push(node)
        } else if (group !== undefined) {
            const sub: Folder = {
                $id: `${dir}/${group.trim()}`,
                type: "folder",
                name: group.trim(),
                children: [],
            }
            parent.push(sub)
            stack.push({ depth, children: sub.children })
        }
    }
    return folder
}

/** The reference's first page, where the runtime sidebar's "HTTP API" entry leads. */
const API_INDEX = byPath.get("reference/README.md")?.url

/**
 * Every operation, grouped by its resource (`/v1/agents/...` → `agents`), because the whole surface in
 * one flat list is a list nobody scans. Groups keep the document's order of first appearance.
 */
function httpApi(): Folder {
    const groups = new Map<string, Item[]>()
    for (const page of source.getPages().filter((page) => page.type === "openapi")) {
        const op = page.data.getOpenAPIPageProps().operations?.[0]
        // A summary is a sentence; `GET /v1/agents` is what a reader scans a sidebar for.
        const name = op === undefined ? page.data.title : `${op.method.toUpperCase()} ${op.path}`
        const resource = op?.path.split("/")[2] ?? "other"
        const items = groups.get(resource) ?? []
        items.push({ type: "page", name, url: page.url })
        groups.set(resource, items)
    }
    // A resource with one operation (`/v1/health`, `/docs`) is a folder holding one row; those go
    // together under "server" instead.
    const server: Item[] = []
    for (const [resource, items] of groups) {
        if (items.length > 1 && resource !== "other") continue
        server.push(...items)
        groups.delete(resource)
    }
    if (server.length > 0) groups.set("server", server)
    return {
        $id: "reference/http",
        type: "folder",
        name: "HTTP API",
        defaultOpen: true,
        children: [...groups].map(([resource, children]) => ({
            $id: `reference/http/${resource}`,
            type: "folder",
            name: resource,
            children,
        })),
    }
}

/**
 * The HTTP reference lives in its own section, so the runtime's "Runtime reference" group links to
 * it first: somebody reading the runtime docs must not have to know the section switcher exists.
 */
function linkApi(folder: Folder): void {
    if (API_INDEX === undefined) throw new Error("reference/README.md did not load")
    const group = folder.children.find(
        (node): node is Folder => node.type === "folder" && node.name === "Runtime reference",
    )
    if (group === undefined) throw new Error('runtime/SUMMARY.md has no "Runtime reference" group')
    // The anchor is load-bearing: the sidebar shows whichever section is the first to hold the current
    // URL, so the bare URL here made the reference index open under the runtime sidebar, with the
    // operations it introduces nowhere on screen. With the anchor, only the reference holds that URL.
    group.children.unshift({ type: "page", name: "HTTP API", url: `${API_INDEX}#api-reference` })
}

export const tree: Root = {
    $id: "docs",
    name: "Docs",
    children: SECTIONS.map((dir) => {
        const folder = section(dir)
        if (dir === "reference") folder.children.push(httpApi())
        if (dir === "runtime") linkApi(folder)
        return folder
    }),
}
