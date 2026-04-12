import { useState, useRef } from 'react'
import { parseCurl } from '../lib/importers/curlParser'
import { parsePostmanCollection, type ImportSummary } from '../lib/importers/postmanImporter'
import { parseOpenApiSpec, type OpenApiImportSummary } from '../lib/importers/openApiImporter'
import { useRequestStore } from '../store/useRequestStore'
import { useCollectionStore } from '../store/useCollectionStore'

type ImportTab = 'curl' | 'postman' | 'openapi'

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<ImportTab>('curl')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Import</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl cursor-pointer px-1"
          >
            &times;
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-800">
          {([
            ['curl', 'cURL'],
            ['postman', 'Postman'],
            ['openapi', 'OpenAPI'],
          ] as [ImportTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-2.5 text-sm cursor-pointer ${
                activeTab === key
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'curl' && <CurlImport onClose={onClose} />}
          {activeTab === 'postman' && <PostmanImport onClose={onClose} />}
          {activeTab === 'openapi' && <OpenApiImport onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}

// ─── cURL Import ────────────────────────────────────────────────────────────

function CurlImport({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [target, setTarget] = useState<'current' | 'new'>('current')
  const { updateTab, addTab, activeTabId } = useRequestStore()

  const handleImport = () => {
    setError('')
    try {
      const parsed = parseCurl(input)
      let targetTabId = activeTabId
      if (target === 'new') {
        addTab()
        targetTabId = useRequestStore.getState().activeTabId
      }
      updateTab(targetTabId, {
        method: parsed.method,
        url: parsed.url,
        headers: parsed.headers,
        body: parsed.body,
        authType: parsed.authType,
        authToken: parsed.authToken,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse cURL command.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Paste a cURL command to fill the current request tab.
      </p>
      <textarea
        value={input}
        onChange={(e) => { setInput(e.target.value); setError('') }}
        placeholder={`curl -X POST https://api.example.com/data \\
  -H 'Content-Type: application/json' \\
  -d '{"key": "value"}'`}
        className="w-full h-48 bg-gray-800 border border-gray-700 rounded p-3 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500 resize-none font-mono"
        spellCheck={false}
      />
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer text-gray-300">
          <input
            type="radio"
            checked={target === 'current'}
            onChange={() => setTarget('current')}
            className="accent-blue-500"
          />
          Fill current tab
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-gray-300">
          <input
            type="radio"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
            className="accent-blue-500"
          />
          Open in new tab
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded cursor-pointer border border-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={!input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded cursor-pointer"
        >
          Import
        </button>
      </div>
    </div>
  )
}

// ─── Postman Import ─────────────────────────────────────────────────────────

function PostmanImport({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [fileName, setFileName] = useState('')
  const { importCollection } = useCollectionStore()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setSummary(null)
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    try {
      const text = await file.text()
      const result = parsePostmanCollection(text)
      importCollection(result.collection)
      setSummary(result.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse Postman collection.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Import a Postman Collection JSON file (v2.0 / v2.1). Requests will be added as a new collection.
      </p>
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-lg p-8 text-center cursor-pointer transition-colors"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleFile}
          className="hidden"
        />
        <p className="text-gray-400 text-sm">
          {fileName || 'Click to select a Postman Collection JSON file'}
        </p>
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {summary && <ImportSummaryDisplay summary={summary} />}
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded cursor-pointer border border-gray-700"
        >
          {summary ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}

// ─── OpenAPI Import ─────────────────────────────────────────────────────────

function OpenApiImport({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<OpenApiImportSummary | null>(null)
  const [fileName, setFileName] = useState('')
  const { importCollection } = useCollectionStore()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('')
    setSummary(null)
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    try {
      const text = await file.text()
      const result = parseOpenApiSpec(text)
      importCollection(result.collection)
      setSummary(result.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse OpenAPI spec.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Import an OpenAPI 3.x specification (JSON or YAML). Endpoints are grouped by tags into folders.
      </p>
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-700 hover:border-gray-500 rounded-lg p-8 text-center cursor-pointer transition-colors"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,.yaml,.yml"
          onChange={handleFile}
          className="hidden"
        />
        <p className="text-gray-400 text-sm">
          {fileName || 'Click to select an OpenAPI spec file (.json, .yaml, .yml)'}
        </p>
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {summary && <ImportSummaryDisplay summary={summary} />}
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded cursor-pointer border border-gray-700"
        >
          {summary ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}

// ─── Shared summary display ─────────────────────────────────────────────────

function ImportSummaryDisplay({ summary }: { summary: ImportSummary | OpenApiImportSummary }) {
  return (
    <div className="bg-green-500/10 border border-green-500/30 rounded p-4 space-y-2">
      <p className="text-sm font-medium text-green-400">
        Import successful
      </p>
      <div className="text-sm text-gray-300 space-y-1">
        <p>Collection: <span className="text-white font-medium">{summary.collectionName}</span></p>
        <p>{summary.requestCount} request{summary.requestCount !== 1 && 's'}, {summary.folderCount} folder{summary.folderCount !== 1 && 's'}</p>
      </div>
      {summary.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-yellow-400">Warnings:</p>
          <ul className="text-xs text-yellow-400/80 space-y-0.5 list-disc list-inside">
            {summary.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
