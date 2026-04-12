import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Edge, Node } from '@xyflow/react'
import type { FlowNodeData, NodeRuntime, NodeOutput, NodeState } from '../lib/flow/flowTypes'

export type FlowNode = Node<FlowNodeData>

interface FlowStore {
  nodes: FlowNode[]
  edges: Edge[]
  // runtime is transient — keyed by node id
  runtime: Record<string, NodeRuntime>
  running: boolean
  failedNodeId: string | null

  setNodes: (nodes: FlowNode[]) => void
  setEdges: (edges: Edge[]) => void

  addNode: (node: FlowNode) => void
  updateNodeData: (id: string, patch: Partial<FlowNodeData>) => void
  removeNode: (id: string) => void

  setRunning: (running: boolean) => void
  setFailedNodeId: (id: string | null) => void
  setNodeState: (id: string, state: NodeState) => void
  setNodeOutput: (id: string, output: NodeOutput) => void
  setNodeError: (id: string, error: string) => void
  resetRuntime: () => void
}

const DEFAULT_RUNTIME: NodeRuntime = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  error: null,
  output: null,
}

export const useFlowStore = create<FlowStore>()(
  persist(
    (set) => ({
      nodes: [],
      edges: [],
      runtime: {},
      running: false,
      failedNodeId: null,

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node],
          runtime: { ...state.runtime, [node.id]: { ...DEFAULT_RUNTIME } },
        })),

      updateNodeData: (id, patch) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } as FlowNodeData } : n,
          ),
        })),

      removeNode: (id) =>
        set((state) => {
          const { [id]: _removed, ...rest } = state.runtime
          return {
            nodes: state.nodes.filter((n) => n.id !== id),
            edges: state.edges.filter((e) => e.source !== id && e.target !== id),
            runtime: rest,
          }
        }),

      setRunning: (running) => set({ running }),
      setFailedNodeId: (id) => set({ failedNodeId: id }),

      setNodeState: (id, state) =>
        set((s) => ({
          runtime: {
            ...s.runtime,
            [id]: {
              ...(s.runtime[id] ?? DEFAULT_RUNTIME),
              state,
              startedAt: state === 'running' ? Date.now() : s.runtime[id]?.startedAt ?? null,
              finishedAt:
                state === 'success' || state === 'error'
                  ? Date.now()
                  : s.runtime[id]?.finishedAt ?? null,
              error: state === 'error' ? s.runtime[id]?.error ?? null : null,
            },
          },
        })),

      setNodeOutput: (id, output) =>
        set((s) => ({
          runtime: {
            ...s.runtime,
            [id]: { ...(s.runtime[id] ?? DEFAULT_RUNTIME), output },
          },
        })),

      setNodeError: (id, error) =>
        set((s) => ({
          runtime: {
            ...s.runtime,
            [id]: { ...(s.runtime[id] ?? DEFAULT_RUNTIME), error },
          },
        })),

      resetRuntime: () =>
        set((s) => {
          const cleared: Record<string, NodeRuntime> = {}
          for (const n of s.nodes) cleared[n.id] = { ...DEFAULT_RUNTIME }
          return { runtime: cleared, failedNodeId: null }
        }),
    }),
    {
      name: 'reqbench-flow',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
    },
  ),
)
