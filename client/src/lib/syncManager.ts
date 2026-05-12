// Bridges the local stores with the /api/auth and /api/sync endpoints.
// Strategy: on login, push local collections to server. On every change while
// signed in, debounce a push so the cloud copy stays current.

import { useAuthStore } from '../store/useAuthStore'
import { useCollectionStore } from '../store/useCollectionStore'

interface SyncSnapshot {
  collections: ReturnType<typeof useCollectionStore.getState>['collections']
}

function snapshot(): SyncSnapshot {
  return { collections: useCollectionStore.getState().collections }
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(path, { ...init, headers })
}

export async function signup(email: string, password: string, name?: string): Promise<void> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Signup failed')
  useAuthStore.getState().setSession(data.token, data.user)
  await pushNow()
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Login failed')
  useAuthStore.getState().setSession(data.token, data.user)
  await pullFromServer()
}

export function logout(): void {
  useAuthStore.getState().clearSession()
}

export async function pullFromServer(): Promise<void> {
  if (!useAuthStore.getState().token) return
  const res = await authFetch('/api/sync/state')
  if (!res.ok) {
    if (res.status === 401) useAuthStore.getState().clearSession()
    return
  }
  const snap = await res.json() as SyncSnapshot
  useCollectionStore.getState().setCollections(snap.collections)
}

// ─── Debounced auto-push ──────────────────────────────────────────────────

let pushTimer: ReturnType<typeof setTimeout> | null = null

function schedulePush(): void {
  if (!useAuthStore.getState().token) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { void pushNow() }, 1500)
}

async function pushNow(): Promise<void> {
  if (!useAuthStore.getState().token) return
  try {
    await authFetch('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify(snapshot()),
    })
  } catch {
    // Swallow — next change will re-trigger a push
  }
}

let subscribed = false
export function initSyncAutoPush(): void {
  if (subscribed) return
  subscribed = true
  useCollectionStore.subscribe((state, prev) => {
    if (state.collections !== prev.collections) schedulePush()
  })
}
