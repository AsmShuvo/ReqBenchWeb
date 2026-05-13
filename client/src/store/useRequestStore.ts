import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface KeyValuePair {
  key: string
  value: string
  enabled: boolean // header use hobe kina
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
  headers: KeyValuePair[]
  body: string
  loading: boolean
  response: ResponseData | null
  error: string | null
}

interface RequestState { 
  tabs: RequestTab[] // all open tabs
  activeTabId: string

  addTab: () => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<RequestTab>) => void
  loadRequest: (r: { method: HttpMethod; url: string; headers: KeyValuePair[]; body: string }) => void
  send: (id: string) => Promise<void>
}

function createBlankTab(): RequestTab {
  return {
    id: crypto.randomUUID(),
    name: 'New Request',
    method: 'GET',
    url: '',
    headers: [{ key: '', value: '', enabled: true }],
    body: '',
    loading: false,
    response: null,
    error: null,
  }
}

function deriveName(url: string): string {
  if (!url.trim()) return 'New Request'
  try {
    const u = new URL(url)
    return u.host + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url.length > 30 ? url.slice(0, 30) + '...' : url
  }
}

function buildHeaders(pairs: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) if (p.enabled && p.key) out[p.key] = p.value
  return out
}

const initialTab = createBlankTab()

export const useRequestStore = create<RequestState>()(
  persist( // zustand middleware: saves date automaticallly to localStorage and rehydrates on load
    (set, get) => ({
      tabs: [initialTab],
      activeTabId: initialTab.id,

      addTab: () => {
        const tab = createBlankTab()
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      },

      removeTab: (id) =>
        set((s) => {
          if (s.tabs.length === 1) return s
          const idx = s.tabs.findIndex((t) => t.id === id)
          const filtered = s.tabs.filter((t) => t.id !== id)
          const activeTabId = s.activeTabId === id
            ? filtered[Math.min(idx, filtered.length - 1)].id
            : s.activeTabId
          return { tabs: filtered, activeTabId }
        }),

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTab: (id, patch) =>
        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== id) return t
            const updated = { ...t, ...patch }
            if ('url' in patch) updated.name = deriveName(updated.url)
            return updated
          }),
        })),

      loadRequest: ({ method, url, headers, body }) => {
        const tab: RequestTab = {
          ...createBlankTab(),
          method,
          url,
          headers: headers.length > 0 ? headers : [{ key: '', value: '', enabled: true }],
          body,
          name: deriveName(url),
        }
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      },

      send: async (id) => {
        // find cur tab
        const tab = get().tabs.find((t) => t.id === id)
        if (!tab || !tab.url.trim()) return

        //clear response and error, set loading
        get().updateTab(id, { loading: true, response: null, error: null })


        try {
          const res = await fetch('/api/requests/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: tab.method,
              url: tab.url,
              headers: buildHeaders(tab.headers),
              body: tab.method !== 'GET' && tab.method !== 'DELETE' ? tab.body : undefined,
            }),
          })
          const data = await res.json()

          if (data.error) {
            get().updateTab(id, { loading: false, error: data.error })
            return
          }
          // if success, update response and clear error
          get().updateTab(id, {
            loading: false,
            response: {
              status: data.status,
              statusText: data.statusText,
              headers: data.headers,
              body: data.body,
              responseTime: data.responseTime,
              size: new Blob([data.body]).size, // Binary Large Object: size of data
            },
          })
        } catch {
          get().updateTab(id, { loading: false, error: 'Failed to reach backend server' })
        }
      },
    }),
    {
      name: 'reqbench-tabs',
      // partialize: controls which fiels to save in LS
      partialize: (s) => ({
        tabs: s.tabs.map((t) => ({ ...t, loading: false, error: null, response: null })),
        activeTabId: s.activeTabId,
      }),
    },
  ),
)
