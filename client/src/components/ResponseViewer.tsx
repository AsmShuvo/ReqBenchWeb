import { useState } from 'react'
import { useRequestStore } from '../store/useRequestStore'

type ResponseTab = 'Body' | 'Headers'

function statusColor(status: number): string {
  if (status < 300) return 'text-green-400'
  if (status < 400) return 'text-yellow-400'
  return 'text-red-400'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export default function ResponseViewer() {
  const { tabs, activeTabId } = useRequestStore()
  const [activeTab, setActiveTab] = useState<ResponseTab>('Body')

  const tab = tabs.find((t) => t.id === activeTabId)
  const response = tab?.response
  const error = tab?.error
  const loading = tab?.loading

  const responseTabs: ResponseTab[] = ['Body', 'Headers']

  return (
    <div className="flex flex-col h-full">
      {/* Response Summary */}
      <div className="flex items-center gap-4 p-3 border-b border-gray-800">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Status:</span>
          {response ? (
            <span className={`text-sm font-semibold ${statusColor(response.status)}`}>
              {response.status} {response.statusText}
            </span>
          ) : (
            <span className="text-sm text-gray-400">---</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Time:</span>
          {response ? (
            <span className="text-sm text-green-400">{response.responseTime} ms</span>
          ) : (
            <span className="text-sm text-gray-400">---</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Size:</span>
          {response ? (
            <span className="text-sm text-gray-300">{formatSize(response.size)}</span>
          ) : (
            <span className="text-sm text-gray-400">---</span>
          )}
        </div>
      </div>

      {/* Response Tabs */}
      <div className="flex border-b border-gray-800">
        {responseTabs.map((rt) => (
          <button
            key={rt}
            onClick={() => setActiveTab(rt)}
            className={`px-4 py-2 text-sm cursor-pointer ${
              activeTab === rt
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {rt}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-3">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <span className="inline-block w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && !response && (
          <>
            {activeTab === 'Body' && (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 text-sm">
                  Send a request to see the response
                  <span className="block text-xs text-gray-600 mt-1">Ctrl+Enter to send</span>
                </p>
              </div>
            )}
            {activeTab === 'Headers' && (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 text-sm">No response headers yet</p>
              </div>
            )}
          </>
        )}

        {!loading && !error && response && (
          <>
            {activeTab === 'Body' && (
              <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words">
                {formatBody(response.body)}
              </pre>
            )}
            {activeTab === 'Headers' && (
              <div className="space-y-1">
                {Object.entries(response.headers).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <span className="text-blue-400 shrink-0">{key}:</span>
                    <span className="text-gray-300 break-all">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
