/**
 * `delegate`: the model fans work out to its own subagents (`docs/25-SPEC-FAN-OUT.md`, decision 15.20).
 *
 * A routed subagent (`subagents.ts`) starts when the harness sees a routed slug; this one starts when
 * the model asks. Only children declaring `spawn: true` can be started this way, so it is opt-in per
 * child. Everything after the start is the routed child's path: the same runner, so the same
 * inherited taint, stand-in deferral, acting participant, policy and cancel; the same `runHandoff`
 * envelope and events; depth 1, because a child's `toolsAllow` is its own `tools` and never names
 * this tool.
 *
 * One call carries every task (decision 15.20): a small model makes one call more reliably than N
 * parallel ones, so the handler runs the tasks itself rather than relying on `batch()`.
 */

import { HarnessError } from "../errors.ts"
import type { EventBus } from "../events/bus.ts"
import type { SubagentConfig } from "../manifest/schema.ts"
import type { HandoffStore } from "../store/store.ts"
import type { Tool, ToolContext, ToolParameters } from "../tools/types.ts"
import { type HandoffOutcome, runHandoff } from "./handoff.ts"
import { DEFAULT_SUBAGENT_ARTIFACT, type SubagentRunner } from "./subagents.ts"

export const DELEGATE = "delegate"

/** Tasks in one call. A constant, not a setting, until somebody needs more. */
export const DELEGATE_MAX_TASKS = 8

const MAX_LABEL_CHARS = 60

interface Task {
    readonly index: number
    readonly child: SubagentConfig
    readonly task: string
    readonly label?: string
}

interface Finished {
    readonly task: Task
    readonly outcome: HandoffOutcome
}

/** The child's task: what it is for, then what the model asked of it. */
export function delegateTask(child: SubagentConfig, task: string): string {
    return [child.task, "", "## Your task", "", task].join("\n")
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()

function invalid(message: string, hint: string): HarnessError {
    return new HarnessError({ code: "delegate_tasks_invalid", message, hint, field: "tasks" })
}

/** Read the model's `tasks` into runnable ones, or throw naming what is wrong. */
function readTasks(raw: unknown, children: ReadonlyMap<string, SubagentConfig>): readonly Task[] {
    const shape =
        children.size === 1
            ? '[{"task": "…", "label": "…"}]'
            : `[{"subagent": "${[...children.keys()][0]}", "task": "…", "label": "…"}]`
    if (!Array.isArray(raw) || raw.length === 0) {
        throw invalid("delegate needs at least one task.", `Send tasks as ${shape}.`)
    }
    if (raw.length > DELEGATE_MAX_TASKS) {
        throw invalid(
            `delegate takes at most ${DELEGATE_MAX_TASKS} tasks in one call; this one had ${raw.length}.`,
            `Group related questions into one task, or call delegate again with the rest after these answers are in.`,
        )
    }
    const only = children.size === 1 ? [...children.values()][0] : undefined
    return raw.map((entry, index): Task => {
        const item = (typeof entry === "object" && entry !== null ? entry : {}) as Record<
            string,
            unknown
        >
        const task = typeof item.task === "string" ? item.task.trim() : ""
        if (task === "") {
            throw invalid(
                `Task ${index + 1} has no text.`,
                "Each task's text is all its subagent sees: write the whole question into it.",
            )
        }
        const named = typeof item.subagent === "string" ? item.subagent.trim() : ""
        const child = named === "" ? only : children.get(named)
        if (child === undefined) {
            throw new HarnessError({
                code: "delegate_subagent_unknown",
                message:
                    named === ""
                        ? `Task ${index + 1} names no subagent.`
                        : `Task ${index + 1} names "${named}", which is not a subagent this agent can start.`,
                hint: `Name one of: ${[...children.keys()].join(", ")}.`,
                field: "tasks",
            })
        }
        const label =
            typeof item.label === "string" && item.label.trim() !== ""
                ? oneLine(item.label).slice(0, MAX_LABEL_CHARS)
                : undefined
        return { index, child, task, ...(label === undefined ? {} : { label }) }
    })
}

/** Run `work` over `items`, at most `limit` at a time, keeping their order in the result. */
async function pooled<T, R>(
    items: readonly T[],
    limit: number,
    work: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let next = 0
    const lanes = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
        while (next < items.length) {
            const at = next++
            results[at] = await work(items[at] as T)
        }
    })
    await Promise.all(lanes)
    return results
}

function section(done: Finished): string {
    const { task, outcome } = done
    const heading = `### ${task.label ?? `task ${task.index + 1}`} (${task.child.name})`
    const where = `Transcript: session ${outcome.cost.sessionKey}.`
    switch (outcome.kind) {
        case "ok":
            return `${heading}: ok\n${JSON.stringify(outcome.artifact, null, 2)}`
        case "budget": {
            const said = outcome.text.trim()
            return `${heading}: stopped (${outcome.reason}) after ${outcome.cost.steps} steps\n${said === "" ? "" : `It got as far as: ${said}\n`}${where}`
        }
        case "no_artifact": {
            const said = outcome.text.trim()
            return `${heading}: finished without an answer\n${said === "" ? "(it said nothing)" : `It said: ${said}`}\n${where}`
        }
        case "error":
            return `${heading}: failed\n${outcome.error.message}\n${where}`
    }
}

