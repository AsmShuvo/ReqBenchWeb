import { useState } from 'react'
import { useRequestStore, type HttpMethod, type KeyValuePair } from '../store/useRequestStore'

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const methodColors: Record<HttpMethod, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
}

type BuilderTab = 'Params' | 'Headers' | 'Body' | 'Auth'

function KeyValueEditor({
  pairs,
  onChange,
}: {
  pairs: KeyValuePair[]
  onChange: (pairs: KeyValuePair[]) => void
}) {
  const updatePair = (index: number, field: keyof KeyValuePair, value: string | boolean) => {
    const updated = pairs.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    onChange(updated)
  }

  const addPair = () => {
    onChange([...pairs, { key: '', value: '', enabled: true }])
  }

  const removePair = (index: number) => {
    if (pairs.length === 1) return
    onChange(pairs.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pair.enabled}
            onChange={(e) => updatePair(i, 'enabled', e.target.checked)}
            className="accent-blue-500"
          />
          <input
            type="text"
            placeholder="Key"
            value={pair.key}
            onChange={(e) => updatePair(i, 'key', e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Value"
            value={pair.value}
            onChange={(e) => updatePair(i, 'value', e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
          />
          <button
            onClick={() => removePair(i)}
            className="text-gray-500 hover:text-red-400 text-sm cursor-pointer"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        onClick={addPair}
        className="text-xs text-gray-400 hover:text-white cursor-pointer"
      >
        + Add
      </button>
    </div>
  )
}

export default function RequestBuilder() {
  const { tabs, activeTabId, updateTab } = useRequestStore()
  const [activeBuilderTab, setActiveBuilderTab] = useState<BuilderTab>('Params')
  const tab = tabs.find((t) => t.id === activeTabId)

  if (!tab) return null

  const builderTabs: BuilderTab[] = ['Params', 'Headers', 'Body', 'Auth']

  return (
    <div className="flex flex-col h-full">
      {/* URL Bar */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-800">
        <select
          value={tab.method}
          onChange={(e) => updateTab(tab.id, { method: e.target.value as HttpMethod })}
          className={`bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm font-semibold outline-none cursor-pointer ${methodColors[tab.method]}`}
        >
          {methods.map((m) => (
            <option key={m} value={m} className="text-white">
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Enter URL..."
          value={tab.url}
          onChange={(e) => updateTab(tab.id, { url: e.target.value })}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
        />
        <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded cursor-pointer">
          Send
        </button>
      </div>

      {/* Builder Tabs */}
      <div className="flex border-b border-gray-800">
        {builderTabs.map((bt) => (
          <button
            key={bt}
            onClick={() => setActiveBuilderTab(bt)}
            className={`px-4 py-2 text-sm cursor-pointer ${
              activeBuilderTab === bt
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {bt}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeBuilderTab === 'Params' && (
          <KeyValueEditor
            pairs={tab.params}
            onChange={(params) => updateTab(tab.id, { params })}
          />
        )}

        {activeBuilderTab === 'Headers' && (
          <KeyValueEditor
            pairs={tab.headers}
            onChange={(headers) => updateTab(tab.id, { headers })}
          />
        )}

        {activeBuilderTab === 'Body' && (
          <textarea
            value={tab.body}
            onChange={(e) => updateTab(tab.id, { body: e.target.value })}
            placeholder='{ "key": "value" }'
            className="w-full h-full bg-gray-800 border border-gray-700 rounded p-3 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 resize-none font-mono"
          />
        )}

        {activeBuilderTab === 'Auth' && (
          <div className="space-y-3">
            <select
              value={tab.authType}
              onChange={(e) =>
                updateTab(tab.id, { authType: e.target.value as 'none' | 'bearer' | 'basic' })
              }
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none cursor-pointer"
            >
              <option value="none">No Auth</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic Auth</option>
            </select>
            {tab.authType !== 'none' && (
              <input
                type="text"
                placeholder={tab.authType === 'bearer' ? 'Token' : 'username:password'}
                value={tab.authToken}
                onChange={(e) => updateTab(tab.id, { authToken: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
