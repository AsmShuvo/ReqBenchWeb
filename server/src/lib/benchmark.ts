export interface BenchmarkConfig {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  totalRequests: number
  concurrency: number
  warmupCount: number
  delayMs: number
  timeoutMs: number
  runSignal?: AbortSignal
}

export interface RequestResult {
  index: number
  status: number | null
  responseTime: number
  error: string | null
  timestamp: number
}

export interface BenchmarkResults {
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function executeOne(
  config: BenchmarkConfig,
  index: number,
): Promise<RequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  const timestamp = Date.now()

  try {
    const fetchOptions: RequestInit = {
      method: config.method,
      headers: config.headers,
      signal: controller.signal,
    }

    if (config.body && config.method !== 'GET' && config.method !== 'HEAD') {
      fetchOptions.body = config.body
    }

    const start = performance.now()
    const response = await fetch(config.url, fetchOptions)
    // Consume body to measure full response time
    await response.text()
    const responseTime = Math.round(performance.now() - start)

    return { index, status: response.status, responseTime, error: null, timestamp }
  } catch (err: unknown) {
    const responseTime = Math.round(performance.now() - timestamp)
    if (err instanceof Error && err.name === 'AbortError') {
      return { index, status: null, responseTime, error: 'timeout', timestamp }
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { index, status: null, responseTime, error: message, timestamp }
  } finally {
    clearTimeout(timeout)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResults> {
  // Warmup phase (results discarded)
  for (let i = 0; i < config.warmupCount; i++) {
    if (config.runSignal?.aborted) break
    await executeOne(config, -1)
    if (config.delayMs > 0) await sleep(config.delayMs)
  }

  const results: RequestResult[] = []
  let nextIndex = 0
  const total = config.totalRequests
  const benchmarkStart = performance.now()

  // Worker pool: N concurrent workers pull from a shared counter
  async function worker() {
    while (true) {
      if (config.runSignal?.aborted) break
      const idx = nextIndex++
      if (idx >= total) break

      const result = await executeOne(config, idx)
      results.push(result)

      if (config.delayMs > 0) await sleep(config.delayMs)
    }
  }

  const workers = Array.from(
    { length: Math.min(config.concurrency, total) },
    () => worker(),
  )
  await Promise.all(workers)

  const totalDuration = Math.round(performance.now() - benchmarkStart)

  // Compute stats
  const successResults = results.filter((r) => r.status !== null && r.status < 500)
  const failureCount = results.length - successResults.length
  const times = results.map((r) => r.responseTime).sort((a, b) => a - b)

  const statusBreakdown: Record<string, number> = {}
  for (const r of results) {
    const key = r.status !== null ? String(r.status) : 'error'
    statusBreakdown[key] = (statusBreakdown[key] || 0) + 1
  }

  const sum = times.reduce((a, b) => a + b, 0)

  return {
    totalRequests: results.length,
    successCount: successResults.length,
    failureCount,
    errorRate: results.length > 0 ? Number(((failureCount / results.length) * 100).toFixed(2)) : 0,
    totalDuration,
    requestsPerSecond: totalDuration > 0 ? Number(((results.length / totalDuration) * 1000).toFixed(2)) : 0,
    minResponseTime: times[0] ?? 0,
    maxResponseTime: times[times.length - 1] ?? 0,
    avgResponseTime: times.length > 0 ? Math.round(sum / times.length) : 0,
    medianResponseTime: percentile(times, 50),
    p90: percentile(times, 90),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    statusCodeBreakdown: statusBreakdown,
    timeSeries: results
      .sort((a, b) => a.index - b.index)
      .map((r) => ({ index: r.index, responseTime: r.responseTime, status: r.status })),
  }
}
