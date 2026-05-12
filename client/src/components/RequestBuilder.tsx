import { useEffect, useState } from 'react'
import { useRequestStore, type HttpMethod, type KeyValuePair } from '../store/useRequestStore'
import { useCollectionStore } from '../store/useCollectionStore'
import BenchmarkModal from './BenchmarkModal'
import AiModal from './AiModal'

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const methodColor: Record<HttpMethod, string> = {
  GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400',
  PATCH: 'text-purple-400', DELETE: 'text-red-400',
}

type Tab = 'Headers' | 'Body'

function KeyValueEditor({ pairs, onChange }: {
  pairs: KeyValuePair[]
  onChange: (p: KeyValuePair[]) => void
}) {
  const update = (i: number, field: keyof KeyValuePair, value: string | boolean) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))

  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => update(i, 'enabled', e.target.checked)}
          />
          <input
            type="text"
            placeholder="Key"
            value={p.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          />
          <input
            type="text"
            placeholder="Value"
            value={p.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}
            className="text-gray-500 hover:text-red-400 cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...pairs, { key: '', value: '', enabled: true }])}
        className="text-xs text-gray-400 hover:text-white cursor-pointer"
      >
        + Add
      </button>
    </div>
  )
}

function SaveModal({ onClose }: { onClose: () => void }) {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)!
  const { collections, createCollection, saveRequest } = useCollectionStore()
  const [name, setName] = useState('')
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '')
  const [newCollectionName, setNewCollectionName] = useState('')

  const save = () => {
    if (!name.trim()) return
    let cid = collectionId
    if (!cid && newCollectionName.trim()) {
      createCollection(newCollectionName.trim())
      const cs = useCollectionStore.getState().collections
      cid = cs[cs.length - 1].id
    }
    if (!cid) return
    saveRequest(cid, {
      name: name.trim(),
      method: tab.method,
      url: tab.url,
      headers: tab.headers,
      body: tab.body,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-semibold">Save Request</h2>
        <input
          placeholder="Request name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        {collections.length > 0 ? (
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <input
            placeholder="New collection name"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-3 py-2 border border-gray-700 rounded cursor-pointer">
            Cancel
          </button>
          <button onClick={save} className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded cursor-pointer">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RequestBuilder() {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const updateTab = useRequestStore((s) => s.updateTab)
  const send = useRequestStore((s) => s.send)
  const tab = tabs.find((t) => t.id === activeTabId)!

  const [view, setView] = useState<Tab>('Headers')
  const [saveOpen, setSaveOpen] = useState(false)
  const [benchOpen, setBenchOpen] = useState(false)
  const [nlOpen, setNlOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !tab.loading) {
        e.preventDefault()
        void send(tab.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [send, tab.id, tab.loading])

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-800">
        <select
          value={tab.method}
          onChange={(e) => updateTab(tab.id, { method: e.target.value as HttpMethod })}
          className={`bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm font-semibold cursor-pointer ${methodColor[tab.method]}`}
        >
          {methods.map((m) => <option key={m} value={m} className="text-white">{m}</option>)}
        </select>
        <input
          type="text"
          placeholder="Enter URL..."
          value={tab.url}
          onChange={(e) => updateTab(tab.id, { url: e.target.value })}
          className="flex-1 min-w-[160px] bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => setNlOpen(true)}
          className="text-purple-300 hover:text-purple-200 text-sm px-3 py-1.5 rounded border border-purple-500/40 cursor-pointer"
          title="Natural language → request"
        >
          ✨ NL
        </button>
        <button
          onClick={() => setBenchOpen(true)}
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-700 cursor-pointer"
        >
          Bench
        </button>
        <button
          onClick={() => setSaveOpen(true)}
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-700 cursor-pointer"
        >
          Save
        </button>
        <button
          onClick={() => void send(tab.id)}
          disabled={tab.loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm font-medium px-5 py-1.5 rounded cursor-pointer min-w-16"
        >
          {tab.loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : 'Send'}
        </button>
      </div>

      <div className="flex border-b border-gray-800">
        {(['Headers', 'Body'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`px-4 py-2 text-sm cursor-pointer ${
              view === t ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {view === 'Headers' && (
          <KeyValueEditor
            pairs={tab.headers}
            onChange={(headers) => updateTab(tab.id, { headers })}
          />
        )}
        {view === 'Body' && (
          <textarea
            value={tab.body}
            onChange={(e) => updateTab(tab.id, { body: e.target.value })}
            placeholder='{ "key": "value" }'
            className="w-full h-full bg-gray-800 border border-gray-700 rounded p-3 text-sm font-mono resize-none"
          />
        )}
      </div>

      {saveOpen && <SaveModal onClose={() => setSaveOpen(false)} />}
      {benchOpen && <BenchmarkModal onClose={() => setBenchOpen(false)} />}
      {nlOpen && <AiModal mode="nl" onClose={() => setNlOpen(false)} />}
    </div>
  )
}
