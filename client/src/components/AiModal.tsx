import { useEffect, useState } from 'react'
import { useRequestStore, type HttpMethod } from '../store/useRequestStore'
import {
  aiClient, AiLimitError,
  type FixRequestResult, type ExplainResponseResult,
  type GenerateTestsResult, type NlRequestResult,
} from '../lib/aiClient'
import { useAiLimitStore } from '../store/useAiLimitStore'

export type AiMode = 'fix' | 'explain' | 'tests' | 'nl'

interface Props {
  mode: AiMode
  onClose: () => void
}

const titles: Record<AiMode, string> = {
  fix: 'Fix with AI',
  explain: 'Explain Response',
  tests: 'Generate Tests',
  nl: 'Natural Language to Request',
}

export default function AiModal({ mode, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">{titles[mode]}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer px-1">&times;</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {mode === 'fix' && <FixPanel onClose={onClose} />}
          {mode === 'explain' && <ExplainPanel />}
          {mode === 'tests' && <TestsPanel />}
          {mode === 'nl' && <NlPanel onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function headersFromKV(pairs: { key: string; value: string; enabled: boolean }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) {
    if (p.enabled && p.key) out[p.key] = p.value
  }
  return out
}

function kvFromHeaders(h: Record<string, string>): { key: string; value: string; enabled: boolean }[] {
  const entries = Object.entries(h)
  if (entries.length === 0) return [{ key: '', value: '', enabled: true }]
  return entries.map(([k, v]) => ({ key: k, value: v, enabled: true }))
}

function useActiveTab() {
  const { tabs, activeTabId, updateTab } = useRequestStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  return { tab, updateTab }
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
  return (
    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400 whitespace-pre-wrap">
      {message}
    </div>
  )
}

// ─── Fix panel ──────────────────────────────────────────────────────────────

function FixPanel({ onClose }: { onClose: () => void }) {
  const { tab, updateTab } = useActiveTab()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FixRequestResult | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!tab) return
    setLoading(true); setError(null)
    aiClient.fixRequest({
      method: tab.method,
      url: tab.url,
      headers: headersFromKV(tab.headers),
      body: tab.body,
      status: tab.response?.status,
      statusText: tab.response?.statusText,
      error: tab.error ?? undefined,
    })
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof AiLimitError ? e.message : (e?.message ?? 'Failed'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!result || !tab) return null

  const apply = () => {
    updateTab(tab.id, {
      method: result.method as HttpMethod,
      url: result.url,
      headers: kvFromHeaders(result.headers),
      body: result.body ?? '',
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300">{result.explanation}</p>

      <div className="space-y-2">
        <SectionLabel>Suggested request</SectionLabel>
        <KVRow label="Method" value={result.method} />
        <KVRow label="URL" value={result.url} mono />
        <div>
          <p className="text-xs text-gray-500 mb-1">Headers</p>
          <pre className="text-xs text-gray-300 font-mono bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap break-words">
            {JSON.stringify(result.headers, null, 2)}
          </pre>
        </div>
        {result.body && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Body</p>
            <pre className="text-xs text-gray-300 font-mono bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-auto">
              {result.body}
            </pre>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded cursor-pointer border border-gray-700">
          Dismiss
        </button>
        <button onClick={apply} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded cursor-pointer">
          Apply to current tab
        </button>
      </div>
    </div>
  )
}

// ─── Explain panel ──────────────────────────────────────────────────────────

function ExplainPanel() {
  const { tab } = useActiveTab()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExplainResponseResult | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!tab || !tab.response) return
    setLoading(true); setError(null)
    aiClient.explainResponse({
      request: {
        method: tab.method,
        url: tab.url,
        headers: headersFromKV(tab.headers),
        body: tab.body,
      },
      response: {
        status: tab.response.status,
        statusText: tab.response.statusText,
        headers: tab.response.headers,
        body: tab.response.body,
      },
    })
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof AiLimitError ? e.message : (e?.message ?? 'Failed'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!result) return null

  return (
    <div className="space-y-3">
      <p className="text-sm text-white">{result.summary}</p>
      <ul className="space-y-1.5 list-disc list-inside text-sm text-gray-300">
        {result.details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </div>
  )
}

// ─── Tests panel ────────────────────────────────────────────────────────────

function TestsPanel() {
  const { tab } = useActiveTab()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateTestsResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!tab || !tab.response) return
    setLoading(true); setError(null)
    aiClient.generateTests({
      request: {
        method: tab.method,
        url: tab.url,
        headers: headersFromKV(tab.headers),
        body: tab.body,
      },
      response: {
        status: tab.response.status,
        statusText: tab.response.statusText,
        headers: tab.response.headers,
        body: tab.response.body,
      },
    })
      .then((r) => { if (!cancelled) setResult(r) })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof AiLimitError ? e.message : (e?.message ?? 'Failed'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!result) return null

  const copy = async () => {
    await navigator.clipboard.writeText(result.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Framework: {result.framework}</p>
      {result.tests.length > 0 && (
        <ul className="space-y-1 text-sm text-gray-300 list-disc list-inside">
          {result.tests.map((t, i) => (
            <li key={i}><span className="font-medium text-white">{t.name}</span> — {t.description}</li>
          ))}
        </ul>
      )}
      <pre className="text-xs text-gray-300 font-mono bg-gray-800/50 border border-gray-700 rounded p-3 whitespace-pre-wrap break-words max-h-80 overflow-auto">
        {result.code}
      </pre>
      <div className="flex justify-end">
        <button onClick={copy} className={`text-sm px-4 py-2 rounded cursor-pointer ${copied ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
    </div>
  )
}

// ─── NL-to-request panel ───────────────────────────────────────────────────

function NlPanel({ onClose }: { onClose: () => void }) {
  const { tab, updateTab } = useActiveTab()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<NlRequestResult | null>(null)

  const run = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await aiClient.nlToRequest(prompt)
      setResult(r)
    } catch (e) {
      setError(e instanceof AiLimitError ? e.message : (e instanceof Error ? e.message : 'Failed'))
    } finally {
      setLoading(false)
    }
  }

  const apply = () => {
    if (!result || !tab) return
    updateTab(tab.id, {
      method: result.method as HttpMethod,
      url: result.url,
      headers: kvFromHeaders(result.headers),
      body: result.body ?? '',
    })
    onClose()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        Describe the request you want to make (e.g. "Get the first todo from JSONPlaceholder" or "POST a new post with title hello").
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your request..."
        className="w-full h-24 bg-gray-800 border border-gray-700 rounded p-3 text-sm text-white outline-none focus:border-blue-500 resize-none"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-4 py-2 rounded cursor-pointer border border-gray-700">
          Cancel
        </button>
        <button
          onClick={run}
          disabled={!prompt.trim() || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded cursor-pointer"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {result && (
        <div className="space-y-3 pt-3 border-t border-gray-800">
          <p className="text-sm text-gray-300">{result.explanation}</p>
          <KVRow label="Method" value={result.method} />
          <KVRow label="URL" value={result.url} mono />
          <div>
            <p className="text-xs text-gray-500 mb-1">Headers</p>
            <pre className="text-xs text-gray-300 font-mono bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap break-words">
              {JSON.stringify(result.headers, null, 2)}
            </pre>
          </div>
          {result.body && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Body</p>
              <pre className="text-xs text-gray-300 font-mono bg-gray-800/50 border border-gray-700 rounded p-2 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                {result.body}
              </pre>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={apply} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded cursor-pointer">
              Apply to current tab
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tiny reusable bits ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{children}</p>
}

function KVRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-sm items-baseline">
      <span className="text-gray-500 w-16 shrink-0">{label}</span>
      <span className={`text-white break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
