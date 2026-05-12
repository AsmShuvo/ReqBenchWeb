import { useState, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useRequestStore } from '../store/useRequestStore'

interface BenchmarkResults {
  totalRequests: number
  successCount: number
  failureCount: number
  totalDuration: number
  requestsPerSecond: number
  avgResponseTime: number
  p50: number
  p90: number
  p99: number
  statusCodeBreakdown: Record<string, number>
  timeSeries: { index: number; responseTime: number; status: number | null }[]
}

const statusColor = (code: string): string => {
  if (code === 'error') return '#dc2626'
  const n = Number(code)
  if (n >= 200 && n < 300) return '#22c55e'
  if (n >= 300 && n < 400) return '#eab308'
  if (n >= 400 && n < 500) return '#f97316'
  if (n >= 500) return '#ef4444'
  return '#64748b'
}

function Stat({ label, value, unit, highlight }: {
  label: string; value: string | number; unit?: string; highlight?: string
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${highlight ?? 'text-white'}`}>
        {value}{unit && <span className="text-xs text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  )
}

export default function BenchmarkModal({ onClose }: { onClose: () => void }) {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)!

  const [totalRequests, setTotalRequests] = useState(50)
  const [concurrency, setConcurrency] = useState(5)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<BenchmarkResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runIdRef = useRef<string | null>(null)

  const buildHeaders = () => {
    const out: Record<string, string> = {}
    for (const p of tab.headers) if (p.enabled && p.key) out[p.key] = p.value
    return out
  }

  const run = async () => {
    setRunning(true); setResults(null); setError(null)
    const runId = crypto.randomUUID()
    runIdRef.current = runId

    try {
      const res = await fetch('/api/benchmarks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          method: tab.method,
          url: tab.url,
          headers: buildHeaders(),
          body: tab.body,
          totalRequests, concurrency,
        }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResults(data)
    } catch {
      setError('Failed to reach backend')
    } finally {
      setRunning(false)
      runIdRef.current = null
    }
  }

  const cancel = async () => {
    if (!runIdRef.current) return
    await fetch('/api/benchmarks/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: runIdRef.current }),
    }).catch(() => {})
  }

  const pieData = results
    ? Object.entries(results.statusCodeBreakdown).map(([code, count]) => ({
        name: code, value: count, fill: statusColor(code),
      }))
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold">Benchmark</h2>
            <p className="text-xs text-gray-500">{tab.method} {tab.url || '(no URL)'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer">×</button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-4 border-b border-gray-800">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Total Requests</label>
                <input
                  type="number"
                  min={1} max={500}
                  value={totalRequests}
                  onChange={(e) => setTotalRequests(Number(e.target.value))}
                  disabled={running}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Concurrency</label>
                <input
                  type="number"
                  min={1} max={50}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  disabled={running}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={run}
                disabled={running || !tab.url.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm px-6 py-2 rounded cursor-pointer"
              >
                {running ? 'Running...' : 'Run Benchmark'}
              </button>
              {running && (
                <button
                  onClick={cancel}
                  className="text-sm text-red-400 hover:text-red-300 px-4 py-2 border border-red-500/40 rounded cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4">
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">{error}</div>
            </div>
          )}

          {results && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Requests/sec" value={results.requestsPerSecond} highlight="text-blue-400" />
                <Stat label="Avg" value={results.avgResponseTime} unit="ms" />
                <Stat label="Success" value={results.successCount} highlight="text-green-400" />
                <Stat label="Failed" value={results.failureCount} highlight={results.failureCount > 0 ? 'text-red-400' : 'text-gray-400'} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="P50" value={results.p50} unit="ms" />
                <Stat label="P90" value={results.p90} unit="ms" />
                <Stat label="P99" value={results.p99} unit="ms" />
              </div>

              <div>
                <h4 className="text-xs text-gray-400 mb-2">Response Time</h4>
                <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={results.timeSeries.map((s) => ({ index: s.index + 1, ms: s.responseTime }))}>
                      <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
                      <XAxis dataKey="index" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} unit="ms" />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }} />
                      <Line type="monotone" dataKey="ms" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {pieData.length > 0 && (
                <div>
                  <h4 className="text-xs text-gray-400 mb-2">Status Codes</h4>
                  <div className="bg-gray-800/50 border border-gray-700 rounded p-2">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#d1d5db' }} />
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} isAnimationActive={false}>
                          {pieData.map((e) => <Cell key={e.name} fill={e.fill} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
