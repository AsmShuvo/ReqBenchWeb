import { useState } from 'react'
import { useRequestStore } from '../store/useRequestStore'
import AiModal, { type AiMode } from './AiModal'

function statusColor(status: number): string {
  if (status < 300) return 'text-green-400'
  if (status < 400) return 'text-yellow-400'
  return 'text-red-400'
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function formatBody(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2) }
  catch { return body }
}

type Tab = 'Body' | 'Headers'

export default function ResponseViewer() {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)!
  const { response, error, loading } = tab

  const [view, setView] = useState<Tab>('Body')
  const [aiMode, setAiMode] = useState<AiMode | null>(null)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 p-3 border-b border-gray-800">
        <div className="flex gap-1.5 text-sm">
          <span className="text-gray-500">Status:</span>
          {response
            ? <span className={`font-semibold ${statusColor(response.status)}`}>{response.status} {response.statusText}</span>
            : <span className="text-gray-400">---</span>}
        </div>
        <div className="flex gap-1.5 text-sm">
          <span className="text-gray-500">Time:</span>
          {response ? <span className="text-green-400">{response.responseTime} ms</span> : <span className="text-gray-400">---</span>}
        </div>
        <div className="flex gap-1.5 text-sm">
          <span className="text-gray-500">Size:</span>
          {response ? <span>{formatSize(response.size)}</span> : <span className="text-gray-400">---</span>}
        </div>

        <div className="ml-auto flex gap-1.5">
          {(error || (response && response.status >= 400)) && (
            <button
              onClick={() => setAiMode('fix')}
              className="text-xs text-purple-300 hover:text-purple-200 px-2 py-1 rounded border border-purple-500/40 cursor-pointer"
            >
              ✨ Fix with AI
            </button>
          )}
          {response && (
            <button
              onClick={() => setAiMode('explain')}
              className="text-xs text-purple-300 hover:text-purple-200 px-2 py-1 rounded border border-purple-500/40 cursor-pointer"
            >
              ✨ Explain
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-gray-800">
        {(['Body', 'Headers'] as Tab[]).map((t) => (
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
        {loading && (
          <div className="h-full flex items-center justify-center">
            <span className="inline-block w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{error}</div>
        )}
        {!loading && !error && !response && (
          <p className="text-gray-500 text-sm text-center mt-8">
            Send a request to see the response<br/>
            <span className="text-xs text-gray-600">Ctrl+Enter to send</span>
          </p>
        )}
        {!loading && !error && response && (
          view === 'Body' ? (
            <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words">
              {formatBody(response.body)}
            </pre>
          ) : (
            <div className="space-y-1">
              {Object.entries(response.headers).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-sm">
                  <span className="text-blue-400 shrink-0">{k}:</span>
                  <span className="text-gray-300 break-all">{v}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {aiMode && <AiModal mode={aiMode} onClose={() => setAiMode(null)} />}
    </div>
  )
}
