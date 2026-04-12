// Groq chat completion helper.
// Uses Groq's OpenAI-compatible REST endpoint; no SDK dependency.
// Reads GROQ_API from process.env. Model can be overridden via GROQ_MODEL.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GroqOptions {
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
}

export function groqConfigured(): boolean {
  return Boolean(process.env.GROQ_API && process.env.GROQ_API.trim())
}

export async function callGroq(
  messages: GroqMessage[],
  opts: GroqOptions = {},
): Promise<string> {
  const apiKey = process.env.GROQ_API
  if (!apiKey) {
    throw new Error('GROQ_API is not set on the server. Add it to server/.env and restart.')
  }

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1500,
  }
  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq API ${res.status}: ${text.slice(0, 400)}`)
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Groq returned no content')
  }
  return content
}

// Attempt to parse a JSON object from an LLM response. Strips ```json fences
// and trailing text. Returns null on failure.
export function safeParseJson<T = unknown>(text: string): T | null {
  let cleaned = text.trim()
  // Remove code fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  }
  // Try direct parse
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Fall through — try extracting the first JSON object
  }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1)
    try {
      return JSON.parse(slice) as T
    } catch {
      return null
    }
  }
  return null
}
