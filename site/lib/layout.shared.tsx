import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { brand, docsRoute, repoUrl } from "./shared"

export function baseOptions(): BaseLayoutProps {
    return {
        nav: { title: brand.name },
        links: [
            { text: "Docs", url: "/docs" },
            // The HTTP reference is what somebody checks before self-hosting; one click, from anywhere.
            { text: "API", url: `${docsRoute}/reference` },
            { text: "Benchmarks", url: `${docsRoute}/runtime/benchmarks` },
            { text: "Evals", url: "/evals" },
        ],
        githubUrl: repoUrl,
    }
}
