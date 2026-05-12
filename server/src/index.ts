import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { prisma } from './lib/prisma'
import { runBenchmark } from './lib/benchmark'
import { callGroq, groqConfigured, safeParseJson } from './lib/groq'
import {
  hashPassword, verifyPassword, signToken, requireAuth, isValidEmail,
} from './lib/auth'
import { readSnapshot, writeSnapshot, type SyncSnapshot } from './lib/sync'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))

// ─── Health ────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// ─── HTTP proxy: execute a single request on behalf of the browser ─────────

app.post('/api/requests/execute', async (req, res) => {
  const { method, url, headers, body } = req.body

  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }
  try { new URL(url) } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const start = performance.now()
    const response = await fetch(url, {
      method,
      headers: headers || {},
      body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
      signal: controller.signal,
    })
    const responseTime = Math.round(performance.now() - start)

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => { responseHeaders[key] = value })

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

// ─── Benchmark ─────────────────────────────────────────────────────────────

const activeRuns = new Map<string, AbortController>()

app.post('/api/benchmarks/run', async (req, res) => {
  const { runId, method, url, headers, body, totalRequests, concurrency } = req.body

  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }
  try { new URL(url) } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const total = Math.min(Math.max(Number(totalRequests) || 1, 1), 500)
  const conc = Math.min(Math.max(Number(concurrency) || 1, 1), 50)

  const controller = new AbortController()
  if (runId) activeRuns.set(runId, controller)

  try {
    const results = await runBenchmark({
      method, url, headers: headers || {}, body,
      totalRequests: total,
      concurrency: conc,
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
  const controller = activeRuns.get(req.body?.runId)
  if (!controller) {
    res.status(404).json({ error: 'No active run with that id' })
    return
  }
  controller.abort()
  res.json({ cancelled: true })
})

// ─── AI (Groq) ─────────────────────────────────────────────────────────────

app.get('/api/ai/status', (_req, res) => {
  res.json({ configured: groqConfigured() })
})

function truncate(s: unknown, n = 1500): string {
  const str = typeof s === 'string' ? s : JSON.stringify(s ?? '')
  return str.length > n ? str.slice(0, n) + '\n...[truncated]' : str
}

// "Fix this failing request"
app.post('/api/ai/fix-request', async (req, res) => {
  const { method, url, headers, body, status, statusText } = req.body ?? {}
  if (!url) {
    res.status(400).json({ error: 'url is required' })
    return
  }

  const system =
    'You are an HTTP debugging assistant. Given a failing HTTP request, suggest a corrected version. ' +
    'Respond ONLY with JSON: {"method": string, "url": string, "headers": {string: string}, "body": string, "explanation": string}. ' +
    'explanation: at most 2 sentences about what was wrong.'

  const user = [
    `method: ${method ?? 'GET'}`,
    `url: ${url}`,
    `headers: ${truncate(headers, 500)}`,
    `body: ${truncate(body, 500)}`,
    `response status: ${status ?? 'n/a'} ${statusText ?? ''}`,
  ].join('\n')

  try {
    const raw = await callGroq([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    const parsed = safeParseJson(raw)
    if (!parsed) {
      res.status(502).json({ error: 'AI response was not valid JSON' })
      return
    }
    res.json(parsed)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// "Explain this response"
app.post('/api/ai/explain-response', async (req, res) => {
  const { request, response } = req.body ?? {}
  if (!response) {
    res.status(400).json({ error: 'response is required' })
    return
  }

  const system =
    'You are an API analyst. Given an HTTP request and its response, produce a plain-English explanation. ' +
    'Respond ONLY with JSON: {"summary": string, "details": string[]}. ' +
    'summary: one sentence. details: 3-6 bullet points about status, key headers, body shape and notable values.'

  const user = [
    `Request: ${request?.method ?? 'GET'} ${request?.url ?? ''}`,
    `Status: ${response.status} ${response.statusText ?? ''}`,
    `Body: ${truncate(response.body, 2000)}`,
  ].join('\n')

  try {
    const raw = await callGroq([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    const parsed = safeParseJson(raw)
    if (!parsed) {
      res.status(502).json({ error: 'AI response was not valid JSON' })
      return
    }
    res.json(parsed)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// "Natural language to HTTP request"
app.post('/api/ai/nl-to-request', async (req, res) => {
  const { prompt } = req.body ?? {}
  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' })
    return
  }

  const system =
    'You convert natural-language descriptions into HTTP requests. ' +
    'Respond ONLY with JSON: {"method": "GET"|"POST"|"PUT"|"PATCH"|"DELETE", "url": string, "headers": {string: string}, "body": string, "explanation": string}. ' +
    'Prefer public APIs (jsonplaceholder.typicode.com, httpbin.org) when no API is named.'

  try {
    const raw = await callGroq([
      { role: 'system', content: system },
      { role: 'user', content: prompt.slice(0, 1500) },
    ])
    const parsed = safeParseJson(raw)
    if (!parsed) {
      res.status(502).json({ error: 'AI response was not valid JSON' })
      return
    }
    res.json(parsed)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

// ─── Auth (JWT) ────────────────────────────────────────────────────────────

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
    const user = await prisma.user.create({
      data: {
        email,
        name: typeof name === 'string' && name.trim() ? name.trim() : null,
        passwordHash: await hashPassword(password),
      },
      select: { id: true, email: true, name: true },
    })
    res.json({ token: signToken({ userId: user.id, email: user.email }), user })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Signup failed' })
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
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    res.json({
      token: signToken({ userId: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name },
    })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed' })
  }
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ user })
})

// ─── Cloud sync (authenticated) ────────────────────────────────────────────

app.get('/api/sync/state', requireAuth, async (req, res) => {
  try {
    res.json(await readSnapshot(req.user!.userId))
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Read failed' })
  }
})

app.post('/api/sync/push', requireAuth, async (req, res) => {
  const snap = req.body as SyncSnapshot
  if (!snap || !Array.isArray(snap.collections)) {
    res.status(400).json({ error: 'Snapshot must include collections[]' })
    return
  }
  try {
    await writeSnapshot(req.user!.userId, snap)
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Push failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
