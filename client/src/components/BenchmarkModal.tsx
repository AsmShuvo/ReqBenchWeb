import { useState, useMemo, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { useRequestStore, type KeyValuePair } from '../store/useRequestStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { resolveString, buildVariableMap } from '../lib/resolveVariables'
<<<<<<< HEAD
=======
import { useEscape } from '../lib/useEscape'
>>>>>>> 2894d4a (update readme)

// ─── Types ──────────────────────────────────────────────────────────────────

interface BenchmarkConfig {
  totalRequests: number
  concurrency: number
  warmupCount: number
  delayMs: number
}

interface BenchmarkResults {
  totalRequests: number
  successCount: number
  failureCount: number
  errorRate: number
  totalDuration: number
  requestsPerSecond: number
  minResponseTime: number
  maxResponseTime: number
  avgResponseTime: number
  medianResponseTime: number
  p90: number
  p95: number
  p99: number
  statusCodeBreakdown: Record<string, number>
  timeSeries: { index: number; responseTime: number; status: number | null }[]
}

interface SavedBenchmark {
  id: string
  label: string
  config: BenchmarkConfig
  results: BenchmarkResults
  timestamp: number
}

const STORAGE_KEY = 'reqbench-benchmarks'

function loadSaved(): SavedBenchmark[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveBenchmark(entry: SavedBenchmark) {
  const existing = loadSaved()
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...existing].slice(0, 20)))
}

// ─── Charts (Recharts) ──────────────────────────────────────────────────────

const statusColor = (code: string): string => {
  if (code === 'error') return '#dc2626'
  const n = Number(code)
  if (n >= 200 && n < 300) return '#22c55e'
  if (n >= 300 && n < 400) return '#eab308'
  if (n >= 400 && n < 500) return '#f97316'
  if (n >= 500) return '#ef4444'
  return '#64748b'
}

function TimeSeriesChart({ series }: { series: BenchmarkResults['timeSeries'] }) {
  if (series.length === 0) return null
  const data = series.map((s) => ({
    index: s.index + 1,
    responseTime: s.responseTime,
    status: s.status,
  }))

  return (
    <div>
      <h4 className="text-xs text-gray-400 mb-2">Response Time (per request)</h4>
      <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
            <XAxis dataKey="index" stroke="#9ca3af" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} unit="ms" />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }}
              labelFormatter={(v) => `#${v}`}
<<<<<<< HEAD
              formatter={(value: number, _n, p) => [`${value}ms`, `Status ${p.payload.status ?? 'error'}`]}
=======
              formatter={(value, _n, p) => {
                const status = (p as { payload?: { status?: number | null } }).payload?.status
                return [`${value}ms`, `Status ${status ?? 'error'}`] as [string, string]
              }}
>>>>>>> 2894d4a (update readme)
            />
            <Line type="monotone" dataKey="responseTime" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function HistogramChart({ results }: { results: BenchmarkResults }) {
  const times = results.timeSeries.map((s) => s.responseTime).sort((a, b) => a - b)
  if (times.length === 0) return null

  const max = times[times.length - 1]
  const bucketCount = Math.min(10, times.length)
  const bucketSize = Math.max(Math.ceil(max / bucketCount), 1)

  const data: { label: string; count: number }[] = []
  for (let i = 0; i < bucketCount; i++) {
    const lo = i * bucketSize
    const hi = lo + bucketSize
    data.push({
      label: `${lo}-${hi}`,
      count: times.filter((t) => t >= lo && t < hi).length,
    })
  }

  return (
    <div>
      <h4 className="text-xs text-gray-400 mb-2">Response Time Distribution (ms)</h4>
      <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 10 }} />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }}
<<<<<<< HEAD
              formatter={(value: number) => [`${value} requests`, 'Count']}
=======
              formatter={(value) => [`${value} requests`, 'Count'] as [string, string]}
