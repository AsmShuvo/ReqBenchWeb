import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useFlowStore } from '../../store/useFlowStore'
import type { ConditionNodeData, NodeState } from '../../lib/flow/flowTypes'

const stateColors: Record<NodeState, string> = {
  idle: 'border-gray-700',
  running: 'border-blue-500',
  success: 'border-green-500',
  error: 'border-red-500',
}

export default function ConditionNode({ id, data }: NodeProps) {
  const d = data as unknown as ConditionNodeData
  const { runtime, updateNodeData, removeNode } = useFlowStore()
  const rt = runtime[id]
  const state: NodeState = rt?.state ?? 'idle'

  return (
    <div className={`bg-gray-900 border-2 border-dashed rounded-lg w-64 ${stateColors[state]}`}>
      <Handle type="target" position={Position.Left} className="!bg-purple-500" />
      <Handle type="source" position={Position.Right} id="true" style={{ top: '35%' }} className="!bg-green-500" />
      <Handle type="source" position={Position.Right} id="false" style={{ top: '70%' }} className="!bg-red-500" />

      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">Condition</span>
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

      <div className="p-3 space-y-2">
        <input
          type="text"
          placeholder='e.g. {{login.status}} === 200'
          value={d.expression}
          onChange={(e) => updateNodeData(id, { expression: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-purple-500 font-mono nodrag"
        />
        <p className="text-[10px] text-gray-500 italic">
          Placeholder — branching not evaluated in V1.
        </p>
      </div>
    </div>
  )
}
