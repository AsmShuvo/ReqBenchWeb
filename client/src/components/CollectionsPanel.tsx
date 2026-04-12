import { useState } from 'react'
import { useEscape } from '../lib/useEscape'
import {
  useCollectionStore,
  type Collection,
  type CollectionFolder,
  type SavedRequest,
} from '../store/useCollectionStore'
import { useRequestStore } from '../store/useRequestStore'

const methodColors: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  PATCH: 'text-purple-400',
  DELETE: 'text-red-400',
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
      className="bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-sm text-white outline-none w-full"
      autoFocus
    />
  )
}

function RequestItem({
  req,
  collectionId,
  folderId,
  onOpen,
}: {
  req: SavedRequest
  collectionId: string
  folderId: string | null
  onOpen: (req: SavedRequest) => void
}) {
  const { deleteRequest, duplicateRequest } = useCollectionStore()

  return (
    <div
      className="group flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800/50 cursor-pointer rounded"
      onClick={() => onOpen(req)}
    >
      <span className={`text-xs font-semibold w-12 shrink-0 ${methodColors[req.method] ?? 'text-gray-400'}`}>
        {req.method}
      </span>
      <span className="flex-1 text-sm text-gray-300 truncate">{req.name}</span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            duplicateRequest(collectionId, folderId, req.id)
          }}
          className="text-gray-500 hover:text-blue-400 text-xs px-1 cursor-pointer"
          title="Duplicate"
        >
          &#x29C9;
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            deleteRequest(collectionId, folderId, req.id)
          }}
          className="text-gray-500 hover:text-red-400 text-sm px-1 cursor-pointer"
          title="Delete"
        >
          &times;
        </button>
      </div>
    </div>
  )
}

