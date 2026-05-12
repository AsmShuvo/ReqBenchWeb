import { useState } from 'react'
import { useCollectionStore, type SavedRequest } from '../store/useCollectionStore'
import { useRequestStore } from '../store/useRequestStore'

const methodColor: Record<string, string> = {
  GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400',
  PATCH: 'text-purple-400', DELETE: 'text-red-400',
}

export default function CollectionsPanel({ onClose }: { onClose: () => void }) {
  const { collections, createCollection, deleteCollection, deleteRequest } = useCollectionStore()
  const loadRequest = useRequestStore((s) => s.loadRequest)
  const [newName, setNewName] = useState('')

  const create = () => {
    if (!newName.trim()) return
    createCollection(newName.trim())
    setNewName('')
  }

  const load = (req: SavedRequest) => {
    loadRequest({ method: req.method, url: req.url, headers: req.headers, body: req.body })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-gray-900 border-l border-gray-800 flex flex-col h-full">
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">Collections</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer">×</button>
        </div>

        <div className="p-3 border-b border-gray-800 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="New collection name"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 rounded cursor-pointer"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {collections.length === 0 && (
            <p className="text-center text-gray-500 text-sm mt-8">
              No collections yet. Save a request to start.
            </p>
          )}
          {collections.map((c) => (
            <div key={c.id} className="border-b border-gray-800/50">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-800/30">
                <span className="font-medium text-sm">{c.name}</span>
                <button
                  onClick={() => deleteCollection(c.id)}
                  className="text-gray-600 hover:text-red-400 text-xs cursor-pointer"
                >
                  Delete
                </button>
              </div>
              {c.requests.length === 0 ? (
                <p className="px-4 py-2 text-xs text-gray-600">Empty</p>
              ) : (
                c.requests.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => load(r)}
                    className="group flex justify-between items-center px-4 py-2 hover:bg-gray-800/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-semibold w-12 ${methodColor[r.method] ?? 'text-gray-400'}`}>
                        {r.method}
                      </span>
                      <span className="text-sm text-gray-300 truncate">{r.name}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRequest(c.id, r.id) }}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
