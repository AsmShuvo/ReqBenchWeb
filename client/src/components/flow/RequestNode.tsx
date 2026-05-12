import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useFlowStore } from '../../store/useFlowStore'
import type { HttpMethod } from '../../store/useRequestStore'
import type { RequestNodeData, NodeState } from '../../lib/flow/flowTypes'

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const methodColor: Record<HttpMethod, string> = {
  GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400',
  PATCH: 'text-purple-400', DELETE: 'text-red-400',
}
const borderColor: Record<NodeState, string> = {
  idle: 'border-gray-700',
  running: 'border-blue-500',
  success: 'border-green-500',
  error: 'border-red-500',
}

export default function RequestNode({ id, data }: NodeProps) {
  const d = data as unknown as RequestNodeData
  const { runtime, updateNodeData, removeNode } = useFlowStore()
  const rt = runtime[id]
  const state: NodeState = rt?.state ?? 'idle'

  return (
    <div className={`bg-gray-900 border-2 rounded-lg w-80 ${borderColor[state]}`}>
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />

      <div className="flex justify-between items-center px-3 py-2 border-b border-gray-800">
        <input
          value={d.label}
          onChange={(e) => updateNodeData(id, { label: e.target.value })}
          className="bg-transparent text-sm font-medium outline-none flex-1 nodrag"
          placeholder="nodeLabel"
        />
        <button
          onClick={() => removeNode(id)}
          className="text-gray-500 hover:text-red-400 nodrag cursor-pointer"
        >
          ×
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <select
            value={d.method}
            onChange={(e) => updateNodeData(id, { method: e.target.value as HttpMethod })}
            className={`bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-semibold nodrag cursor-pointer ${methodColor[d.method]}`}
          >
            {methods.map((m) => <option key={m} value={m} className="text-white">{m}</option>)}
          </select>
          <input
            placeholder="https://api.example.com"
            value={d.url}
            onChange={(e) => updateNodeData(id, { url: e.target.value })}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs nodrag"
          />
        </div>
        <textarea
          placeholder='Body (supports {{nodeLabel.body.field}})'
          value={d.body}
          onChange={(e) => updateNodeData(id, { body: e.target.value })}
          className="w-full h-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs font-mono resize-none nodrag"
        />
      </div>

      {rt?.state === 'error' && rt.error && (
        <div className="border-t border-gray-800 px-3 py-2 bg-red-500/10">
          <p className="text-xs text-red-400 break-words">{rt.error}</p>
        </div>
      )}
      {rt?.state === 'success' && rt.output && (
        <div className="border-t border-gray-800 px-3 py-2 bg-green-500/5">
          <p className="text-xs text-green-400">
            {rt.output.status} · {rt.output.responseTime}ms
          </p>
        </div>
      )}
    </div>
  )
}
