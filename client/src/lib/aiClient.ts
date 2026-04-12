import { useAiLimitStore } from '../store/useAiLimitStore'

export interface FixRequestInput {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  status?: number
  statusText?: string
  error?: string
}

export interface FixRequestResult {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  explanation: string
}

export interface ExplainResponseInput {
  request: { method: string; url: string; headers: Record<string, string>; body: string }
  response: { status: number; statusText: string; headers: Record<string, string>; body: string }
}

export interface ExplainResponseResult {
  summary: string
  details: string[]
}

export interface GenerateTestsResult {
  framework: string
  code: string
  tests: Array<{ name: string; description: string }>
}

export interface NlRequestResult {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  explanation: string
}

export class AiLimitError extends Error {
  constructor() {
    super('Daily AI limit reached. Try again tomorrow.')
    this.name = 'AiLimitError'
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const store = useAiLimitStore.getState()
  if (!store.tryConsume()) {
    throw new AiLimitError()
  }
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Request failed: ${res.status}`)
  }
  return data as T
}

export const aiClient = {
  fixRequest: (input: FixRequestInput) =>
    post<FixRequestResult>('/api/ai/fix-request', input),
  explainResponse: (input: ExplainResponseInput) =>
    post<ExplainResponseResult>('/api/ai/explain-response', input),
  generateTests: (input: ExplainResponseInput) =>
    post<GenerateTestsResult>('/api/ai/generate-tests', input),
  nlToRequest: (prompt: string) =>
    post<NlRequestResult>('/api/ai/nl-to-request', { prompt }),
}
