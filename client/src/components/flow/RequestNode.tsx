import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useFlowStore } from '../../store/useFlowStore'
import type { HttpMethod } from '../../repositories/types'
import type { RequestNodeData, NodeState } from '../../lib/flow/flowTypes'

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
}

const stateColors: Record<NodeState, string> = {
  idle: 'border-gray-700',
  running: 'border-blue-500 shadow-blue-500/40 shadow-lg',
  success: 'border-green-500',
  error: 'border-red-500',
}

export default function RequestNode({ id, data }: NodeProps) {
  const d = data as unknown as RequestNodeData
  const { runtime, updateNodeData, removeNode } = useFlowStore()
  const rt = runtime[id]
  const state: NodeState = rt?.state ?? 'idle'

  return (
    <div className={`bg-gray-900 border-2 rounded-lg w-80 ${stateColors[state]}`}>
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />

      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Request</span>
          <input
            value={d.label}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            className="bg-transparent text-sm text-white font-medium outline-none flex-1 min-w-0 nodrag"
            placeholder="nodeLabel"
          />
        </div>
        <StateDot state={state} />
        <button
          onClick={() => removeNode(id)}
          className="text-gray-500 hover:text-red-400 text-sm ml-1 cursor-pointer nodrag"
          title="Delete node"
        >
          &times;
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <select
            value={d.method}
            onChange={(e) => updateNodeData(id, { method: e.target.value as HttpMethod })}
            className={`bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-semibold outline-none cursor-pointer nodrag ${methodColors[d.method]}`}
          >
            {methods.map((m) => (
              <option key={m} value={m} className="text-white">{m}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="https://api.example.com/users"
            value={d.url}
            onChange={(e) => updateNodeData(id, { url: e.target.value })}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500 nodrag"
          />
        </div>
        <textarea
          placeholder="Headers&#10;Content-Type: application/json"
          value={d.headers}
          onChange={(e) => updateNodeData(id, { headers: e.target.value })}
          className="w-full h-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500 resize-none font-mono nodrag"
        />
        <textarea
          placeholder='Body (supports {{nodeLabel.body.field}})'
          value={d.body}
          onChange={(e) => updateNodeData(id, { body: e.target.value })}
          className="w-full h-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500 resize-none font-mono nodrag"
        />
      </div>

      <NodeStatus runtime={rt} />
    </div>
  )
}

function StateDot({ state }: { state: NodeState }) {
  const colors: Record<NodeState, string> = {
    idle: 'bg-gray-600',
    running: 'bg-blue-500 animate-pulse',
    success: 'bg-green-500',
    error: 'bg-red-500',
  }
  return <span className={`w-2.5 h-2.5 rounded-full ${colors[state]}`} title={state} />
}

function NodeStatus({ runtime }: { runtime: { state: NodeState; error: string | null; output: { status?: number; bodyText?: string; responseTime?: number } | null } | undefined }) {
  if (!runtime) return null
  if (runtime.state === 'error' && runtime.error) {
    return (
      <div className="border-t border-gray-800 px-3 py-2 bg-red-500/10">
        <p className="text-xs text-red-400 break-words">{runtime.error}</p>
      </div>
    )
  }
  if (runtime.state === 'success' && runtime.output) {
    const { status, bodyText, responseTime } = runtime.output
    const preview = bodyText && bodyText.length > 160 ? bodyText.slice(0, 160) + '...' : bodyText
    return (
      <div className="border-t border-gray-800 px-3 py-2 bg-green-500/5 space-y-1">
        <p className="text-xs text-green-400">
          {status} &middot; {responseTime}ms
        </p>
        {preview && (
          <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap break-words max-h-20 overflow-hidden">
            {preview}
          </pre>
        )}
      </div>
    )
  }
  if (runtime.state === 'running') {
    return (
      <div className="border-t border-gray-800 px-3 py-2">
        <p className="text-xs text-blue-400 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          Running...
        </p>
      </div>
    )
  }
  return null
}
