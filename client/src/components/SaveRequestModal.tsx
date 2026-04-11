import { useState } from 'react'
import { useCollectionStore } from '../store/useCollectionStore'
import { useRequestStore } from '../store/useRequestStore'

export default function SaveRequestModal({ onClose }: { onClose: () => void }) {
  const { collections, createCollection, saveRequest } = useCollectionStore()
  const { tabs, activeTabId } = useRequestStore()

  const tab = tabs.find((t) => t.id === activeTabId)

  const [selectedCollectionId, setSelectedCollectionId] = useState(
    collections[0]?.id ?? '',
  )
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')
  const [requestName, setRequestName] = useState(tab?.name || 'New Request')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [showNewCollection, setShowNewCollection] = useState(collections.length === 0)

  const selectedCollection = collections.find((c) => c.id === selectedCollectionId)

  if (!tab) return null

  const handleSave = () => {
    let collId = selectedCollectionId

    if (showNewCollection && newCollectionName.trim()) {
      createCollection(newCollectionName.trim())
      const updated = useCollectionStore.getState().collections
      collId = updated[updated.length - 1].id
    }

    if (!collId) return

    saveRequest(collId, selectedFolderId || null, {
      name: requestName.trim() || 'Untitled',
      method: tab.method,
      url: tab.url,
      params: tab.params,
      headers: tab.headers,
      body: tab.body,
      authType: tab.authType,
      authToken: tab.authToken,
    })

    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md p-5 space-y-4">
        <h3 className="text-lg font-semibold text-white">Save Request</h3>

        {/* Request name */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Request name</label>
          <input
            type="text"
            value={requestName}
            onChange={(e) => setRequestName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            autoFocus
          />
        </div>

        {/* Collection picker */}
        {!showNewCollection && collections.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">Collection</label>
              <button
                onClick={() => setShowNewCollection(true)}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                + New
              </button>
            </div>
            <select
              value={selectedCollectionId}
              onChange={(e) => {
                setSelectedCollectionId(e.target.value)
                setSelectedFolderId('')
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none cursor-pointer"
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">New collection</label>
              {collections.length > 0 && (
                <button
                  onClick={() => setShowNewCollection(false)}
                  className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  Use existing
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Folder picker */}
        {selectedCollection && selectedCollection.folders.length > 0 && !showNewCollection && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Folder (optional)</label>
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none cursor-pointer"
            >
              <option value="">Root (no folder)</option>
              {selectedCollection.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
