import type { HttpMethod, KeyValuePair, SavedRequest, CollectionFolder, Collection } from '../../repositories/types'

export interface OpenApiImportSummary {
  collectionName: string
  requestCount: number
  folderCount: number
  warnings: string[]
}

const VALID_METHODS = new Set<string>(['get', 'post', 'put', 'patch', 'delete'])

// ─── Minimal OpenAPI 3.x types ─────────────────────────────────────────────

interface OpenApiParameter {
  name?: string
  in?: string // 'query' | 'header' | 'path' | 'cookie'
  required?: boolean
  schema?: OpenApiSchema
  example?: unknown
}

interface OpenApiSchema {
  type?: string
  properties?: Record<string, OpenApiSchema>
  items?: OpenApiSchema
  example?: unknown
  default?: unknown
  enum?: unknown[]
  $ref?: string
  required?: string[]
  allOf?: OpenApiSchema[]
  oneOf?: OpenApiSchema[]
  anyOf?: OpenApiSchema[]
}

interface OpenApiMediaType {
  schema?: OpenApiSchema
  example?: unknown
  examples?: Record<string, { value?: unknown }>
}

interface OpenApiRequestBody {
  content?: Record<string, OpenApiMediaType>
  required?: boolean
}

interface OpenApiOperation {
  operationId?: string
  summary?: string
  tags?: string[]
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  security?: Record<string, string[]>[]
}

interface OpenApiPathItem {
  [method: string]: OpenApiOperation | OpenApiParameter[] | string | undefined
  parameters?: OpenApiParameter[]
  summary?: string
}

interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema>
}

interface OpenApiSpec {
  openapi?: string
  swagger?: string
  info?: {
    title?: string
    version?: string
  }
  servers?: Array<{ url?: string }>
  paths?: Record<string, OpenApiPathItem>
  components?: OpenApiComponents
}

// ─── YAML parser (lightweight, handles common cases) ────────────────────────

function parseYaml(text: string): unknown {
  // Try JSON first
  try {
    return JSON.parse(text)
  } catch {
    // Fall through to YAML parsing
  }

  // Lightweight YAML parser for OpenAPI specs
  // Handles: objects, arrays, strings, numbers, booleans, nulls, multi-line strings
  const lines = text.split('\n')
<<<<<<< HEAD
  return parseYamlLines(lines, 0, 0).value
=======
  return parseYamlLines(lines, 0).value
>>>>>>> 2894d4a (update readme)
}

interface YamlResult {
  value: unknown
  nextLine: number
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/)
  return match ? match[1].length : 0
}

function parseYamlValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed)
  // Strip quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  // Inline array: [a, b, c]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1)
    if (inner.trim() === '') return []
    return inner.split(',').map((s) => parseYamlValue(s))
  }
  // Inline object: {a: b, c: d}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1)
    if (inner.trim() === '') return {}
    const obj: Record<string, unknown> = {}
    for (const part of inner.split(',')) {
      const colonIdx = part.indexOf(':')
      if (colonIdx !== -1) {
        const k = part.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '')
        obj[k] = parseYamlValue(part.slice(colonIdx + 1))
      }
    }
    return obj
  }
  return trimmed
}

