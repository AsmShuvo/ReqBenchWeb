import { useState } from 'react'
import {
  useEnvironmentStore,
  type Environment,
  type EnvVariable,
} from '../store/useEnvironmentStore'

function VariableEditor({
  variables,
  onChange,
}: {
  variables: EnvVariable[]
  onChange: (vars: EnvVariable[]) => void
}) {
  const update = (i: number, field: keyof EnvVariable, value: string | boolean) => {
    onChange(variables.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)))
  }

  const add = () => {
    onChange([...variables, { key: '', value: '', secret: false, enabled: true }])
  }

  const remove = (i: number) => {
    onChange(variables.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      {variables.length > 0 && (
        <div className="flex items-center gap-2 px-1 text-xs text-gray-500">
          <span className="w-5" />
          <span className="flex-1">Variable</span>
          <span className="flex-1">Value</span>
          <span className="w-14 text-center">Secret</span>
          <span className="w-6" />
        </div>
      )}
      {variables.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={v.enabled}
            onChange={(e) => update(i, 'enabled', e.target.checked)}
            className="accent-blue-500"
          />
          <input
            type="text"
            placeholder="key"
            value={v.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 font-mono"
          />
          <input
            type={v.secret ? 'password' : 'text'}
            placeholder="value"
            value={v.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 font-mono"
          />
          <label className="w-14 flex items-center justify-center cursor-pointer">
            <input
              type="checkbox"
              checked={v.secret}
              onChange={(e) => update(i, 'secret', e.target.checked)}
              className="accent-yellow-500"
            />
          </label>
          <button
            onClick={() => remove(i)}
            className="text-gray-500 hover:text-red-400 text-sm w-6 text-center cursor-pointer"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-xs text-gray-400 hover:text-white cursor-pointer"
      >
        + Add variable
      </button>
    </div>
  )
}

function InlineEdit({
  value,
  onSave,
  onCancel,
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(value)
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim()) onSave(text.trim())
        else onCancel()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && text.trim()) onSave(text.trim())
        if (e.key === 'Escape') onCancel()
      }}
      className="bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-sm text-white outline-none"
      autoFocus
    />
  )
}

function EnvironmentItem({ env }: { env: Environment }) {
  const {
    activeEnvironmentId,
    setActiveEnvironment,
    renameEnvironment,
    deleteEnvironment,
    updateVariables,
  } = useEnvironmentStore()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const isActive = activeEnvironmentId === env.id

  return (
    <div className="border-b border-gray-800/50">
      <div className="group flex items-center gap-2 px-4 py-3 hover:bg-gray-800/30">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 text-xs w-4 shrink-0 cursor-pointer"
        >
          {expanded ? '\u25BC' : '\u25B6'}
        </button>

        {/* Active indicator */}
        <button
          onClick={() => setActiveEnvironment(isActive ? null : env.id)}
          className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 cursor-pointer ${
            isActive
              ? 'bg-green-400 border-green-400'
              : 'border-gray-600 hover:border-gray-400'
          }`}
          title={isActive ? 'Deactivate' : 'Set as active'}
        />

        {editing ? (
          <InlineEdit
            value={env.name}
            onSave={(v) => {
              renameEnvironment(env.id, v)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            className="flex-1 text-sm text-white truncate cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            {env.name}
            {isActive && (
              <span className="text-xs text-green-400 ml-2">active</span>
            )}
            <span className="text-xs text-gray-500 ml-2">
              ({env.variables.length} var{env.variables.length !== 1 ? 's' : ''})
            </span>
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => setEditing(true)}
            className="text-gray-500 hover:text-yellow-400 text-xs px-1 cursor-pointer"
            title="Rename"
          >
            &#9998;
          </button>
          <button
            onClick={() => deleteEnvironment(env.id)}
            className="text-gray-500 hover:text-red-400 text-sm px-1 cursor-pointer"
            title="Delete"
          >
            &times;
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          <VariableEditor
            variables={env.variables}
            onChange={(vars) => updateVariables(env.id, vars)}
          />
        </div>
      )}
    </div>
  )
}

export default function EnvironmentManager({ onClose }: { onClose: () => void }) {
  const { environments, createEnvironment } = useEnvironmentStore()
  const [creatingNew, setCreatingNew] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Environments</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreatingNew(true)}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer px-2 py-1"
            >
              + New Environment
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl cursor-pointer px-1"
            >
              &times;
            </button>
          </div>
        </div>

        {/* New env input */}
        {creatingNew && (
          <div className="p-4 border-b border-gray-800">
            <InlineEdit
              value=""
              onSave={(v) => {
                createEnvironment(v)
                setCreatingNew(false)
              }}
              onCancel={() => setCreatingNew(false)}
            />
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-auto">
          {environments.length === 0 && !creatingNew && (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-sm">No environments</p>
              <p className="text-gray-600 text-xs mt-1">
                Create an environment to use variables like {'{{baseUrl}}'} in requests
              </p>
            </div>
          )}

          {environments.map((env) => (
            <EnvironmentItem key={env.id} env={env} />
          ))}
        </div>

        {/* Help */}
        <div className="p-3 border-t border-gray-800 text-xs text-gray-500">
          Use <code className="bg-gray-800 px-1 py-0.5 rounded text-gray-400">{'{{variableName}}'}</code> in URL, headers, body, or auth fields. Click the green dot to set the active environment.
        </div>
      </div>
    </div>
  )
}
