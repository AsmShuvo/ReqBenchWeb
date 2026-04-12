import type { HttpMethod } from '../../repositories/types'

export type FlowNodeKind = 'request' | 'delay' | 'condition'

export type NodeState = 'idle' | 'running' | 'success' | 'error'

<<<<<<< HEAD
export interface RequestNodeData {
=======
// React Flow's Node generic requires `data extends Record<string, unknown>`.
// We extend that so our concrete shapes satisfy the constraint without losing specificity.

export interface RequestNodeData extends Record<string, unknown> {
>>>>>>> 2894d4a (update readme)
  label: string
  method: HttpMethod
  url: string
  headers: string // raw text: "Key: Value" per line
  body: string
}

<<<<<<< HEAD
export interface DelayNodeData {
=======
export interface DelayNodeData extends Record<string, unknown> {
>>>>>>> 2894d4a (update readme)
  label: string
  ms: number
}

<<<<<<< HEAD
export interface ConditionNodeData {
=======
export interface ConditionNodeData extends Record<string, unknown> {
>>>>>>> 2894d4a (update readme)
  label: string
  expression: string // placeholder — not evaluated in V1
}

export type FlowNodeData = RequestNodeData | DelayNodeData | ConditionNodeData

export interface NodeRuntime {
  state: NodeState
  startedAt: number | null
  finishedAt: number | null
  error: string | null
  output: NodeOutput | null
}

export interface NodeOutput {
  // Request nodes: full response
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: unknown // parsed JSON if possible, else raw string
  bodyText?: string
  responseTime?: number
  // Delay nodes: how long we slept
  delayedMs?: number
  // Condition nodes: placeholder
  note?: string
}
