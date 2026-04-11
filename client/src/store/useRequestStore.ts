import { create } from 'zustand'

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
  error: string | null
}

interface RequestStore {
  tabs: RequestTab[]
  activeTabId: string
  addTab: () => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<RequestTab>) => void
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
    error: null,
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

export const useRequestStore = create<RequestStore>((set, get) => ({
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
      const filtered = state.tabs.filter((t) => t.id !== id)
      const activeTabId =
        state.activeTabId === id ? filtered[filtered.length - 1].id : state.activeTabId
      return { tabs: filtered, activeTabId }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  sendRequest: async (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || !tab.url.trim()) return

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, loading: true, response: null, error: null } : t,
      ),
    }))

    try {
      const fullUrl = buildUrl(tab.url, tab.params)
      const headers = buildHeaders(tab.headers, tab.authType, tab.authToken)

      const res = await fetch('/api/requests/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: tab.method,
          url: fullUrl,
          headers,
          body: tab.method !== 'GET' && tab.method !== 'DELETE' ? tab.body : undefined,
        }),
      })

      const data = await res.json()

      if (data.error) {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, loading: false, error: data.error } : t,
          ),
        }))
        return
      }

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                loading: false,
                response: {
                  status: data.status,
                  statusText: data.statusText,
                  headers: data.headers,
                  body: data.body,
                  responseTime: data.responseTime,
                  size: new Blob([data.body]).size,
                },
              }
            : t,
        ),
      }))
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
}))
