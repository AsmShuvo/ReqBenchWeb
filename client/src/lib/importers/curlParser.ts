import type { HttpMethod, KeyValuePair } from '../../repositories/types'

export interface ParsedCurl {
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  body: string
  authType: 'none' | 'bearer' | 'basic'
  authToken: string
}

const VALID_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Tokenize a cURL command string, handling single/double quotes and backslash escapes.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let i = 0
  let inSingle = false
  let inDouble = false

  while (i < input.length) {
    const ch = input[i]

    if (ch === '\\' && !inSingle && i + 1 < input.length) {
      // backslash escape — take next char literally
      // but if it's a newline (line continuation), skip both
      if (input[i + 1] === '\n') {
        i += 2
        continue
      }
      if (input[i + 1] === '\r' && input[i + 2] === '\n') {
        i += 3
        continue
      }
      current += input[i + 1]
      i += 2
      continue
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      i++
      continue
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      i++
      continue
    }

    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      i++
      continue
    }

    current += ch
    i++
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

export function parseCurl(input: string): ParsedCurl {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Empty input. Paste a cURL command.')
  }

  // Normalize: strip leading $ if present, require curl prefix
  let normalized = trimmed
  if (normalized.startsWith('$ ')) normalized = normalized.slice(2)

  if (!/^curl\s/i.test(normalized)) {
    throw new Error('Input must start with "curl". Paste a valid cURL command.')
  }

  const tokens = tokenize(normalized)
  // Remove the "curl" token
  tokens.shift()

  let method: HttpMethod | null = null
  let url = ''
  const headers: KeyValuePair[] = []
  let body = ''
  let authType: 'none' | 'bearer' | 'basic' = 'none'
  let authToken = ''

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]

    if (token === '-X' || token === '--request') {
      i++
      const m = tokens[i]?.toUpperCase()
      if (m && VALID_METHODS.has(m as HttpMethod)) {
        method = m as HttpMethod
      } else {
        throw new Error(`Unsupported HTTP method: "${tokens[i] ?? ''}". Supported: GET, POST, PUT, PATCH, DELETE.`)
      }
    } else if (token === '-H' || token === '--header') {
      i++
      const headerStr = tokens[i]
      if (!headerStr) throw new Error('Expected header value after -H flag.')
      const colonIdx = headerStr.indexOf(':')
      if (colonIdx === -1) {
        throw new Error(`Invalid header format: "${headerStr}". Expected "Key: Value".`)
      }
      const key = headerStr.slice(0, colonIdx).trim()
      const value = headerStr.slice(colonIdx + 1).trim()

      // Detect auth headers
      if (key.toLowerCase() === 'authorization') {
        if (value.toLowerCase().startsWith('bearer ')) {
          authType = 'bearer'
          authToken = value.slice(7).trim()
        } else if (value.toLowerCase().startsWith('basic ')) {
          authType = 'basic'
          try {
            authToken = atob(value.slice(6).trim())
          } catch {
            authToken = value.slice(6).trim()
          }
        } else {
          headers.push({ key, value, enabled: true })
        }
      } else {
        headers.push({ key, value, enabled: true })
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      i++
      body = tokens[i] ?? ''
    } else if (token === '-u' || token === '--user') {
      i++
      authType = 'basic'
      authToken = tokens[i] ?? ''
    } else if (token.startsWith('--compressed') || token === '-s' || token === '--silent'
      || token === '-k' || token === '--insecure' || token === '-v' || token === '--verbose'
      || token === '-L' || token === '--location' || token === '-i' || token === '--include') {
      // Skip known flags that don't affect the request model
    } else if (!token.startsWith('-')) {
      // Positional argument — treat as URL
      if (!url) {
        url = token
      }
    } else {
      // Unknown flag — skip, but if it looks like it takes a value, skip that too
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        i++ // skip value of unknown flag
      }
    }

    i++
  }

  if (!url) {
    throw new Error('No URL found in the cURL command.')
  }

  // Infer method: default GET unless body present
  if (!method) {
    method = body ? 'POST' : 'GET'
  }

  return {
    method,
    url,
    headers: headers.length > 0 ? headers : [{ key: '', value: '', enabled: true }],
    body,
    authType,
    authToken,
  }
}
