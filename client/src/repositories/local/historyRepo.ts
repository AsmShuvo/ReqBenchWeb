import type { HistoryRepository } from '../interfaces'
import type { HistoryEntry } from '../types'

const STORAGE_KEY = 'reqbench-history'
const MAX_ENTRIES = 50

function readEntries(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed.state?.entries ?? parsed.entries ?? []
  } catch {
    return []
  }
}

function writeEntries(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }))
}

export class LocalHistoryRepository implements HistoryRepository {
  async load(): Promise<HistoryEntry[]> {
    return readEntries()
  }

  async add(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<HistoryEntry> {
    const entries = readEntries()
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    const updated = [newEntry, ...entries].slice(0, MAX_ENTRIES)
    writeEntries(updated)
    return newEntry
  }

  async remove(id: string): Promise<void> {
    const entries = readEntries()
    writeEntries(entries.filter((e) => e.id !== id))
  }

  async clearAll(): Promise<void> {
    writeEntries([])
  }
}
