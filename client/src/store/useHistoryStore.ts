import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HttpMethod } from './useRequestStore'

export interface HistoryEntry {
  id: string
  method: HttpMethod
  url: string
  status: number | null
  responseTime: number | null
  timestamp: number
}

const MAX_ENTRIES = 50

interface HistoryStore {
  entries: HistoryEntry[]
  addEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
  removeEntry: (id: string) => void
  clearAll: () => void
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => ({
          entries: [
            { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
            ...state.entries,
          ].slice(0, MAX_ENTRIES),
        })),

      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        })),

      clearAll: () => set({ entries: [] }),
    }),
    { name: 'reqbench-history' },
  ),
)
