import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useFlowStore, type FlowNode } from '../../store/useFlowStore'
import { runFlow, type FlowNode as ExecFlowNode } from '../../lib/flow/executor'
import type { FlowNodeData } from '../../lib/flow/flowTypes'
import RequestNode from './RequestNode'
import DelayNode from './DelayNode'
import ConditionNode from './ConditionNode'

const nodeTypes = {
  request: RequestNode,
  delay: DelayNode,
  condition: ConditionNode,
}

function defaultData(kind: 'request' | 'delay' | 'condition', index: number): FlowNodeData {
  if (kind === 'request') {
    return {
      label: `request${index}`,
      method: 'GET',
      url: '',
      headers: '',
      body: '',
    }
  }
  if (kind === 'delay') {
    return { label: `delay${index}`, ms: 500 }
  }
  return { label: `condition${index}`, expression: '' }
}

export default function FlowPage() {
  const {
    nodes, edges, setNodes, setEdges, addNode,
    runtime, running, failedNodeId,
    setRunning, setFailedNodeId, setNodeState, setNodeOutput, setNodeError,
    resetRuntime,
  } = useFlowStore()

  const [runError, setRunError] = useState<string | null>(null)

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

  const handleAdd = (kind: 'request' | 'delay' | 'condition') => {
    const idx = nodes.filter((n) => n.type === kind).length + 1
    const offset = nodes.length * 40
    const newNode: FlowNode = {
      id: crypto.randomUUID(),
      type: kind,
      position: { x: 100 + offset, y: 100 + offset },
      data: defaultData(kind, idx),
    }
    addNode(newNode)
  }

  const handleRun = async () => {
    setRunError(null)
    setFailedNodeId(null)
    resetRuntime()
    setRunning(true)

    const execNodes: ExecFlowNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.type as 'request' | 'delay' | 'condition',
      data: n.data,
    }))

    try {
      await runFlow(execNodes, edges, {
        onNodeStart: (id) => setNodeState(id, 'running'),
        onNodeSuccess: (id, output) => {
          setNodeOutput(id, output)
          setNodeState(id, 'success')
        },
        onNodeError: (id, error) => {
          setNodeError(id, error)
          setNodeState(id, 'error')
          setFailedNodeId(id)
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Flow execution failed'
      setRunError(message)
    } finally {
      setRunning(false)
    }
  }

  const failedNodeLabel = useMemo(() => {
    if (!failedNodeId) return null
    return nodes.find((n) => n.id === failedNodeId)?.data.label ?? failedNodeId
  }, [failedNodeId, nodes])

  const completedCount = Object.values(runtime).filter((r) => r.state === 'success').length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900">
        <span className="text-sm text-gray-400 mr-2">Add:</span>
        <button
          onClick={() => handleAdd('request')}
          disabled={running}
          className="text-xs text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded cursor-pointer border border-gray-700 disabled:opacity-50"
        >
          + Request
        </button>
        <button
          onClick={() => handleAdd('delay')}
          disabled={running}
          className="text-xs text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded cursor-pointer border border-gray-700 disabled:opacity-50"
        >
          + Delay
        </button>
        <button
          onClick={() => handleAdd('condition')}
          disabled={running}
          className="text-xs text-gray-300 hover:text-white hover:bg-gray-800 px-3 py-1.5 rounded cursor-pointer border border-gray-700 disabled:opacity-50"
        >
          + Condition
        </button>

        <div className="flex-1" />

        {running && (
          <span className="text-xs text-blue-400">
            Running... {completedCount}/{nodes.length} done
          </span>
        )}
        {!running && failedNodeLabel && (
          <span className="text-xs text-red-400">
            Failed at: <span className="font-mono">{failedNodeLabel}</span>
          </span>
        )}
        {!running && !failedNodeLabel && completedCount > 0 && completedCount === nodes.length && (
          <span className="text-xs text-green-400">Flow completed</span>
        )}

        <button
          onClick={resetRuntime}
          disabled={running}
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded cursor-pointer border border-gray-700 disabled:opacity-50"
        >
          Reset
        </button>
        <button
          onClick={handleRun}
          disabled={running || nodes.length === 0}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-1.5 rounded cursor-pointer"
        >
          {running ? 'Running...' : 'Run Flow'}
        </button>
      </div>

      {runError && (
        <div className="px-4 py-2 border-b border-red-500/30 bg-red-500/10">
          <p className="text-sm text-red-400">{runError}</p>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 bg-gray-950">
        {nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-sm">Empty flow. Add a Request node to get started.</p>
              <p className="text-gray-600 text-xs mt-2">
                Use <code className="text-blue-400">{'{{nodeLabel.body.field}}'}</code> inside URL/headers/body to chain outputs.
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
            <MiniMap
              pannable zoomable
              nodeColor={(n) => {
                const rt = runtime[n.id]
                if (!rt) return '#374151'
                if (rt.state === 'running') return '#3b82f6'
                if (rt.state === 'success') return '#22c55e'
                if (rt.state === 'error') return '#ef4444'
                return '#374151'
              }}
              style={{ background: '#111827' }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
