import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './lib/prisma'
import { runBenchmark } from './lib/benchmark'
import { callGroq, groqConfigured, safeParseJson } from './lib/groq'
import {
  hashPassword, verifyPassword, signToken, requireAuth, isValidEmail,
} from './lib/auth'
import { readSnapshot, writeSnapshot, mergeSnapshots, type SyncSnapshot } from './lib/sync'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(503).json({ status: 'error', database: 'disconnected', error: message })
  }
})

app.post('/api/requests/execute', async (req, res) => {
  const { method, url, headers, body } = req.body

  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }

  try {
    new URL(url)
  } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const start = performance.now()

    const fetchOptions: RequestInit = {
      method,
      headers: headers || {},
      signal: controller.signal,
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)
    const responseTime = Math.round(performance.now() - start)

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    const responseBody = await response.text()

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      responseTime,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      res.status(408).json({ error: 'Request timed out (30s)' })
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: `Network error: ${message}` })
  } finally {
    clearTimeout(timeout)
  }
})

// In-memory registry of active benchmark runs (keyed by client-supplied runId)
const activeRuns = new Map<string, AbortController>()

app.post('/api/benchmarks/run', async (req, res) => {
  const {
    runId,
    method,
    url,
    headers,
    body,
    totalRequests,
    concurrency,
    warmupCount = 0,
    delayMs = 0,
  } = req.body

  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }

  try {
    new URL(url)
  } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const total = Math.min(Math.max(Number(totalRequests) || 1, 1), 1000)
  const conc = Math.min(Math.max(Number(concurrency) || 1, 1), 50)
  const warmup = Math.min(Math.max(Number(warmupCount) || 0, 0), 10)
  const delay = Math.min(Math.max(Number(delayMs) || 0, 0), 5000)

  const controller = new AbortController()
  if (runId && typeof runId === 'string') {
    activeRuns.set(runId, controller)
  }

  try {
    const results = await runBenchmark({
      method,
      url,
      headers: headers || {},
      body,
      totalRequests: total,
      concurrency: conc,
      warmupCount: warmup,
      delayMs: delay,
      timeoutMs: 30000,
      runSignal: controller.signal,
    })

    res.json({ ...results, cancelled: controller.signal.aborted })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Benchmark failed: ${message}` })
  } finally {
    if (runId) activeRuns.delete(runId)
  }
})

app.post('/api/benchmarks/cancel', (req, res) => {
  const { runId } = req.body
  if (!runId || typeof runId !== 'string') {
    res.status(400).json({ error: 'runId is required' })
    return
  }
  const controller = activeRuns.get(runId)
  if (!controller) {
    res.status(404).json({ error: 'No active run with that id' })
    return
  }
  controller.abort()
  res.json({ cancelled: true })
})

// ─── AI routes (Groq free tier) ────────────────────────────────────────────

app.get('/api/ai/status', (_req, res) => {
  res.json({ configured: groqConfigured() })
})

function truncate(s: unknown, n = 2000): string {
  const str = typeof s === 'string' ? s : JSON.stringify(s ?? '')
  return str.length > n ? str.slice(0, n) + '\n...[truncated]' : str
}

app.post('/api/ai/fix-request', async (req, res) => {
  const { method, url, headers, body, error, status, statusText } = req.body ?? {}
  if (!url) {
    res.status(400).json({ error: 'url is required' })
    return
  }

  const system =
    'You are an HTTP debugging assistant. Given a failing request, return a JSON ' +
    'object with a suggested fix. Keep URLs, headers and body realistic. ' +
    'Respond ONLY with JSON: ' +
    '{"method": string, "url": string, "headers": {string: string}, "body": string, "explanation": string}. ' +
    'The explanation should be at most 3 sentences and explain what was wrong.'

  const user = [
    `Failing request:`,
    `method: ${method ?? 'GET'}`,
    `url: ${url}`,
    `headers: ${truncate(headers, 600)}`,
    `body: ${truncate(body, 600)}`,
    `response status: ${status ?? 'n/a'} ${statusText ?? ''}`,
    `error: ${truncate(error, 400)}`,
  ].join('\n')

  try {
    const raw = await callGroq(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { jsonMode: true, temperature: 0.2 },
    )
    const parsed = safeParseJson<{
      method: string; url: string; headers: Record<string, string>;
      body: string; explanation: string
    }>(raw)
    if (!parsed) {
      res.status(502).json({ error: 'AI response was not valid JSON', raw })
      return
    }
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.post('/api/ai/explain-response', async (req, res) => {
  const { request, response } = req.body ?? {}
  if (!response) {
    res.status(400).json({ error: 'response is required' })
    return
  }

  const system =
    'You are an API analyst. Given an HTTP request and its response, produce a plain-language ' +
    'explanation. Respond ONLY with JSON: ' +
    '{"summary": string, "details": string[]}. ' +
    'summary: one sentence. details: 3-6 bullet points about status, key headers, body shape, and notable values.'

  const user = [
    'Request:',
    `  method: ${request?.method ?? 'GET'}`,
    `  url: ${request?.url ?? ''}`,
    `  headers: ${truncate(request?.headers, 400)}`,
    `  body: ${truncate(request?.body, 400)}`,
    '',
    'Response:',
    `  status: ${response.status} ${response.statusText ?? ''}`,
    `  headers: ${truncate(response.headers, 500)}`,
    `  body: ${truncate(response.body, 2500)}`,
  ].join('\n')

  try {
    const raw = await callGroq(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { jsonMode: true, temperature: 0.2 },
    )
    const parsed = safeParseJson<{ summary: string; details: string[] }>(raw)
    if (!parsed) {
      res.status(502).json({ error: 'AI response was not valid JSON', raw })
      return
    }
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.post('/api/ai/generate-tests', async (req, res) => {
  const { request, response } = req.body ?? {}
  if (!request || !response) {
    res.status(400).json({ error: 'request and response are required' })
    return
  }

  const system =
    'You are a test-code generator. Given a successful HTTP request/response pair, generate ' +
    '3-6 Vitest/Jest-style assertions that verify contract, status, key fields and types. ' +
    'Respond ONLY with JSON: ' +
    '{"framework": "vitest", "code": string, "tests": [{"name": string, "description": string}]}. ' +
    'code: a single runnable test block (no imports of fetch-mocks), using `expect` on a variable `res` ' +
    'that is assumed to be the parsed JSON response and a variable `status` for the status code.'

  const user = [
    'Request:',
    `  method: ${request.method}`,
    `  url: ${request.url}`,
    '',
    'Response:',
    `  status: ${response.status}`,
    `  body: ${truncate(response.body, 2500)}`,
  ].join('\n')

  try {
    const raw = await callGroq(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { jsonMode: true, temperature: 0.2, maxTokens: 1800 },
    )
    const parsed = safeParseJson<{
      framework: string; code: string; tests: Array<{ name: string; description: string }>
    }>(raw)
    if (!parsed) {
      res.status(502).json({ error: 'AI response was not valid JSON', raw })
      return
    }
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

app.post('/api/ai/nl-to-request', async (req, res) => {
  const { prompt } = req.body ?? {}
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'prompt is required' })
    return
  }

  const system =
    'You convert natural-language descriptions into HTTP requests. ' +
    'Respond ONLY with JSON: ' +
    '{"method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE", "url": string, "headers": {string: string}, "body": string, "explanation": string}. ' +
    'Prefer real public APIs (jsonplaceholder.typicode.com, httpbin.org) when no API is named. ' +
    'Keep body as a JSON string (escaped). explanation: one sentence describing the request.'

  try {
    const raw = await callGroq(
      [{ role: 'system', content: system }, { role: 'user', content: prompt.slice(0, 1500) }],
      { jsonMode: true, temperature: 0.3 },
    )
    const parsed = safeParseJson<{
      method: string; url: string; headers: Record<string, string>;
      body: string; explanation: string
    }>(raw)
    if (!parsed) {
      res.status(502).json({ error: 'AI response was not valid JSON', raw })
      return
    }
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── Auth routes ──────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body ?? {}
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' })
    return
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ error: 'An account with that email already exists' })
      return
    }
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email,
        name: typeof name === 'string' && name.trim() ? name.trim() : null,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    })
    const token = signToken({ userId: user.id, email: user.email })
    res.json({ token, user })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Signup failed: ${message}` })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!isValidEmail(email) || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }
  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    const token = signToken({ userId: user.id, email: user.email })
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Login failed: ${message}` })
  }
})

// Logout is stateless with JWTs — the client just drops the token.
// We keep the endpoint for symmetry and future server-side allowlist / blacklist.
app.post('/api/auth/logout', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ user })
})

// ─── Sync routes (authenticated) ──────────────────────────────────────────

app.get('/api/sync/state', requireAuth, async (req, res) => {
  try {
    const snap = await readSnapshot(req.user!.userId)
    res.json(snap)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Read failed: ${message}` })
  }
})

app.post('/api/sync/push', requireAuth, async (req, res) => {
  const snap = req.body as SyncSnapshot
  if (!snap || !Array.isArray(snap.collections) || !Array.isArray(snap.history) || !Array.isArray(snap.environments)) {
    res.status(400).json({ error: 'Snapshot must include collections[], history[], environments[]' })
    return
  }
  try {
    await writeSnapshot(req.user!.userId, snap)
    res.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Push failed: ${message}` })
  }
})

app.post('/api/sync/merge', requireAuth, async (req, res) => {
  const snap = req.body as SyncSnapshot
  if (!snap || !Array.isArray(snap.collections) || !Array.isArray(snap.history) || !Array.isArray(snap.environments)) {
    res.status(400).json({ error: 'Snapshot must include collections[], history[], environments[]' })
    return
  }
  try {
    const merged = await mergeSnapshots(req.user!.userId, snap)
    res.json(merged)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Merge failed: ${message}` })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