export function delegateTool(init: {
    /** The children declaring `spawn: true`, in manifest order. At least one. */
    readonly children: readonly SubagentConfig[]
    /** Whether a child holds any tool that can change something; such a child's tasks run in turn. */
    readonly mutates: (child: SubagentConfig) => boolean
    readonly runner: SubagentRunner
    readonly bus: EventBus
    readonly store?: HandoffStore
    /** `limits.maxParallelTools`: how many read-only tasks run at once. */
    readonly maxParallel: number
}): Tool {
    const children = new Map(init.children.map((child) => [child.name, child]))
    const anyMutates = init.children.some(init.mutates)
    // Keyed by the args object, as `routedTool` does: the executor hands the same object to the
    // handler and then to `trustOf`.
    const taint = new WeakMap<object, boolean>()
    const roster = init.children
        .map(
            (child) => `- ${child.name}: ${oneLine(child.task)} (tools: ${child.tools.join(", ")})`,
        )
        .join("\n")

    const taskProperties: Record<string, unknown> = {
        task: {
            type: "string",
            description:
                "The whole task, as one block of text. It is ALL the subagent sees: none of this conversation. Write out every detail it needs.",
        },
        label: {
            type: "string",
            description: `A short name for this task, at most ${MAX_LABEL_CHARS} characters, used when its answer comes back.`,
        },
        ...(children.size > 1
            ? {
                  subagent: {
                      type: "string",
                      description: "Which subagent runs this task.",
                      enum: [...children.keys()],
                  },
              }
            : {}),
    }

    return {
        spec: {
            slug: DELEGATE,
            provider: "team",
            summary:
                "Runs several independent tasks in subagents, each in a fresh context of its own, and returns what each one found.",
            whenToUse:
                "the person asks for several separate things to be looked into, or one large search whose raw results you do not need to keep: each task runs apart, and only its findings come back",
            whenNotToUse: `a single quick lookup you can make yourself, or work that needs this conversation. Subagents cannot see this conversation or ask you anything. Available:\n${roster}`,
            // A child that can write makes the whole call a write: it runs alone in its step, is
            // never retried, and is refused in a tainted turn, as `handoff` is.
            mutating: anyMutates,
            tags: anyMutates ? ["write", "team"] : ["read", "team"],
            parameters: {
                type: "object",
                properties: {
                    tasks: {
                        type: "array",
                        description: `1 to ${DELEGATE_MAX_TASKS} independent tasks.`,
                        items: {
                            type: "object",
                            properties: taskProperties,
                            required: children.size > 1 ? ["task", "subagent"] : ["task"],
                        },
                    },
                },
                required: ["tasks"],
            } as ToolParameters,
        },
        trustOf: (args) => (taint.get(args) === true ? "untrusted" : "trusted"),
        async handler(args, context: ToolContext) {
            const tasks = readTasks(args.tasks, children)
            let tainted = false

            const run = async (task: Task): Promise<Finished> => {
                // Each child is bounded by its own `timeoutMs` when it declares one, inside the call's.
                const bounded: ToolContext =
                    task.child.timeoutMs === undefined
                        ? context
                        : {
                              ...context,
                              deadlineMs: Math.min(context.deadlineMs, task.child.timeoutMs),
                          }
                const target = init.runner(task.child, bounded)
                const outcome = await runHandoff({
                    member: target,
                    task: delegateTask(task.child, task.task),
                    artifact:
                        (task.child.artifact as ToolParameters | undefined) ??
                        DEFAULT_SUBAGENT_ARTIFACT,
                    bus: init.bus,
                    ...(init.store === undefined ? {} : { store: init.store }),
                    eventContext: {
                        agentId: context.agentId,
                        sessionKey: context.sessionKey,
                        turnId: context.turnId,
                    },
                    signal: context.signal,
                    sessionPrefix: "subagent",
                    source: "subagent",
                    kind: "self",
                    name: task.child.name,
                    index: task.index,
                    ...(task.label === undefined ? {} : { label: task.label }),
                    ...(context.callId === undefined ? {} : { callId: context.callId }),
                    ...(context.actingParticipant
                        ? { participant: context.actingParticipant }
                        : {}),
                })
                if (target.tainted()) tainted = true
                return { task, outcome }
            }

            // Read-only children together, a child that can write one task at a time after them:
            // children share a filesystem and `exec` (decision 10.11), the rule `batch()` applies.
            const reads = tasks.filter((task) => !init.mutates(task.child))
            const writes = tasks.filter((task) => init.mutates(task.child))
            const done = [
                ...(await pooled(reads, init.maxParallel, run)),
                ...(await pooled(writes, 1, run)),
            ].sort((a, b) => a.task.index - b.task.index)
            taint.set(args, tainted)

            if (done.every((item) => item.outcome.kind !== "ok")) {
                throw new HarnessError({
                    code: "delegate_failed",
                    message: `None of the ${done.length} task(s) came back with an answer.\n\n${done.map(section).join("\n\n")}`,
                    hint: "Calling delegate again with the same tasks will end the same way. Narrow the tasks if what they said shows they were too broad; otherwise tell the person what happened.",
                })
            }
            const ok = done.filter((item) => item.outcome.kind === "ok").length
            return [
                `${done.length} task(s) ran in subagents; ${ok} came back with an answer.`,
                ...done.map(section),
            ].join("\n\n")
        },
    }
}
