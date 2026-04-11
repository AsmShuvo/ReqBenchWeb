// Each generator receives a resolved request and returns a code string.
// To add a new language, add a new generator function and register it in `generators`.

export interface CodegenRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

export interface CodeGenerator {
  id: string
  label: string
  language: string
  generate: (req: CodegenRequest) => string
}

// ─── cURL ────────────────────────────────────────────────────────────────────

function generateCurl(req: CodegenRequest): string {
  const parts: string[] = ['curl']

  if (req.method !== 'GET') {
    parts.push(`-X ${req.method}`)
  }

  parts.push(`'${req.url}'`)

  for (const [key, value] of Object.entries(req.headers)) {
    parts.push(`-H '${key}: ${value}'`)
  }

  if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
    parts.push(`-d '${req.body.replace(/'/g, "'\\''")}'`)
  }

  if (parts.length <= 3) {
    return parts.join(' ')
  }

  return parts.join(' \\\n  ')
}

// ─── JavaScript fetch ────────────────────────────────────────────────────────

function generateFetch(req: CodegenRequest): string {
  const hasHeaders = Object.keys(req.headers).length > 0
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD'
  const isSimpleGet = req.method === 'GET' && !hasHeaders

  if (isSimpleGet) {
    return `const response = await fetch('${req.url}');
const data = await response.json();
console.log(data);`
  }

  const options: string[] = []
  options.push(`  method: '${req.method}'`)

  if (hasHeaders) {
    const headerEntries = Object.entries(req.headers)
      .map(([k, v]) => `    '${k}': '${v}'`)
      .join(',\n')
    options.push(`  headers: {\n${headerEntries}\n  }`)
  }

  if (hasBody) {
    const bodyStr = tryFormatJson(req.body)
      ? `JSON.stringify(${indentBlock(tryFormatJson(req.body)!, 2)})`
      : `'${req.body.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
    options.push(`  body: ${bodyStr}`)
  }

  return `const response = await fetch('${req.url}', {
${options.join(',\n')}
});
const data = await response.json();
console.log(data);`
}

// ─── JavaScript axios ────────────────────────────────────────────────────────

function generateAxios(req: CodegenRequest): string {
  const hasHeaders = Object.keys(req.headers).length > 0
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD'
  const methodLower = req.method.toLowerCase()

  if (methodLower === 'get' && !hasHeaders) {
    return `const { data } = await axios.get('${req.url}');
console.log(data);`
  }

  if (!hasBody && !hasHeaders) {
    return `const { data } = await axios.${methodLower}('${req.url}');
console.log(data);`
  }

  const config: string[] = []
  config.push(`  url: '${req.url}'`)
  config.push(`  method: '${methodLower}'`)

  if (hasHeaders) {
    const headerEntries = Object.entries(req.headers)
      .map(([k, v]) => `    '${k}': '${v}'`)
      .join(',\n')
    config.push(`  headers: {\n${headerEntries}\n  }`)
  }

  if (hasBody) {
    const formatted = tryFormatJson(req.body)
    if (formatted) {
      config.push(`  data: ${indentBlock(formatted, 2)}`)
    } else {
      config.push(`  data: '${req.body.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
    }
  }

  return `const { data } = await axios({
${config.join(',\n')}
});
console.log(data);`
}

// ─── Python requests ─────────────────────────────────────────────────────────

function generatePython(req: CodegenRequest): string {
  const lines: string[] = ['import requests', '']
  const hasHeaders = Object.keys(req.headers).length > 0
  const hasBody = req.body && req.method !== 'GET' && req.method !== 'HEAD'
  const methodLower = req.method.toLowerCase()

  if (hasHeaders) {
    const headerEntries = Object.entries(req.headers)
      .map(([k, v]) => `    "${k}": "${v}"`)
      .join(',\n')
    lines.push(`headers = {\n${headerEntries}\n}`)
    lines.push('')
  }

  if (hasBody) {
    const formatted = tryFormatJson(req.body)
    if (formatted) {
      lines.push(`payload = ${jsonToPythonDict(req.body)}`)
    } else {
      lines.push(`payload = """${req.body}"""`)
    }
    lines.push('')
  }

  const args: string[] = [`"${req.url}"`]
  if (hasHeaders) args.push('headers=headers')
  if (hasBody) {
    const isJson = tryFormatJson(req.body)
    args.push(isJson ? 'json=payload' : 'data=payload')
  }

  lines.push(`response = requests.${methodLower}(${args.join(', ')})`)
  lines.push('print(response.status_code)')
  lines.push('print(response.json())')

  return lines.join('\n')
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryFormatJson(text: string): string | null {
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

function indentBlock(text: string, baseIndent: number): string {
  const indent = ' '.repeat(baseIndent)
  const lines = text.split('\n')
  return lines.map((line, i) => (i === 0 ? line : indent + line)).join('\n')
}

function jsonToPythonDict(jsonStr: string): string {
  try {
    const obj = JSON.parse(jsonStr)
    return pythonRepr(obj)
  } catch {
    return `"""${jsonStr}"""`
  }
}

function pythonRepr(val: unknown, indent = 0): string {
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 4)

  if (val === null) return 'None'
  if (val === true) return 'True'
  if (val === false) return 'False'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'string') return `"${val}"`

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    const items = val.map((v) => `${inner}${pythonRepr(v, indent + 4)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const items = entries.map(([k, v]) => `${inner}"${k}": ${pythonRepr(v, indent + 4)}`)
    return `{\n${items.join(',\n')}\n${pad}}`
  }

  return String(val)
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const generators: CodeGenerator[] = [
  { id: 'curl', label: 'cURL', language: 'bash', generate: generateCurl },
  { id: 'fetch', label: 'JavaScript (fetch)', language: 'javascript', generate: generateFetch },
  { id: 'axios', label: 'JavaScript (axios)', language: 'javascript', generate: generateAxios },
  { id: 'python', label: 'Python (requests)', language: 'python', generate: generatePython },
]
