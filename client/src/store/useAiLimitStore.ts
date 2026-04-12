import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const DAILY_AI_LIMIT = 25

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface AiLimitStore {
  date: string        // ISO date string for the current usage window
  usedToday: number

  /** Returns true and increments if under the limit; false otherwise. */
  tryConsume: () => boolean
  /** Read remaining for today, auto-resetting if the date changed. */
  remaining: () => number
  reset: () => void
}

export const useAiLimitStore = create<AiLimitStore>()(
  persist(
    (set, get) => ({
      date: todayKey(),
      usedToday: 0,

      tryConsume: () => {
        const today = todayKey()
        const state = get()
        const usedToday = state.date === today ? state.usedToday : 0
        if (usedToday >= DAILY_AI_LIMIT) {
          set({ date: today, usedToday })
          return false
        }
        set({ date: today, usedToday: usedToday + 1 })
        return true
      },

      remaining: () => {
        const today = todayKey()
        const state = get()
        if (state.date !== today) return DAILY_AI_LIMIT
        return Math.max(0, DAILY_AI_LIMIT - state.usedToday)
      },

      reset: () => set({ date: todayKey(), usedToday: 0 }),
    }),
    { name: 'reqbench-ai-limit' },
  ),
)