function FolderItem({
  folder,
  collectionId,
  onOpen,
}: {
  folder: CollectionFolder
  collectionId: string
  onOpen: (req: SavedRequest) => void
}) {
  const { renameFolder, deleteFolder } = useCollectionStore()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <div>
      <div className="group flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-800/30 rounded">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 text-xs w-4 shrink-0 cursor-pointer"
        >
          {expanded ? '&#9660;' : '&#9654;'}
        </button>
        <span className="text-gray-400 text-sm">&#128193;</span>
        {editing ? (
          <InlineEdit
            value={folder.name}
            onSave={(v) => {
              renameFolder(collectionId, folder.id, v)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            className="flex-1 text-sm text-gray-300 truncate cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            {folder.name}
            <span className="text-xs text-gray-600 ml-1.5">({folder.requests.length})</span>
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
            onClick={() => deleteFolder(collectionId, folder.id)}
            className="text-gray-500 hover:text-red-400 text-sm px-1 cursor-pointer"
            title="Delete folder"
          >
            &times;
          </button>
        </div>
      </div>
      {expanded && (
        <div className="ml-6">
          {folder.requests.length === 0 ? (
            <p className="text-xs text-gray-600 px-3 py-1">Empty folder</p>
          ) : (
            folder.requests.map((r) => (
              <RequestItem
                key={r.id}
                req={r}
                collectionId={collectionId}
                folderId={folder.id}
                onOpen={onOpen}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function CollectionItem({
  collection,
  onOpen,
}: {
  collection: Collection
  onOpen: (req: SavedRequest) => void
}) {
  const {
    renameCollection,
    deleteCollection,
    duplicateCollection,
    createFolder,
  } = useCollectionStore()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)

  const totalRequests =
    collection.requests.length +
    collection.folders.reduce((sum, f) => sum + f.requests.length, 0)

  return (
    <div className="border-b border-gray-800/50">
      {/* Collection header */}
      <div className="group flex items-center gap-1.5 px-3 py-2.5 hover:bg-gray-800/30">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 text-xs w-4 shrink-0 cursor-pointer"
        >
          {expanded ? '&#9660;' : '&#9654;'}
        </button>
        {editing ? (
          <InlineEdit
            value={collection.name}
            onSave={(v) => {
              renameCollection(collection.id, v)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            className="flex-1 text-sm font-medium text-white truncate cursor-pointer"
            onClick={() => setExpanded(!expanded)}
          >
            {collection.name}
            <span className="text-xs text-gray-500 font-normal ml-1.5">
              ({totalRequests})
            </span>
          </span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => {
              setExpanded(true)
              setAddingFolder(true)
            }}
            className="text-gray-500 hover:text-green-400 text-xs px-1 cursor-pointer"
            title="Add folder"
          >
            +&#128193;
          </button>
          <button
            onClick={() => setEditing(true)}
            className="text-gray-500 hover:text-yellow-400 text-xs px-1 cursor-pointer"
            title="Rename"
          >
            &#9998;
          </button>
          <button
            onClick={() => duplicateCollection(collection.id)}
            className="text-gray-500 hover:text-blue-400 text-xs px-1 cursor-pointer"
            title="Duplicate"
          >
            &#x29C9;
          </button>
          <button
            onClick={() => deleteCollection(collection.id)}
            className="text-gray-500 hover:text-red-400 text-sm px-1 cursor-pointer"
            title="Delete"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="pb-2 pl-4">
          {/* New folder input */}
          {addingFolder && (
            <div className="px-3 py-1">
              <InlineEdit
                value=""
                onSave={(v) => {
                  createFolder(collection.id, v)
                  setAddingFolder(false)
                }}
                onCancel={() => setAddingFolder(false)}
              />
            </div>
          )}

          {/* Folders */}
          {collection.folders.map((f) => (
            <FolderItem
              key={f.id}
              folder={f}
              collectionId={collection.id}
              onOpen={onOpen}
            />
          ))}

          {/* Root requests */}
          {collection.requests.map((r) => (
            <RequestItem
              key={r.id}
              req={r}
              collectionId={collection.id}
              folderId={null}
              onOpen={onOpen}
            />
          ))}

          {collection.folders.length === 0 && collection.requests.length === 0 && !addingFolder && (
            <p className="text-xs text-gray-600 px-3 py-2">
              No requests yet. Use the Save button in a request tab to add one.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function CollectionsPanel({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  const { collections, createCollection } = useCollectionStore()
  const { addTab, updateTab, setActiveTab } = useRequestStore()
  const [creatingNew, setCreatingNew] = useState(false)

  const openRequest = (req: SavedRequest) => {
    addTab()
    const store = useRequestStore.getState()
    const newTabId = store.activeTabId
    updateTab(newTabId, {
      method: req.method,
      url: req.url,
      params: req.params,
      headers: req.headers,
      body: req.body,
      authType: req.authType,
      authToken: req.authToken,
    })
    setActiveTab(newTabId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel — slides from left */}
      <div className="relative mr-auto w-full max-w-md bg-gray-900 border-r border-gray-800 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Collections</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreatingNew(true)}
              className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer px-2 py-1"
            >
              + New Collection
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl cursor-pointer px-1"
            >
              &times;
            </button>
          </div>
        </div>

        {/* New collection input */}
        {creatingNew && (
          <div className="p-3 border-b border-gray-800">
            <InlineEdit
              value=""
              onSave={(v) => {
                createCollection(v)
                setCreatingNew(false)
              }}
              onCancel={() => setCreatingNew(false)}
            />
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-auto">
          {collections.length === 0 && !creatingNew && (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-sm">No collections yet</p>
              <p className="text-gray-600 text-xs mt-1">
                Create a collection to organize your requests
              </p>
            </div>
          )}

          {collections.map((c) => (
            <CollectionItem key={c.id} collection={c} onOpen={openRequest} />
          ))}
        </div>

        {/* Footer */}
        {collections.length > 0 && (
          <div className="p-3 border-t border-gray-800 text-xs text-gray-500 text-center">
            {collections.length} collection{collections.length !== 1 && 's'}
          </div>
        )}
      </div>
    </div>
  )
}
