// Shared data types used across stores and repositories.
// These are the canonical type definitions — stores re-export them
// for backward compatibility with existing component imports.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface KeyValuePair {
  key: string
  value: string
  enabled: boolean
}

export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  responseTime: number
  size: number
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  method: HttpMethod
  url: string
  status: number | null
  responseTime: number | null
  timestamp: number
}

// ─── Collections ─────────────────────────────────────────────────────────────

export interface SavedRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValuePair[]
  headers: KeyValuePair[]
  body: string
  authType: 'none' | 'bearer' | 'basic'
  authToken: string
}

export interface CollectionFolder {
  id: string
  name: string
  requests: SavedRequest[]
}

export interface Collection {
  id: string
  name: string
  folders: CollectionFolder[]
  requests: SavedRequest[]
}

// ─── Environments ────────────────────────────────────────────────────────────

export interface EnvVariable {
  key: string
  value: string
  secret: boolean
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  variables: EnvVariable[]
}

export interface EnvironmentsState {
  environments: Environment[]
  activeEnvironmentId: string | null
}
