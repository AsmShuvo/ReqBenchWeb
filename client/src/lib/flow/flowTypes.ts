import type { HttpMethod } from '../../repositories/types'

export type FlowNodeKind = 'request' | 'delay' | 'condition'

export type NodeState = 'idle' | 'running' | 'success' | 'error'

export interface RequestNodeData {
  label: string
  method: HttpMethod
  url: string
  headers: string // raw text: "Key: Value" per line
  body: string
}

export interface DelayNodeData {
  label: string
  ms: number
}

export interface ConditionNodeData {
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
