import type { Edge } from '@xyflow/react'
import type {
  FlowNodeData, NodeOutput, RequestNodeData, DelayNodeData, ConditionNodeData,
} from './flowTypes'
import { resolveTemplate } from './templateResolver'

export interface FlowNode {
  id: string
  type: 'request' | 'delay' | 'condition'
  data: FlowNodeData
}

export interface ExecutionCallbacks {
  onNodeStart: (nodeId: string) => void
  onNodeSuccess: (nodeId: string, output: NodeOutput) => void
  onNodeError: (nodeId: string, error: string) => void
}

// ─── Topological sort ──────────────────────────────────────────────────────

export function topoSort(nodes: FlowNode[], edges: Edge[]): FlowNode[] {
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
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id)

  const result: FlowNode[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    const node = byId.get(id)
    if (node) result.push(node)
    for (const next of adj.get(id) || []) {
      const d = (inDegree.get(next) || 0) - 1
      inDegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  return result
}

// ─── Per-node execution ────────────────────────────────────────────────────

function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon === -1) continue
    const key = trimmed.slice(0, colon).trim()
    const value = trimmed.slice(colon + 1).trim()
    if (key) headers[key] = value
  }
  return headers
}

async function executeRequest(
  data: RequestNodeData,
  outputs: Map<string, NodeOutput>,
): Promise<NodeOutput> {
  const urlRes = resolveTemplate(data.url, outputs)
  const headersRes = resolveTemplate(data.headers, outputs)
  const bodyRes = resolveTemplate(data.body, outputs)

  const allUnresolved = [
    ...urlRes.unresolved,
    ...headersRes.unresolved,
    ...bodyRes.unresolved,
  ]
  if (allUnresolved.length > 0) {
    throw new Error(
      `Unresolved template references: ${allUnresolved.map((u) => `{{${u}}}`).join(', ')}`,
    )
  }

  const res = await fetch('/api/requests/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: data.method,
      url: urlRes.resolved,
      headers: parseHeaders(headersRes.resolved),
      body:
        data.method !== 'GET' && data.method !== 'DELETE' && bodyRes.resolved
          ? bodyRes.resolved
          : undefined,
    }),
  })

  const json = await res.json()
  if (json.error) throw new Error(json.error)

  // Parse JSON body when possible
  let parsedBody: unknown = json.body
  try {
    parsedBody = JSON.parse(json.body)
  } catch {
    // leave as string
  }

  const output: NodeOutput = {
    status: json.status,
    statusText: json.statusText,
    headers: json.headers,
    body: parsedBody,
    bodyText: json.body,
    responseTime: json.responseTime,
  }

  // Stop flow on HTTP error statuses so chaining failures are visible
  if (typeof json.status === 'number' && json.status >= 400) {
    throw new Error(`Request failed: ${json.status} ${json.statusText}`)
  }

  return output
}

async function executeDelay(data: DelayNodeData): Promise<NodeOutput> {
  const ms = Math.max(0, Math.min(data.ms, 60000))
  await new Promise((r) => setTimeout(r, ms))
  return { delayedMs: ms }
}

function executeCondition(data: ConditionNodeData): NodeOutput {
  // Placeholder: does not branch in V1, just records the expression as a note.
  return { note: `Condition placeholder: "${data.expression || '(empty)'}" — not evaluated in V1` }
}

// ─── Main runner ───────────────────────────────────────────────────────────

export async function runFlow(
  nodes: FlowNode[],
  edges: Edge[],
  callbacks: ExecutionCallbacks,
): Promise<void> {
  const ordered = topoSort(nodes, edges)
  if (ordered.length < nodes.length) {
    throw new Error('Flow contains a cycle. Remove the cycle before running.')
  }

  const outputs = new Map<string, NodeOutput>()

  for (const node of ordered) {
    callbacks.onNodeStart(node.id)
    try {
      let output: NodeOutput
      if (node.type === 'request') {
        output = await executeRequest(node.data as RequestNodeData, outputs)
      } else if (node.type === 'delay') {
        output = await executeDelay(node.data as DelayNodeData)
      } else {
        output = executeCondition(node.data as ConditionNodeData)
      }
      outputs.set(node.data.label, output)
      callbacks.onNodeSuccess(node.id, output)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      callbacks.onNodeError(node.id, message)
      throw err // Stop the flow
    }
  }
}
