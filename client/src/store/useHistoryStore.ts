import { create } from 'zustand'
import { historyRepo } from '../repositories'
import type { HistoryEntry } from '../repositories/types'

// Re-export types for backward compatibility with component imports
export type { HistoryEntry } from '../repositories/types'
export type { HttpMethod } from '../repositories/types'

interface HistoryStore {
  entries: HistoryEntry[]
  _loaded: boolean
  _load: () => Promise<void>
  addEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
  removeEntry: (id: string) => void
  clearAll: () => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  entries: [],
  _loaded: false,

  _load: async () => {
    if (get()._loaded) return
    const entries = await historyRepo.load()
    set({ entries, _loaded: true })
  },

  addEntry: (entry) => {
    historyRepo.add(entry).then((newEntry) => {
      set((state) => ({
        entries: [newEntry, ...state.entries].slice(0, 50),
      }))
    })
  },

  removeEntry: (id) => {
    set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }))
    historyRepo.remove(id)
  },

  clearAll: () => {
    set({ entries: [] })
    historyRepo.clearAll()
  },
}))

// Eagerly load on module init
useHistoryStore.getState()._load()
