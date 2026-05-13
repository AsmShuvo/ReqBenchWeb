// Concurrent HTTP benchmark runner.
// Spins up N parallel workers that share a counter; computes P50/P90/P99.

export interface BenchmarkConfig {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  totalRequests: number
  concurrency: number
  timeoutMs: number
  runSignal?: AbortSignal
}

export interface RequestResult {
  index: number
  status: number | null
  responseTime: number
}

export interface BenchmarkResults {
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function executeOne(config: BenchmarkConfig, index: number): Promise<RequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  const start = performance.now()

  try {
    const res = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.body && config.method !== 'GET' && config.method !== 'HEAD' ? config.body : undefined,
      signal: controller.signal,
    })
    await res.text() // consume body so timing reflects full response
    return { index, status: res.status, responseTime: Math.round(performance.now() - start) }
  } catch {
    return { index, status: null, responseTime: Math.round(performance.now() - start) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResults> {
  const results: RequestResult[] = []
  let nextIndex = 0
  const total = config.totalRequests
  const benchmarkStart = performance.now()

  // Worker pool: each worker takes one task at a time and call executeOne until we've issued all requests or been signaled to stop.
  async function worker() {
    while (true) {
      if (config.runSignal?.aborted) break
      const idx = nextIndex++
      if (idx >= total) break
      results.push(await executeOne(config, idx))
    }
  }
 // create N promises for the workers and wait for all to complete
  await Promise.all(
    Array.from({ length: Math.min(config.concurrency, total) }, () => worker()),
  )

  const totalDuration = Math.round(performance.now() - benchmarkStart)
  // sorted array to compute percentiles 
  const times = results.map((r) => r.responseTime).sort((a, b) => a - b)
  const successCount = results.filter((r) => r.status !== null && r.status < 500).length

  // breakdown of status codes for showing histogram and error counts
  const statusBreakdown: Record<string, number> = {}
  for (const r of results) {
    const key = r.status === null ? 'error' : String(r.status)
    statusBreakdown[key] = (statusBreakdown[key] || 0) + 1
  }

  const sum = times.reduce((a, b) => a + b, 0)

  return {
    totalRequests: results.length,
    successCount,
    failureCount: results.length - successCount,
    totalDuration,
    requestsPerSecond: totalDuration > 0 ? Number(((results.length / totalDuration) * 1000).toFixed(2)) : 0,
    avgResponseTime: times.length > 0 ? Math.round(sum / times.length) : 0,
    p50: percentile(times, 50),
    p90: percentile(times, 90),
    p99: percentile(times, 99),
    statusCodeBreakdown: statusBreakdown,
    timeSeries: results
      .sort((a, b) => a.index - b.index)
      .map((r) => ({ index: r.index, responseTime: r.responseTime, status: r.status })),
  }
}
