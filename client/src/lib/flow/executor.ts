// Runs a graph of nodes: topo-sort the DAG, run each node in order, pipe outputs
// into later nodes via {{label.body.field}} templates.

import type { Edge } from '@xyflow/react'
import type {
  FlowNodeData, NodeOutput, RequestNodeData, DelayNodeData,
} from './flowTypes'

export interface FlowNode {
  id: string
  type: 'request' | 'delay'
  data: FlowNodeData
}

export interface ExecutionCallbacks {
  onNodeStart: (nodeId: string) => void
  onNodeSuccess: (nodeId: string, output: NodeOutput) => void
  onNodeError: (nodeId: string, error: string) => void
}

// ─── Template substitution ─────────────────────────────────────────────────
// Syntax: {{nodeLabel.body.path.to.value}}
// "nodeLabel" looks up a previous node's output by its label,
// then the dotted path walks into the JSON.

const TEMPLATE_RE = /\{\{([^{}]+?)\}\}/g

function walkPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root
  for (const segment of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[segment]
  }
  return cur
}

function resolveTemplate(input: string, outputs: Map<string, NodeOutput>): {
  resolved: string
  unresolved: string[]
} {
  const unresolved: string[] = []
  const resolved = input.replace(TEMPLATE_RE, (match, expr: string) => {
    const [label, ...path] = expr.trim().split('.')
    const out = outputs.get(label)
    if (!out) { unresolved.push(expr); return match }
    const val = walkPath(out, path)
    if (val === undefined) { unresolved.push(expr); return match }
    if (val === null) return 'null'
    if (typeof val === 'string') return val
    if (typeof val === 'number' || typeof val === 'boolean') return String(val)
    return JSON.stringify(val)
  })
  return { resolved, unresolved }
}

// ─── Topological sort ──────────────────────────────────────────────────────

function topoSort(nodes: FlowNode[], edges: Edge[]): FlowNode[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  const byId = new Map<string, FlowNode>()
  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
    byId.set(n.id, n)
  }
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    adj.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
  }

  const queue: string[] = []
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id) })

  const sorted: FlowNode[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(byId.get(id)!)
    for (const next of adj.get(id) || []) {
      const d = (inDegree.get(next) || 0) - 1
      inDegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  return sorted
}

// ─── Node executors ────────────────────────────────────────────────────────

async function executeRequest(
  data: RequestNodeData,
  outputs: Map<string, NodeOutput>,
): Promise<NodeOutput> {
  const url = resolveTemplate(data.url, outputs)
  const body = resolveTemplate(data.body, outputs)

  const unresolved = [...url.unresolved, ...body.unresolved]
  if (unresolved.length > 0) {
    throw new Error(`Unresolved template references: ${unresolved.map((u) => `{{${u}}}`).join(', ')}`)
  }

  const res = await fetch('/api/requests/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: data.method,
      url: url.resolved,
      headers: {},
      body: data.method !== 'GET' && data.method !== 'DELETE' && body.resolved ? body.resolved : undefined,
    }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)

  // Parse JSON body when possible — that's what enables {{label.body.field}}
  let parsedBody: unknown = json.body
  try { parsedBody = JSON.parse(json.body) } catch { /* leave as string */ }

  if (typeof json.status === 'number' && json.status >= 400) {
    throw new Error(`Request failed: ${json.status} ${json.statusText}`)
  }

  return { status: json.status, body: parsedBody, responseTime: json.responseTime }
}

async function executeDelay(data: DelayNodeData): Promise<NodeOutput> {
  const ms = Math.max(0, Math.min(data.ms, 60000))
  await new Promise((r) => setTimeout(r, ms))
  return { delayedMs: ms }
}

// ─── Main runner ───────────────────────────────────────────────────────────

export async function runFlow(
  nodes: FlowNode[],
  edges: Edge[],
  callbacks: ExecutionCallbacks,
): Promise<void> {
  const ordered = topoSort(nodes, edges)
  if (ordered.length < nodes.length) {
    throw new Error('Flow contains a cycle.')
  }

  const outputs = new Map<string, NodeOutput>()

  for (const node of ordered) {
    callbacks.onNodeStart(node.id)
    try {
      const output =
        node.type === 'request'
          ? await executeRequest(node.data as RequestNodeData, outputs)
          : await executeDelay(node.data as DelayNodeData)
      outputs.set(node.data.label, output)
      callbacks.onNodeSuccess(node.id, output)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      callbacks.onNodeError(node.id, message)
      throw err
    }
  }
}
