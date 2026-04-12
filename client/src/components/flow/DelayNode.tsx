import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useFlowStore } from '../../store/useFlowStore'
import type { DelayNodeData, NodeState } from '../../lib/flow/flowTypes'

const stateColors: Record<NodeState, string> = {
  idle: 'border-gray-700',
  running: 'border-blue-500 shadow-blue-500/40 shadow-lg',
  success: 'border-green-500',
  error: 'border-red-500',
}

export default function DelayNode({ id, data }: NodeProps) {
  const d = data as unknown as DelayNodeData
  const { runtime, updateNodeData, removeNode } = useFlowStore()
  const rt = runtime[id]
  const state: NodeState = rt?.state ?? 'idle'

  return (
    <div className={`bg-gray-900 border-2 rounded-lg w-56 ${stateColors[state]}`}>
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
      <Handle type="source" position={Position.Right} className="!bg-amber-500" />

      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Delay</span>
          <input
            value={d.label}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            className="bg-transparent text-sm text-white font-medium outline-none flex-1 min-w-0 nodrag"
          />
        </div>
        <button
          onClick={() => removeNode(id)}
          className="text-gray-500 hover:text-red-400 text-sm ml-1 cursor-pointer nodrag"
        >
          &times;
        </button>
      </div>

      <div className="p-3 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={60000}
          value={d.ms}
          onChange={(e) => updateNodeData(id, { ms: Number(e.target.value) })}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white outline-none focus:border-amber-500 nodrag"
        />
        <span className="text-xs text-gray-500">ms</span>
      </div>

      {state === 'running' && (
        <div className="border-t border-gray-800 px-3 py-2">
          <p className="text-xs text-blue-400">Sleeping...</p>
        </div>
      )}
      {state === 'success' && (
        <div className="border-t border-gray-800 px-3 py-2 bg-green-500/5">
          <p className="text-xs text-green-400">Slept {rt?.output?.delayedMs}ms</p>
        </div>
      )}
    </div>
  )
}
