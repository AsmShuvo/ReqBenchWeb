import type { HttpMethod, KeyValuePair, SavedRequest, CollectionFolder, Collection } from '../../repositories/types'

const VALID_METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

export interface ImportSummary {
  collectionName: string
  requestCount: number
  folderCount: number
  warnings: string[]
}

// ─── Postman v2.1 types (subset we care about) ─────────────────────────────

interface PostmanHeader {
  key: string
  value: string
  disabled?: boolean
}

interface PostmanBody {
  mode?: string
  raw?: string
  formdata?: Array<{ key: string; value: string; disabled?: boolean }>
  urlencoded?: Array<{ key: string; value: string; disabled?: boolean }>
}

interface PostmanAuth {
  type?: string
  bearer?: Array<{ key: string; value: string }>
  basic?: Array<{ key: string; value: string }>
}

interface PostmanUrl {
  raw?: string
  protocol?: string
  host?: string[] | string
  path?: string[] | string
  query?: Array<{ key: string; value: string; disabled?: boolean }>
}

interface PostmanRequest {
  method?: string
  header?: PostmanHeader[]
  body?: PostmanBody
  url?: PostmanUrl | string
  auth?: PostmanAuth
}

interface PostmanItem {
  name?: string
  request?: PostmanRequest
  item?: PostmanItem[] // sub-items (folder)
}

interface PostmanCollection {
  info?: {
    name?: string
    schema?: string
  }
  item?: PostmanItem[]
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function extractUrl(url: PostmanUrl | string | undefined): string {
  if (!url) return ''
  if (typeof url === 'string') return url
  if (url.raw) return url.raw
  const protocol = url.protocol ?? 'https'
  const host = Array.isArray(url.host) ? url.host.join('.') : (url.host ?? '')
  const path = Array.isArray(url.path) ? url.path.join('/') : (url.path ?? '')
  return `${protocol}://${host}/${path}`
}

function extractParams(url: PostmanUrl | string | undefined): KeyValuePair[] {
  if (!url || typeof url === 'string') return [{ key: '', value: '', enabled: true }]
  const query = url.query
  if (!query || query.length === 0) return [{ key: '', value: '', enabled: true }]
  return query.map((q) => ({
    key: q.key ?? '',
    value: q.value ?? '',
    enabled: !q.disabled,
  }))
}

function extractHeaders(headers: PostmanHeader[] | undefined): KeyValuePair[] {
  if (!headers || headers.length === 0) return [{ key: '', value: '', enabled: true }]
  return headers.map((h) => ({
    key: h.key ?? '',
    value: h.value ?? '',
    enabled: !h.disabled,
  }))
}

function extractBody(body: PostmanBody | undefined): string {
  if (!body) return ''
  if (body.mode === 'raw' && body.raw) return body.raw
  if (body.mode === 'urlencoded' && body.urlencoded) {
    return body.urlencoded
      .filter((p) => !p.disabled)
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&')
  }
  if (body.mode === 'formdata' && body.formdata) {
    // Can't perfectly represent form-data as text; JSON-ify for best effort
    const obj: Record<string, string> = {}
    body.formdata.filter((p) => !p.disabled).forEach((p) => { obj[p.key] = p.value })
    return JSON.stringify(obj, null, 2)
  }
  return ''
}

function extractAuth(auth: PostmanAuth | undefined): { authType: 'none' | 'bearer' | 'basic'; authToken: string } {
  if (!auth || !auth.type) return { authType: 'none', authToken: '' }
  if (auth.type === 'bearer' && auth.bearer) {
    const tokenEntry = auth.bearer.find((b) => b.key === 'token')
    return { authType: 'bearer', authToken: tokenEntry?.value ?? '' }
  }
  if (auth.type === 'basic' && auth.basic) {
    const username = auth.basic.find((b) => b.key === 'username')?.value ?? ''
    const password = auth.basic.find((b) => b.key === 'password')?.value ?? ''
    return { authType: 'basic', authToken: `${username}:${password}` }
  }
  return { authType: 'none', authToken: '' }
}

function convertRequest(item: PostmanItem, warnings: string[]): SavedRequest | null {
  const req = item.request
  if (!req) return null

  const rawMethod = (req.method ?? 'GET').toUpperCase()
  if (!VALID_METHODS.has(rawMethod)) {
    warnings.push(`Skipped "${item.name ?? 'Unnamed'}": unsupported method "${rawMethod}"`)
    return null
  }

  const bodyMode = req.body?.mode
  if (bodyMode === 'file' || bodyMode === 'graphql') {
    warnings.push(`"${item.name ?? 'Unnamed'}": body mode "${bodyMode}" converted as best-effort (may be incomplete)`)
  }

  const auth = extractAuth(req.auth)
  const url = extractUrl(req.url)

  return {
    id: crypto.randomUUID(),
    name: item.name ?? (url || 'Unnamed Request'),
    method: rawMethod as HttpMethod,
    url,
    params: extractParams(req.url),
    headers: extractHeaders(req.header),
    body: extractBody(req.body),
    ...auth,
  }
}

function processItems(
  items: PostmanItem[],
  warnings: string[],
): { requests: SavedRequest[]; folders: CollectionFolder[] } {
  const requests: SavedRequest[] = []
  const folders: CollectionFolder[] = []

  for (const item of items) {
    if (item.item && item.item.length > 0) {
      // This is a folder
      const folderRequests: SavedRequest[] = []
      const nestedResult = processItems(item.item, warnings)
      folderRequests.push(...nestedResult.requests)
      // Flatten nested folders into the folder's requests
      for (const nestedFolder of nestedResult.folders) {
        warnings.push(`Nested folder "${nestedFolder.name}" flattened into "${item.name ?? 'Unnamed'}"`)
        folderRequests.push(...nestedFolder.requests)
      }
      folders.push({
        id: crypto.randomUUID(),
        name: item.name ?? 'Unnamed Folder',
        requests: folderRequests,
      })
    } else if (item.request) {
      const converted = convertRequest(item, warnings)
      if (converted) requests.push(converted)
    }
  }

  return { requests, folders }
}

export function parsePostmanCollection(jsonString: string): { collection: Collection; summary: ImportSummary } {
  let parsed: PostmanCollection
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    throw new Error('Invalid JSON. Make sure the file is a valid Postman Collection export.')
  }

  // Validate it looks like a Postman collection
  if (!parsed.info && !parsed.item) {
    throw new Error('This does not appear to be a Postman Collection. Expected "info" and "item" fields.')
  }

  const schema = parsed.info?.schema ?? ''
  if (schema && !schema.includes('collection') && !schema.includes('postman')) {
    throw new Error('Unrecognized schema. This importer supports Postman Collection v2.0 and v2.1.')
  }

  const warnings: string[] = []
  const items = parsed.item ?? []
  const { requests, folders } = processItems(items, warnings)

  const collectionName = parsed.info?.name ?? 'Imported Collection'

  const collection: Collection = {
    id: crypto.randomUUID(),
    name: collectionName,
    folders,
    requests,
  }

  const totalRequests = requests.length + folders.reduce((sum, f) => sum + f.requests.length, 0)

  return {
    collection,
    summary: {
      collectionName,
      requestCount: totalRequests,
      folderCount: folders.length,
      warnings,
    },
  }
}
