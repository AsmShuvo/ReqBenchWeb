import { useCallback, useState } from 'react'
import {
  ReactFlow, Background, Controls,
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useFlowStore, type FlowNode } from '../../store/useFlowStore'
import { runFlow, type FlowNode as ExecFlowNode } from '../../lib/flow/executor'
import type { FlowNodeData } from '../../lib/flow/flowTypes'
import RequestNode from './RequestNode'
import DelayNode from './DelayNode'

const nodeTypes = { request: RequestNode, delay: DelayNode }

function defaultData(kind: 'request' | 'delay', index: number): FlowNodeData {
  if (kind === 'request') {
    return { label: `request${index}`, method: 'GET', url: '', body: '' }
  }
  return { label: `delay${index}`, ms: 500 }
}

export default function FlowPage() {
  const {
    nodes, edges, setNodes, setEdges, addNode,
    runtime, running,
    setRunning, setNodeState, setNodeOutput, resetRuntime,
  } = useFlowStore()
  const [error, setError] = useState<string | null>(null)

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes(applyNodeChanges(changes, nodes) as FlowNode[]),
    [nodes, setNodes],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges],
  )
  const onConnect = useCallback(
    (conn: Connection) => setEdges(addEdge({ ...conn, animated: true }, edges) as Edge[]),
    [edges, setEdges],
  )

  const handleAdd = (kind: 'request' | 'delay') => {
    const idx = nodes.filter((n) => n.type === kind).length + 1
    const offset = nodes.length * 40
    addNode({
      id: crypto.randomUUID(),
      type: kind,
      position: { x: 100 + offset, y: 100 + offset },
      data: defaultData(kind, idx),
    })
  }

  const handleRun = async () => {
    setError(null)
    resetRuntime()
    setRunning(true)

    const execNodes: ExecFlowNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type as 'request' | 'delay',
      data: n.data,
    }))

    try {
      await runFlow(execNodes, edges, {
        onNodeStart: (id) => setNodeState(id, 'running'),
        onNodeSuccess: (id, output) => {
          setNodeOutput(id, output)
          setNodeState(id, 'success')
        },
        onNodeError: (id, err) => setNodeState(id, 'error', err),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Flow execution failed')
    } finally {
      setRunning(false)
    }
  }

  const completed = Object.values(runtime).filter((r) => r.state === 'success').length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900">
        <span className="text-sm text-gray-400 mr-2">Add:</span>
        <button
          onClick={() => handleAdd('request')}
          disabled={running}
          className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded border border-gray-700 cursor-pointer"
        >
          + Request
        </button>
        <button
          onClick={() => handleAdd('delay')}
          disabled={running}
          className="text-xs text-gray-300 hover:text-white px-3 py-1.5 rounded border border-gray-700 cursor-pointer"
        >
          + Delay
        </button>

        <div className="flex-1" />

        {running && <span className="text-xs text-blue-400">Running... {completed}/{nodes.length}</span>}
        {!running && completed > 0 && completed === nodes.length && (
          <span className="text-xs text-green-400">Done</span>
        )}

        <button
          onClick={resetRuntime}
          disabled={running}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-700 cursor-pointer"
        >
          Reset
        </button>
        <button
          onClick={handleRun}
          disabled={running || nodes.length === 0}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm font-medium px-5 py-1.5 rounded cursor-pointer"
        >
          {running ? 'Running...' : 'Run Flow'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 border-b border-red-500/30 bg-red-500/10">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex-1 bg-gray-950">
        {nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-sm">Empty flow. Add a Request node to get started.</p>
              <p className="text-gray-600 text-xs mt-2">
                Use <code className="text-blue-400">{'{{nodeLabel.body.field}}'}</code> to chain outputs.
              </p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
          >
            <Background color="#1f2937" gap={16} />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
