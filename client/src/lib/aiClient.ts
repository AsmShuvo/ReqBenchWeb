// Thin client for the /api/ai/* routes.

export interface FixRequestInput {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  status?: number
  statusText?: string
}

export interface FixRequestResult {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  explanation: string
}

export interface ExplainResponseInput {
  request: { method: string; url: string }
  response: { status: number; statusText: string; body: string }
}

export interface ExplainResponseResult {
  summary: string
  details: string[]
}

export interface NlRequestResult {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  explanation: string
}

async function post<T>(path: string, body: unknown): Promise<T> {
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
  nlToRequest: (prompt: string) =>
    post<NlRequestResult>('/api/ai/nl-to-request', { prompt }),
}