<<<<<<< HEAD
function parseYamlLines(lines: string[], startLine: number, minIndent: number): YamlResult {
=======
function parseYamlLines(lines: string[], startLine: number): YamlResult {
>>>>>>> 2894d4a (update readme)
  let i = startLine

  // Skip blanks and comments
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++
  if (i >= lines.length) return { value: null, nextLine: i }

  const line = lines[i]
  const indent = getIndent(line)
  const trimmed = line.trim()

  // Array item
  if (trimmed.startsWith('- ')) {
    const arr: unknown[] = []
    while (i < lines.length) {
      while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++
      if (i >= lines.length) break
      const curIndent = getIndent(lines[i])
      if (curIndent < indent || !lines[i].trim().startsWith('-')) break

      const itemContent = lines[i].trim().slice(2) // after "- "
      if (itemContent.includes(':') && !itemContent.startsWith('{')) {
        // It's an object starting on the dash line
        // Reconstruct as if it were indented
        const fakeIndent = ' '.repeat(curIndent + 2)
        const subLines = [fakeIndent + itemContent]
        let j = i + 1
        while (j < lines.length) {
          const jTrimmed = lines[j].trim()
          if (jTrimmed === '' || jTrimmed.startsWith('#')) { j++; continue }
          if (getIndent(lines[j]) > curIndent) {
            subLines.push(lines[j])
            j++
          } else break
        }
<<<<<<< HEAD
        const result = parseYamlLines(subLines, 0, curIndent + 2)
=======
        const result = parseYamlLines(subLines, 0)
>>>>>>> 2894d4a (update readme)
        arr.push(result.value)
        i = j
      } else {
        arr.push(parseYamlValue(itemContent))
        i++
      }
    }
    return { value: arr, nextLine: i }
  }

  // Object
  if (trimmed.includes(':')) {
    const obj: Record<string, unknown> = {}
    while (i < lines.length) {
      while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++
      if (i >= lines.length) break
      const curIndent = getIndent(lines[i])
      if (curIndent < indent) break

      const curTrimmed = lines[i].trim()
      const colonIdx = curTrimmed.indexOf(':')
      if (colonIdx === -1 || curTrimmed.startsWith('-')) break

      const key = curTrimmed.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '')
      const valueAfterColon = curTrimmed.slice(colonIdx + 1).trim()

      if (valueAfterColon === '' || valueAfterColon === '|' || valueAfterColon === '>') {
        // Value is on next lines (nested object, array, or multi-line string)
        i++
        if (valueAfterColon === '|' || valueAfterColon === '>') {
          // Multi-line string
          const strLines: string[] = []
          while (i < lines.length) {
            if (lines[i].trim() === '') { strLines.push(''); i++; continue }
            if (getIndent(lines[i]) > indent) {
              strLines.push(lines[i].trim())
              i++
            } else break
          }
          obj[key] = valueAfterColon === '|' ? strLines.join('\n') : strLines.join(' ')
        } else {
<<<<<<< HEAD
          const result = parseYamlLines(lines, i, indent + 1)
=======
          const result = parseYamlLines(lines, i)
>>>>>>> 2894d4a (update readme)
          obj[key] = result.value
          i = result.nextLine
        }
      } else {
        obj[key] = parseYamlValue(valueAfterColon)
        i++
      }
    }
    return { value: obj, nextLine: i }
  }

  return { value: parseYamlValue(trimmed), nextLine: i + 1 }
}

// ─── Schema resolution & example generation ─────────────────────────────────

function resolveRef(ref: string, components: OpenApiComponents | undefined): OpenApiSchema | null {
  if (!ref.startsWith('#/components/schemas/') || !components?.schemas) return null
  const name = ref.slice('#/components/schemas/'.length)
  return components.schemas[name] ?? null
}

function generateExample(schema: OpenApiSchema | undefined, components: OpenApiComponents | undefined, depth = 0): unknown {
  if (!schema || depth > 5) return null

  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, components)
    if (resolved) return generateExample(resolved, components, depth + 1)
    return null
  }

  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.enum && schema.enum.length > 0) return schema.enum[0]

  if (schema.allOf) {
    const merged: Record<string, unknown> = {}
    for (const sub of schema.allOf) {
      const val = generateExample(sub, components, depth + 1)
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(merged, val)
      }
    }
    return Object.keys(merged).length > 0 ? merged : null
  }

  if (schema.oneOf?.[0]) return generateExample(schema.oneOf[0], components, depth + 1)
  if (schema.anyOf?.[0]) return generateExample(schema.anyOf[0], components, depth + 1)

  switch (schema.type) {
    case 'object': {
      if (!schema.properties) return {}
      const obj: Record<string, unknown> = {}
      for (const [key, prop] of Object.entries(schema.properties)) {
        const val = generateExample(prop, components, depth + 1)
        if (val !== null) obj[key] = val
        else {
          // Provide type-based placeholder
          switch (prop.type) {
            case 'string': obj[key] = 'string'; break
            case 'integer': case 'number': obj[key] = 0; break
            case 'boolean': obj[key] = false; break
            default: obj[key] = null
          }
        }
      }
      return obj
    }
    case 'array':
      if (schema.items) {
        const item = generateExample(schema.items, components, depth + 1)
        return item !== null ? [item] : []
      }
      return []
    case 'string': return 'string'
    case 'integer': return 0
    case 'number': return 0.0
    case 'boolean': return false
    default: return null
  }
}

// ─── Import ─────────────────────────────────────────────────────────────────

function buildRequestName(method: string, path: string, operation: OpenApiOperation): string {
  if (operation.summary) return operation.summary
  if (operation.operationId) return operation.operationId
  return `${method.toUpperCase()} ${path}`
}

function extractRequestBody(reqBody: OpenApiRequestBody | undefined, components: OpenApiComponents | undefined, warnings: string[], reqName: string): string {
  if (!reqBody?.content) return ''

  const jsonContent = reqBody.content['application/json']
  if (jsonContent) {
    // Check for explicit example first
    if (jsonContent.example) return JSON.stringify(jsonContent.example, null, 2)
    if (jsonContent.examples) {
      const firstExample = Object.values(jsonContent.examples)[0]
      if (firstExample?.value) return JSON.stringify(firstExample.value, null, 2)
    }
    // Generate from schema
    if (jsonContent.schema) {
      const example = generateExample(jsonContent.schema, components)
      if (example !== null) return JSON.stringify(example, null, 2)
    }
    return ''
  }

  // Other content types
  const contentType = Object.keys(reqBody.content)[0]
  if (contentType) {
    warnings.push(`"${reqName}": body content type "${contentType}" — only JSON body generation is supported`)
  }
  return ''
}

