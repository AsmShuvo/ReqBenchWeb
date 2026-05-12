import { useEffect, useState } from 'react'
import { useRequestStore, type HttpMethod } from '../store/useRequestStore'
import {
  aiClient, type FixRequestResult, type ExplainResponseResult, type NlRequestResult,
} from '../lib/aiClient'

export type AiMode = 'fix' | 'explain' | 'nl'

const titles: Record<AiMode, string> = {
  fix: 'Fix with AI',
  explain: 'Explain Response',
  nl: 'Natural Language to Request',
}

export default function AiModal({ mode, onClose }: { mode: AiMode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">{titles[mode]}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {mode === 'fix' && <FixPanel onClose={onClose} />}
          {mode === 'explain' && <ExplainPanel />}
          {mode === 'nl' && <NlPanel onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <span className="inline-block w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
      Contacting Groq...
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">{message}</div>
}

function headersToObject(pairs: { key: string; value: string; enabled: boolean }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) if (p.enabled && p.key) out[p.key] = p.value
  return out
}

function objectToHeaders(obj: Record<string, string>): { key: string; value: string; enabled: boolean }[] {
  const entries = Object.entries(obj)
  return entries.length === 0 ? [{ key: '', value: '', enabled: true }] : entries.map(([k, v]) => ({ key: k, value: v, enabled: true }))
}

function useActiveTab() {
  return useRequestStore((s) => s.tabs.find((t) => t.id === s.activeTabId)!)
}

// ─── Fix ───────────────────────────────────────────────────────────────────

function FixPanel({ onClose }: { onClose: () => void }) {
  const tab = useActiveTab()
  const loadRequest = useRequestStore((s) => s.loadRequest)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FixRequestResult | null>(null)

  useEffect(() => {
    aiClient.fixRequest({
      method: tab.method, url: tab.url, headers: headersToObject(tab.headers), body: tab.body,
      status: tab.response?.status, statusText: tab.response?.statusText,
    })
      .then(setResult)
      .catch((e) => setError(e?.message ?? 'Failed'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!result) return null

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300">{result.explanation}</p>
      <div className="space-y-2 text-sm">
        <p><span className="text-gray-500">Method:</span> {result.method}</p>
        <p className="font-mono break-all"><span className="text-gray-500">URL:</span> {result.url}</p>
        <div>
          <p className="text-xs text-gray-500 mb-1">Headers</p>
          <pre className="text-xs font-mono bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap">
            {JSON.stringify(result.headers, null, 2)}
          </pre>
        </div>
        {result.body && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Body</p>
            <pre className="text-xs font-mono bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
              {result.body}
            </pre>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-3 py-2 border border-gray-700 rounded cursor-pointer">
          Dismiss
        </button>
        <button
          onClick={() => {
            loadRequest({
              method: result.method as HttpMethod,
              url: result.url,
              headers: objectToHeaders(result.headers),
              body: result.body ?? '',
            })
            onClose()
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded cursor-pointer"
        >
          Open in new tab
        </button>
      </div>
    </div>
  )
}

// ─── Explain ───────────────────────────────────────────────────────────────

function ExplainPanel() {
  const tab = useActiveTab()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExplainResponseResult | null>(null)

  useEffect(() => {
    if (!tab.response) { setLoading(false); return }
    aiClient.explainResponse({
      request: { method: tab.method, url: tab.url },
      response: { status: tab.response.status, statusText: tab.response.statusText, body: tab.response.body },
    })
      .then(setResult)
      .catch((e) => setError(e?.message ?? 'Failed'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!result) return null

  return (
    <div className="space-y-3">
      <p className="text-sm text-white">{result.summary}</p>
      <ul className="space-y-1.5 list-disc list-inside text-sm text-gray-300">
        {result.details.map((d, i) => <li key={i}>{d}</li>)}
      </ul>
    </div>
  )
}

// ─── NL → request ──────────────────────────────────────────────────────────

function NlPanel({ onClose }: { onClose: () => void }) {
  const loadRequest = useRequestStore((s) => s.loadRequest)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<NlRequestResult | null>(null)

  const run = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      setResult(await aiClient.nlToRequest(prompt))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        Describe the request in plain English (e.g. "Get the first todo from JSONPlaceholder").
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your request..."
        className="w-full h-24 bg-gray-800 border border-gray-700 rounded p-3 text-sm resize-none"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-white px-3 py-2 border border-gray-700 rounded cursor-pointer">
          Cancel
        </button>
        <button
          onClick={run}
          disabled={!prompt.trim() || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm px-4 py-2 rounded cursor-pointer"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {result && (
        <div className="space-y-3 pt-3 border-t border-gray-800">
          <p className="text-sm text-gray-300">{result.explanation}</p>
          <p className="text-sm"><span className="text-gray-500">Method:</span> {result.method}</p>
          <p className="text-sm font-mono break-all"><span className="text-gray-500">URL:</span> {result.url}</p>
          {result.body && (
            <pre className="text-xs font-mono bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap max-h-32 overflow-auto">
              {result.body}
            </pre>
          )}
          <div className="flex justify-end">
            <button
              onClick={() => {
                loadRequest({
                  method: result.method as HttpMethod,
                  url: result.url,
                  headers: objectToHeaders(result.headers),
                  body: result.body ?? '',
                })
                onClose()
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded cursor-pointer"
            >
              Open in new tab
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
