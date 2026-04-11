import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useHistoryStore } from './useHistoryStore'
import { useEnvironmentStore } from './useEnvironmentStore'
import { resolveString, buildVariableMap, collectUnresolved } from '../lib/resolveVariables'
import type { HttpMethod, KeyValuePair, ResponseData, ResponseSnapshot } from '../repositories/types'

// Re-export types for backward compatibility with component imports
export type { HttpMethod, KeyValuePair, ResponseData, ResponseSnapshot } from '../repositories/types'

const MAX_RESPONSE_HISTORY = 10

export interface RequestTab {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValuePair[]
  headers: KeyValuePair[]
  body: string
  authType: 'none' | 'bearer' | 'basic'
  authToken: string
  loading: boolean
  response: ResponseData | null
  responseHistory: ResponseSnapshot[]
  error: string | null
}

interface RequestStore {
  tabs: RequestTab[]
  activeTabId: string
  addTab: () => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<RequestTab>) => void
  duplicateTab: (id: string) => void
  sendRequest: (id: string) => Promise<void>
}

function createTab(): RequestTab {
  const id = crypto.randomUUID()
  return {
    id,
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [{ key: '', value: '', enabled: true }],
    headers: [{ key: '', value: '', enabled: true }],
    body: '',
    authType: 'none',
    authToken: '',
    loading: false,
    response: null,
    responseHistory: [],
    error: null,
  }
}

function deriveTabName(url: string): string {
  if (!url.trim()) return 'New Request'
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return parsed.host + path
  } catch {
    return url.length > 30 ? url.slice(0, 30) + '...' : url
  }
}

function buildUrl(base: string, params: KeyValuePair[]): string {
  const enabled = params.filter((p) => p.enabled && p.key)
  if (enabled.length === 0) return base
  const url = new URL(base)
  enabled.forEach((p) => url.searchParams.append(p.key, p.value))
  return url.toString()
}

function buildHeaders(
  pairs: KeyValuePair[],
  authType: string,
  authToken: string,
): Record<string, string> {
  const headers: Record<string, string> = {}
  pairs.filter((p) => p.enabled && p.key).forEach((p) => {
    headers[p.key] = p.value
  })
  if (authType === 'bearer' && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  } else if (authType === 'basic' && authToken) {
    headers['Authorization'] = `Basic ${btoa(authToken)}`
  }
  return headers
}

const defaultTab = createTab()

export const useRequestStore = create<RequestStore>()(
  persist(
    (set, get) => ({
      tabs: [defaultTab],
      activeTabId: defaultTab.id,

      addTab: () => {
        const tab = createTab()
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
        }))
      },

      removeTab: (id) =>
        set((state) => {
          if (state.tabs.length === 1) return state
          const idx = state.tabs.findIndex((t) => t.id === id)
          const filtered = state.tabs.filter((t) => t.id !== id)
          let activeTabId = state.activeTabId
          if (state.activeTabId === id) {
            const nextIdx = Math.min(idx, filtered.length - 1)
            activeTabId = filtered[nextIdx].id
          }
          return { tabs: filtered, activeTabId }
        }),

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTab: (id, updates) =>
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== id) return t
            const updated = { ...t, ...updates }
            if ('url' in updates) {
              updated.name = deriveTabName(updated.url)
            }
            return updated
          }),
        })),

      duplicateTab: (id) => {
        const source = get().tabs.find((t) => t.id === id)
        if (!source) return
        const newTab: RequestTab = {
          ...source,
          id: crypto.randomUUID(),
          name: source.name,
          loading: false,
          error: null,
        }
        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        }))
      },

      sendRequest: async (id) => {
        const tab = get().tabs.find((t) => t.id === id)
        if (!tab || !tab.url.trim()) return

        // Build variable map from active environment
        const envStore = useEnvironmentStore.getState()
        const activeEnv = envStore.environments.find(
          (e) => e.id === envStore.activeEnvironmentId,
        )
        const varMap = activeEnv ? buildVariableMap(activeEnv.variables) : new Map<string, string>()

        // Resolve variables in URL
        const resolvedUrl = resolveString(tab.url, varMap).resolved

        // Collect all texts that might contain variables for unresolved check
        const allTexts = [
          tab.url,
          ...tab.params.filter((p) => p.enabled && p.key).flatMap((p) => [p.key, p.value]),
          ...tab.headers.filter((p) => p.enabled && p.key).flatMap((p) => [p.key, p.value]),
          tab.body,
          tab.authToken,
        ]
        const unresolved = collectUnresolved(allTexts, varMap)

        if (unresolved.length > 0) {
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === id
                ? {
                    ...t,
                    loading: false,
                    response: null,
                    error: `Unresolved variables: {{${unresolved.join('}}, {{')}}}. Define them in the active environment or remove them.`,
                  }
                : t,
            ),
          }))
          return
        }

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, loading: true, response: null, error: null } : t,
          ),
        }))

        try {
          // Resolve variables in all fields
          const resolvedParams = tab.params.map((p) => ({
            ...p,
            key: resolveString(p.key, varMap).resolved,
            value: resolveString(p.value, varMap).resolved,
          }))
          const resolvedHeaders = tab.headers.map((p) => ({
            ...p,
            key: resolveString(p.key, varMap).resolved,
            value: resolveString(p.value, varMap).resolved,
          }))
          const resolvedBody = resolveString(tab.body, varMap).resolved
          const resolvedAuthToken = resolveString(tab.authToken, varMap).resolved

          const fullUrl = buildUrl(resolvedUrl, resolvedParams)
          const headers = buildHeaders(resolvedHeaders, tab.authType, resolvedAuthToken)

          const res = await fetch('/api/requests/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: tab.method,
              url: fullUrl,
              headers,
              body: tab.method !== 'GET' && tab.method !== 'DELETE' ? resolvedBody : undefined,
            }),
          })

          const data = await res.json()

          if (data.error) {
            set((state) => ({
              tabs: state.tabs.map((t) =>
                t.id === id ? { ...t, loading: false, error: data.error } : t,
              ),
            }))
            useHistoryStore.getState().addEntry({
              method: tab.method,
              url: fullUrl,
              status: null,
              responseTime: null,
            })
            return
          }

          const responseData: ResponseData = {
            status: data.status,
            statusText: data.statusText,
            headers: data.headers,
            body: data.body,
            responseTime: data.responseTime,
            size: new Blob([data.body]).size,
          }

          const snapshot: ResponseSnapshot = {
            id: crypto.randomUUID(),
            response: responseData,
            timestamp: Date.now(),
            label: `${tab.method} ${data.status} - ${new Date().toLocaleTimeString()}`,
          }

          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === id
                ? {
                    ...t,
                    loading: false,
                    response: responseData,
                    responseHistory: [snapshot, ...(t.responseHistory ?? [])].slice(0, MAX_RESPONSE_HISTORY),
                  }
                : t,
            ),
          }))

          useHistoryStore.getState().addEntry({
            method: tab.method,
            url: fullUrl,
            status: data.status,
            responseTime: data.responseTime,
          })
        } catch {
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === id
                ? { ...t, loading: false, error: 'Failed to reach backend server' }
                : t,
            ),
          }))
        }
      },
    }),
    {
      name: 'reqbench-tabs',
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          ...t,
          loading: false,
          error: null,
          responseHistory: (t.responseHistory ?? []).slice(0, MAX_RESPONSE_HISTORY),
        })),
        activeTabId: state.activeTabId,
      }),
    },
  ),
)
