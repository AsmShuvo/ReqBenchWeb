// Groq chat completion helper — Groq is OpenAI-compatible, so no SDK needed.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function groqConfigured(): boolean {
  return Boolean(process.env.GROQ_API?.trim())
}

export async function callGroq(messages: GroqMessage[]): Promise<string> {
  const apiKey = process.env.GROQ_API
  if (!apiKey) throw new Error('GROQ_API is not set. Add it to server/.env and restart.')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq API ${res.status}: ${text.slice(0, 400)}`)
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq returned no content')
  return content
}

// LLMs sometimes wrap JSON in code fences or prose. Strip the cruft, parse the JSON.
export function safeParseJson<T = unknown>(text: string): T | null {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first !== -1 && last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)) as T } catch { return null }
    }
    return null
  }
}
