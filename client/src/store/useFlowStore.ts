import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Edge, Node } from '@xyflow/react'
import type { HttpMethod } from './useRequestStore'

export type FlowNodeKind = 'request' | 'delay'
export type NodeState = 'idle' | 'running' | 'success' | 'error'

export interface RequestNodeData extends Record<string, unknown> {
  label: string
  method: HttpMethod
  url: string
  body: string
}

export interface DelayNodeData extends Record<string, unknown> {
  label: string
  ms: number
}

export type FlowNodeData = RequestNodeData | DelayNodeData

export interface NodeOutput {
  status?: number
  body?: unknown    // parsed JSON if possible
  responseTime?: number
  delayedMs?: number
}

export interface NodeRuntime {
  state: NodeState
  error: string | null
  output: NodeOutput | null
}

export type FlowNode = Node<FlowNodeData>

interface FlowState {
  nodes: FlowNode[]
  edges: Edge[]
  runtime: Record<string, NodeRuntime>
  running: boolean

  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: Edge[]) => void
  addNode: (node: FlowNode) => void
  updateNodeData: (id: string, patch: Partial<FlowNodeData>) => void
  removeNode: (id: string) => void

  setRunning: (running: boolean) => void
  setNodeState: (id: string, state: NodeState, error?: string) => void
  setNodeOutput: (id: string, output: NodeOutput) => void
  resetRuntime: () => void
}

const DEFAULT_RUNTIME: NodeRuntime = { state: 'idle', error: null, output: null }

export const useFlowStore = create<FlowState>()(
  persist(
    (set) => ({
      nodes: [],
      edges: [],
      runtime: {},
      running: false,

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      addNode: (node) =>
        set((s) => ({
          nodes: [...s.nodes, node],
          runtime: { ...s.runtime, [node.id]: { ...DEFAULT_RUNTIME } },
        })),

      updateNodeData: (id, patch) =>
        set((s) => ({
          nodes: s.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } as FlowNodeData } : n,
          ),
        })),

      removeNode: (id) =>
        set((s) => {
          const runtime = { ...s.runtime }
          delete runtime[id]
          return {
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.source !== id && e.target !== id),
            runtime,
          }
        }),

      setRunning: (running) => set({ running }),

      setNodeState: (id, state, error) =>
        set((s) => ({
          runtime: {
            ...s.runtime,
            [id]: { ...(s.runtime[id] ?? DEFAULT_RUNTIME), state, error: error ?? null },
          },
        })),

      setNodeOutput: (id, output) =>
        set((s) => ({
          runtime: {
            ...s.runtime,
            [id]: { ...(s.runtime[id] ?? DEFAULT_RUNTIME), output },
          },
        })),

      resetRuntime: () =>
        set((s) => {
          const cleared: Record<string, NodeRuntime> = {}
          for (const n of s.nodes) cleared[n.id] = { ...DEFAULT_RUNTIME }
          return { runtime: cleared }
        }),
    }),
    {
      name: 'reqbench-flow',
      partialize: (s) => ({ nodes: s.nodes, edges: s.edges }),
    },
  ),
)