>>>>>>> 2894d4a (update readme)
            />
            <Bar dataKey="count" fill="#3b82f6" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function StatusChart({ breakdown }: { breakdown: Record<string, number> }) {
  const data = Object.entries(breakdown).map(([code, count]) => ({
    name: code,
    value: count,
    fill: statusColor(code),
  }))
  if (data.length === 0) return null

  return (
    <div>
      <h4 className="text-xs text-gray-400 mb-2">Status Code Breakdown</h4>
      <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }}
<<<<<<< HEAD
              formatter={(value: number, name: string) => [`${value} requests`, name]}
=======
              formatter={(value, name) => [`${value} requests`, String(name)] as [string, string]}
>>>>>>> 2894d4a (update readme)
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#d1d5db' }} />
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function Stat({ label, value, unit, highlight }: { label: string; value: string | number; unit?: string; highlight?: string }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${highlight ?? 'text-white'}`}>
        {value}
        {unit && <span className="text-xs text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  )
}

// ─── Main Modal ─────────────────────────────────────────────────────────────

function buildResolvedRequest(
  tab: {
    method: string
    url: string
    params: KeyValuePair[]
    headers: KeyValuePair[]
    body: string
    authType: string
    authToken: string
  },
  varMap: Map<string, string>,
) {
  const resolvedUrl = resolveString(tab.url, varMap).resolved
  const resolvedParams = tab.params
    .filter((p) => p.enabled && p.key)
    .map((p) => ({
      key: resolveString(p.key, varMap).resolved,
      value: resolveString(p.value, varMap).resolved,
    }))
  const resolvedHeaders = tab.headers
    .filter((p) => p.enabled && p.key)
    .map((p) => ({
      key: resolveString(p.key, varMap).resolved,
      value: resolveString(p.value, varMap).resolved,
    }))
  const resolvedBody = resolveString(tab.body, varMap).resolved
  const resolvedAuthToken = resolveString(tab.authToken, varMap).resolved

  let fullUrl = resolvedUrl
  if (resolvedParams.length > 0) {
    try {
      const u = new URL(resolvedUrl)
      resolvedParams.forEach((p) => u.searchParams.append(p.key, p.value))
      fullUrl = u.toString()
    } catch { /* use as-is */ }
  }

  const headers: Record<string, string> = {}
  resolvedHeaders.forEach((h) => { headers[h.key] = h.value })
  if (tab.authType === 'bearer' && resolvedAuthToken) {
    headers['Authorization'] = `Bearer ${resolvedAuthToken}`
  } else if (tab.authType === 'basic' && resolvedAuthToken) {
    headers['Authorization'] = `Basic ${btoa(resolvedAuthToken)}`
  }

  return { method: tab.method, url: fullUrl, headers, body: resolvedBody }
}

export default function BenchmarkModal({ onClose }: { onClose: () => void }) {
<<<<<<< HEAD
=======
  useEscape(onClose)
>>>>>>> 2894d4a (update readme)
  const { tabs, activeTabId } = useRequestStore()
  const { environments, activeEnvironmentId } = useEnvironmentStore()
  const tab = tabs.find((t) => t.id === activeTabId)

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const varMap = useMemo(
    () => (activeEnv ? buildVariableMap(activeEnv.variables) : new Map<string, string>()),
    [activeEnv],
  )

  const [config, setConfig] = useState<BenchmarkConfig>({
    totalRequests: 20,
    concurrency: 5,
    warmupCount: 2,
    delayMs: 0,
  })
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<BenchmarkResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const runIdRef = useRef<string | null>(null)

  if (!tab) return null

  const handleRun = async () => {
    setRunning(true)
    setResults(null)
    setError(null)
    setSaved(false)
    setCancelled(false)

    const resolved = buildResolvedRequest(tab, varMap)
    const runId = crypto.randomUUID()
    runIdRef.current = runId

    try {
      const res = await fetch('/api/benchmarks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          ...resolved,
          totalRequests: config.totalRequests,
          concurrency: config.concurrency,
          warmupCount: config.warmupCount,
          delayMs: config.delayMs,
        }),
      })

      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResults(data)
        if (data.cancelled) setCancelled(true)
      }
    } catch {
      setError('Failed to reach backend server')
    } finally {
      setRunning(false)
      runIdRef.current = null
    }
  }

  const handleCancel = async () => {
    if (!runIdRef.current) return
    try {
      await fetch('/api/benchmarks/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current }),
      })
    } catch { /* ignore — run will finish and return whatever it has */ }
  }

  const handleSave = () => {
    if (!results) return
    saveBenchmark({
      id: crypto.randomUUID(),
      label: `${tab.method} ${tab.name} - ${new Date().toLocaleString()}`,
      config,
      results,
      timestamp: Date.now(),
    })
    setSaved(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Benchmark</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {tab.method} {tab.url || 'No URL set'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer px-1">&times;</button>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Config form */}
          <div className="p-4 border-b border-gray-800">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Total Requests</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={config.totalRequests}
                  onChange={(e) => setConfig((c) => ({ ...c, totalRequests: Number(e.target.value) }))}
                  disabled={running}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Concurrency</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={config.concurrency}
                  onChange={(e) => setConfig((c) => ({ ...c, concurrency: Number(e.target.value) }))}
                  disabled={running}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Warmup</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={config.warmupCount}
                  onChange={(e) => setConfig((c) => ({ ...c, warmupCount: Number(e.target.value) }))}
                  disabled={running}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Delay (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={config.delayMs}
                  onChange={(e) => setConfig((c) => ({ ...c, delayMs: Number(e.target.value) }))}
                  disabled={running}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleRun}
                disabled={running || !tab.url.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2 rounded cursor-pointer"
              >
                {running ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running...
                  </span>
                ) : (
                  'Run Benchmark'
                )}
              </button>
              {running && (
                <button
                  onClick={handleCancel}
                  className="text-sm text-red-400 hover:text-red-300 cursor-pointer px-4 py-2 border border-red-500/40 rounded"
                >
                  Cancel
                </button>
              )}
              {cancelled && !running && (
                <span className="text-sm text-yellow-400">Run cancelled — partial results shown</span>
              )}
              {results && !saved && (
                <button
                  onClick={handleSave}
                  className="text-sm text-gray-400 hover:text-white cursor-pointer px-4 py-2 border border-gray-700 rounded"
                >
                  Save Results
                </button>
              )}
              {saved && <span className="text-sm text-green-400">Saved</span>}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="p-4 space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Requests/sec" value={results.requestsPerSecond} highlight="text-blue-400" />
                <Stat label="Avg Response" value={results.avgResponseTime} unit="ms" />
                <Stat label="Success Rate" value={`${(100 - results.errorRate).toFixed(1)}%`} highlight={results.errorRate > 5 ? 'text-red-400' : 'text-green-400'} />
                <Stat label="Total Duration" value={(results.totalDuration / 1000).toFixed(2)} unit="s" />
              </div>

              <div className="grid grid-cols-5 gap-3">
                <Stat label="Min" value={results.minResponseTime} unit="ms" />
                <Stat label="Median" value={results.medianResponseTime} unit="ms" />
                <Stat label="P90" value={results.p90} unit="ms" />
                <Stat label="P95" value={results.p95} unit="ms" />
                <Stat label="P99" value={results.p99} unit="ms" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Stat label="Total" value={results.totalRequests} />
                <Stat label="Success" value={results.successCount} highlight="text-green-400" />
                <Stat label="Failed" value={results.failureCount} highlight={results.failureCount > 0 ? 'text-red-400' : 'text-gray-400'} />
              </div>

              {/* Charts */}
              <TimeSeriesChart series={results.timeSeries} />
              <div className="grid grid-cols-2 gap-5">
                <HistogramChart results={results} />
                <StatusChart breakdown={results.statusCodeBreakdown} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
