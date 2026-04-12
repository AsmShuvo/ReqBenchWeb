// Sync manager: bridges the local stores with the /api/sync/* endpoints.
// - On login (merge): POST local snapshot, replace stores with merged server state
// - On logout: do nothing server-side; local state stays as-is
// - While logged in, every store mutation triggers a debounced push to the server

import { useAuthStore } from '../store/useAuthStore'
import { useCollectionStore } from '../store/useCollectionStore'
import { useHistoryStore } from '../store/useHistoryStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { historyRepo, collectionsRepo, environmentsRepo } from '../repositories'

export interface SyncSnapshot {
  collections: ReturnType<typeof useCollectionStore.getState>['collections']
  history: ReturnType<typeof useHistoryStore.getState>['entries']
  environments: ReturnType<typeof useEnvironmentStore.getState>['environments']
  activeEnvironmentId: string | null
}

export function captureLocalSnapshot(): SyncSnapshot {
  const cs = useCollectionStore.getState()
  const hs = useHistoryStore.getState()
  const es = useEnvironmentStore.getState()
  return {
    collections: cs.collections,
    history: hs.entries,
    environments: es.environments,
    activeEnvironmentId: es.activeEnvironmentId,
  }
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(path, { ...init, headers })
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function signup(email: string, password: string, name?: string): Promise<void> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Signup failed')
  useAuthStore.getState().setSession(data.token, data.user)
  await mergeAfterLogin()
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
  await mergeAfterLogin()
}

export async function logout(): Promise<void> {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' })
  } catch { /* ignore — stateless JWT */ }
  useAuthStore.getState().clearSession()
  // Local state persists intentionally — the user keeps what they had.
}

/** Replace local stores with the merged server snapshot. Called after login/signup. */
async function mergeAfterLogin(): Promise<void> {
  const local = captureLocalSnapshot()
  const res = await authFetch('/api/sync/merge', {
    method: 'POST',
    body: JSON.stringify(local),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Merge failed')
  await applyRemoteSnapshot(data)
}

/** Pull the latest snapshot from the server (useful on app start if already signed in). */
export async function pullFromServer(): Promise<void> {
  if (!useAuthStore.getState().token) return
  const res = await authFetch('/api/sync/state')
  if (!res.ok) {
    // Token likely expired — sign out and fall back to local
    if (res.status === 401) useAuthStore.getState().clearSession()
    return
  }
  const snap = await res.json()
  await applyRemoteSnapshot(snap)
}

/** Push the current local state to the server. Debounced via `schedulePush`. */
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pushInFlight = false

export function schedulePush(delayMs = 1500): void {
  if (!useAuthStore.getState().token) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { void pushNow() }, delayMs)
}

async function pushNow(): Promise<void> {
  if (pushInFlight) {
    // Re-schedule a single trailing push if one's already running
    schedulePush(1500)
    return
  }
  if (!useAuthStore.getState().token) return
  pushInFlight = true
  try {
    const snap = captureLocalSnapshot()
    await authFetch('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify(snap),
    })
  } catch {
    // Swallow — the next mutation will re-trigger a push
  } finally {
    pushInFlight = false
  }
}

// ─── Apply a server snapshot to local stores + repos ──────────────────────

async function applyRemoteSnapshot(snap: SyncSnapshot): Promise<void> {
  // Replace the three localStorage repos (so a reload shows the same data) and
  // then update the in-memory Zustand stores.

  // Collections — easiest to do by clearing and re-inserting via the repo
  const existingCollections = await collectionsRepo.load()
  for (const c of existingCollections) {
    await collectionsRepo.deleteCollection(c.id)
  }
  for (const c of snap.collections) {
    await collectionsRepo.importCollection(c)
  }
  useCollectionStore.setState({ collections: snap.collections })

  // History — clearAll then each entry
  await historyRepo.clearAll()
  for (const h of snap.history) {
    await historyRepo.add({
      method: h.method,
      url: h.url,
      status: h.status,
      responseTime: h.responseTime,
    })
  }
  const reloadedHistory = await historyRepo.load()
  useHistoryStore.setState({ entries: reloadedHistory })

  // Environments — save all at once via the repo's update API
  await environmentsRepo.save({
    environments: snap.environments,
    activeEnvironmentId: snap.activeEnvironmentId ?? null,
  })
  useEnvironmentStore.setState({
    environments: snap.environments,
    activeEnvironmentId: snap.activeEnvironmentId ?? null,
  })
}

// ─── Auto-push wiring ─────────────────────────────────────────────────────

let subscribed = false

export function initSyncAutoPush(): void {
  if (subscribed) return
  subscribed = true

  useCollectionStore.subscribe((state, prev) => {
    if (state.collections !== prev.collections) schedulePush()
  })
  useHistoryStore.subscribe((state, prev) => {
    if (state.entries !== prev.entries) schedulePush()
  })
  useEnvironmentStore.subscribe((state, prev) => {
    if (state.environments !== prev.environments
        || state.activeEnvironmentId !== prev.activeEnvironmentId) {
      schedulePush()
    }
  })
}
