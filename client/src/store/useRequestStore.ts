import { create } from 'zustand'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface KeyValuePair {
  key: string
  value: string
  enabled: boolean
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
}

interface RequestStore {
  tabs: RequestTab[]
  activeTabId: string
  addTab: () => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<RequestTab>) => void
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
  }
}

const defaultTab = createTab()

export const useRequestStore = create<RequestStore>((set) => ({
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
}))