export function parseOpenApiSpec(input: string): { collection: Collection; summary: OpenApiImportSummary } {
  let spec: OpenApiSpec
  try {
    spec = parseYaml(input) as OpenApiSpec
  } catch {
    throw new Error('Failed to parse input. Make sure it is valid JSON or YAML.')
  }

  if (!spec || typeof spec !== 'object') {
    throw new Error('Invalid OpenAPI spec format.')
  }

  // Validate it's an OpenAPI/Swagger spec
  if (!spec.openapi && !spec.swagger) {
    throw new Error('Missing "openapi" or "swagger" field. This does not appear to be an OpenAPI specification.')
  }

  if (spec.swagger) {
    // Swagger 2.0 — we'll do best-effort but warn
  }

  const warnings: string[] = []
  const title = spec.info?.title ?? 'Imported API'
  const baseUrl = spec.servers?.[0]?.url ?? ''
  const paths = spec.paths ?? {}
  const components = spec.components

  // Group by tags → folders
  const tagMap = new Map<string, SavedRequest[]>()
  const untagged: SavedRequest[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue

    // Path-level parameters
    const pathParams = (pathItem as Record<string, unknown>).parameters as OpenApiParameter[] | undefined

    for (const method of Object.keys(pathItem)) {
      if (!VALID_METHODS.has(method)) continue

      const operation = pathItem[method] as OpenApiOperation
      if (!operation || typeof operation !== 'object') continue

      const reqName = buildRequestName(method, path, operation)
      const allParams = [...(pathParams ?? []), ...(operation.parameters ?? [])]

      // Build URL with path parameters replaced by example values
      let resolvedPath = path
      const queryParams: KeyValuePair[] = []
      const headerParams: KeyValuePair[] = []

      for (const param of allParams) {
        if (!param.name) continue
        const exampleVal = param.example?.toString()
          ?? (param.schema ? generateExample(param.schema, components)?.toString() : null)
          ?? `{${param.name}}`

        switch (param.in) {
          case 'path':
            resolvedPath = resolvedPath.replace(`{${param.name}}`, exampleVal)
            break
          case 'query':
            queryParams.push({ key: param.name, value: exampleVal === `{${param.name}}` ? '' : exampleVal, enabled: true })
            break
          case 'header':
            headerParams.push({ key: param.name, value: exampleVal === `{${param.name}}` ? '' : exampleVal, enabled: true })
            break
        }
      }

      const fullUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${resolvedPath}` : resolvedPath
      const body = extractRequestBody(operation.requestBody, components, warnings, reqName)

      const savedReq: SavedRequest = {
        id: crypto.randomUUID(),
        name: reqName,
        method: method.toUpperCase() as HttpMethod,
        url: fullUrl,
        params: queryParams.length > 0 ? queryParams : [{ key: '', value: '', enabled: true }],
        headers: headerParams.length > 0 ? headerParams : [{ key: '', value: '', enabled: true }],
        body,
        authType: 'none',
        authToken: '',
      }

      const tags = operation.tags
      if (tags && tags.length > 0) {
        const tag = tags[0]
        if (!tagMap.has(tag)) tagMap.set(tag, [])
        tagMap.get(tag)!.push(savedReq)
      } else {
        untagged.push(savedReq)
      }
    }
  }

  // Convert tag groups into folders
  const folders: CollectionFolder[] = []
  for (const [tag, reqs] of tagMap) {
    folders.push({
      id: crypto.randomUUID(),
      name: tag,
      requests: reqs,
    })
  }

  const collection: Collection = {
    id: crypto.randomUUID(),
    name: title,
    folders,
    requests: untagged,
  }

  const totalRequests = untagged.length + folders.reduce((sum, f) => sum + f.requests.length, 0)

  if (spec.swagger) {
    warnings.push('This is a Swagger 2.0 spec. Some features may not be fully supported.')
  }

  // Warn about security schemes
  if (spec.components && (spec.components as Record<string, unknown>).securitySchemes) {
    warnings.push('Security schemes detected but not auto-applied. Configure auth manually per request.')
  }

  return {
    collection,
    summary: {
      collectionName: title,
      requestCount: totalRequests,
      folderCount: folders.length,
      warnings,
    },
  }
}
