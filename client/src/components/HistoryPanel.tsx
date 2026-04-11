import { useState } from 'react'
import { useHistoryStore, type HistoryEntry } from '../store/useHistoryStore'
import { useRequestStore } from '../store/useRequestStore'

const methodColors: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
}

function statusColor(status: number | null): string {
  if (status === null) return 'text-red-400'
  if (status < 300) return 'text-green-400'
  if (status < 400) return 'text-yellow-400'
  return 'text-red-400'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return d.toLocaleDateString()
}

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname + parsed.search
    const display = parsed.host + path
    return display.length > 60 ? display.slice(0, 57) + '...' : display
  } catch {
    return url.length > 60 ? url.slice(0, 57) + '...' : url
  }
}

export default function HistoryPanel({ onClose }: { onClose: () => void }) {
  const { entries, removeEntry, clearAll } = useHistoryStore()
  const { addTab, updateTab, setActiveTab } = useRequestStore()
  const [search, setSearch] = useState('')

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      e.url.toLowerCase().includes(q) ||
      e.method.toLowerCase().includes(q) ||
      (e.status !== null && String(e.status).includes(q))
    )
  })

  const reopen = (entry: HistoryEntry) => {
    addTab()
    const store = useRequestStore.getState()
    const newTabId = store.activeTabId
    updateTab(newTabId, {
      method: entry.method,
      url: entry.url,
    })
    setActiveTab(newTabId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-lg bg-gray-900 border-l border-gray-800 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">History</h2>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-red-400 hover:text-red-300 cursor-pointer px-2 py-1"
              >
                Clear all
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl cursor-pointer px-1"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-800">
          <input
            type="text"
            placeholder="Search by URL, method, or status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
            autoFocus
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              {entries.length === 0 ? 'No history yet' : 'No matching requests'}
            </div>
          )}

          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer"
              onClick={() => reopen(entry)}
            >
              <span
                className={`text-xs font-semibold w-14 shrink-0 ${methodColors[entry.method] ?? 'text-gray-400'}`}
              >
                {entry.method}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 truncate" title={entry.url}>
                  {truncateUrl(entry.url)}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={`text-xs ${statusColor(entry.status)}`}>
                    {entry.status ?? 'Error'}
                  </span>
                  {entry.responseTime !== null && (
                    <span className="text-xs text-gray-500">
                      {entry.responseTime} ms
                    </span>
                  )}
                  <span className="text-xs text-gray-600">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeEntry(entry.id)
                }}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm px-1 cursor-pointer"
                title="Delete"
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        {entries.length > 0 && (
          <div className="p-3 border-t border-gray-800 text-xs text-gray-500 text-center">
            {entries.length} / 50 requests stored
          </div>
        )}
      </div>
    </div>
  )
}
