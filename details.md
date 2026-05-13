# ReqBench — Step-by-Step Learning Guide

This document explains **every line of every file** needed for Part 1: sending an HTTP request.

---

## Course Map

| Part | Topic |
|---|---|
| 0 | Why ReqBench instead of Postman? |
| **1** | **Sending an HTTP Request (with Tabs)** ← *this Part* |
| 2 | Collections (Save / Load) |
| 3 | Concurrent Benchmark (P50/P90/P99) |
| 4 | Visual Flow Editor |
| 5 | AI Assist (Groq) |
| 6 | JWT Auth + Cloud Sync |

When you finish this Part, say **"part 2"**.

---

# Part 1 — Sending an HTTP Request (with Tabs)

## 1.1 The user story

The user types a URL, picks a method (GET/POST/PUT/PATCH/DELETE), optionally adds headers and a body, and clicks **Send**. The response appears on the right side. The user can keep multiple tabs open and switch between them.

That's the entire user-facing behavior of this Part.

---

## 1.2 Why this needs a backend (CORS, in detail)

The browser cannot just call `fetch('https://api.github.com/users/me')` directly from your page. Here's why.

When the browser is asked to fetch a different origin, it does a **CORS preflight** or attaches an `Origin` header. The other server has to send back `Access-Control-Allow-Origin: <your-origin>` or `*`. If it doesn't, the browser **lets the network call succeed but hides the response from your JavaScript**. You literally cannot read it.

GitHub, Stripe, your company's internal APIs — most of them don't set `Access-Control-Allow-Origin: http://localhost:5173`. So a pure-browser API client is impossible.

Postman solves this by being a **desktop app**, not a browser app. Desktop apps don't have CORS rules.

We solve it differently:

```
Browser (localhost:5173)
    │
    │  POST /api/requests/execute  (same origin → no CORS)
    ▼
Our Express server (localhost:3001)
    │
    │  fetch(targetUrl)  (server-to-server → no CORS)
    ▼
Target URL (api.github.com, etc.)
```

The browser only ever talks to **our** server (which we control, so we set CORS to allow everything). Our server then makes the real network call. From the target's perspective, the request comes from a server, not a browser, and CORS doesn't apply.

This pattern is called a **proxy**.

> **Three layers of the same origin rule:**
> 1. **Same origin** = same protocol + host + port (e.g. `http://localhost:5173` is one origin, `http://localhost:3001` is a different one).
> 2. **Cross-origin** browser fetch → blocked unless the server explicitly allows it.
> 3. **Server-to-server** fetch (Node/Express calling `fetch`) → no CORS, no problem.

---

## 1.3 The complete file list

Eight files cooperate. We'll walk through them in the order data flows.

| # | File | Role |
|---|---|---|
| 1 | `client/vite.config.ts` | Vite dev server proxy |
| 2 | `client/src/main.tsx` | React entry point |
| 3 | `client/src/App.tsx` | Top-level layout |
| 4 | `client/src/store/useRequestStore.ts` | Zustand store: tabs + `send()` |
| 5 | `client/src/components/TabBar.tsx` | The tabs at the top |
| 6 | `client/src/components/RequestBuilder.tsx` | URL bar, method, headers, body, Send |
| 7 | `client/src/components/ResponseViewer.tsx` | Display the response |
| 8 | `server/src/index.ts` | The `/api/requests/execute` route |

---

## 1.4 File 1 — `client/vite.config.ts`

### Complete code

```ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': env.VITE_SERVER_URL,
      },
    },
  }
})
```

### Line by line

- **`import { defineConfig, loadEnv } from 'vite'`** — Vite exports a config helper and an env helper. `defineConfig` gives TypeScript autocomplete for the config object.

- **`import react from '@vitejs/plugin-react'`** — A Vite plugin that compiles JSX/TSX into JavaScript and enables React Fast Refresh (hot reload).

- **`import tailwindcss from '@tailwindcss/vite'`** — Tailwind v4 ships its own Vite plugin (no PostCSS config needed).

- **`export default defineConfig(({ mode }) => { ... })`** — Vite calls this function at startup. `mode` is `'development'` for `npm run dev` and `'production'` for `npm run build`.

- **`const env = loadEnv(mode, process.cwd(), '')`** — Reads `.env`, `.env.development`, `.env.production` from the project root. The third argument `''` means "load every variable" (default is only `VITE_*`).

- **`plugins: [react(), tailwindcss()]`** — Two Vite plugins activated.

- **`server.port: 5173`** — The dev server listens here.

- **`server.proxy: { '/api': env.VITE_SERVER_URL }`** — The critical line. Tells Vite: "any request whose path starts with `/api` should be forwarded to `VITE_SERVER_URL`." Resolving to `http://localhost:3001`, so `/api/requests/execute` becomes `http://localhost:3001/api/requests/execute`.

### Why a proxy at all?

Two reasons:

1. **CORS.** The browser sees `/api/requests/execute` as a same-origin request (same host as the page). No preflight, no `Access-Control-Allow-Origin` requirement.
2. **Environment portability.** Browser code never hard-codes the backend URL. To deploy, change one env var. No file edits.

---

## 1.5 File 2 — `client/src/main.tsx`

### Complete code

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

### Explanation

- **`import './index.css'`** — Tailwind generates a giant stylesheet during build; importing it here makes it apply globally.

- **`document.getElementById('root')`** — In `client/index.html` there's a `<div id="root"></div>`. We grab it.

- **`!` (non-null assertion)** — TypeScript would complain that `getElementById` can return `null`. The `!` says "I promise it's not null." If it were, the app would crash on startup — which is the right behavior (the page is broken anyway).

- **`createRoot(...)`** — React 18+ API. The old `ReactDOM.render` is deprecated.

- **`<StrictMode>`** — A development-only wrapper. It double-invokes some hooks and effects to surface bugs early (race conditions, missing cleanups). It does **nothing** in production builds.

This file is rarely touched. Standard Vite + React 19 boilerplate.

---

## 1.6 File 3 — `client/src/App.tsx`

### Complete code

```tsx
import { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import TabBar from './components/TabBar'
import RequestBuilder from './components/RequestBuilder'
import ResponseViewer from './components/ResponseViewer'
import CollectionsPanel from './components/CollectionsPanel'
import FlowPage from './components/flow/FlowPage'
import { initSyncAutoPush, pullFromServer } from './lib/syncManager'

type View = 'request' | 'flow'

function App() {
  const [view, setView] = useState<View>('request')
  const [collectionsOpen, setCollectionsOpen] = useState(false)

  useEffect(() => {
    initSyncAutoPush()
    void pullFromServer()
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <Navbar
        view={view}
        onSetView={setView}
        onToggleCollections={() => setCollectionsOpen((o) => !o)}
      />
      {view === 'request' ? (
        <>
          <TabBar />
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="md:w-1/2 md:border-r border-b md:border-b-0 border-gray-800 overflow-auto">
              <RequestBuilder />
            </div>
            <div className="md:w-1/2 overflow-auto">
              <ResponseViewer />
            </div>
          </div>
        </>
      ) : (
        <FlowPage />
      )}
      {collectionsOpen && <CollectionsPanel onClose={() => setCollectionsOpen(false)} />}
    </div>
  )
}

export default App
```

### Explanation

#### Type alias

```ts
type View = 'request' | 'flow'
```

A TypeScript **string union** — `view` can only be one of these two strings. Trying to set `setView('foo')` causes a compile error.

#### Local state hooks

```ts
const [view, setView] = useState<View>('request')
const [collectionsOpen, setCollectionsOpen] = useState(false)
```

`useState` is the most basic React hook. It returns a pair: `[currentValue, setterFunction]`. When you call the setter, React schedules a re-render with the new value.

- `view` controls which screen is shown (request workbench or flow editor).
- `collectionsOpen` controls whether the right-side drawer is visible.

#### Side-effect hook

```ts
useEffect(() => {
  initSyncAutoPush()
  void pullFromServer()
}, [])
```

`useEffect(fn, deps)` runs `fn` **after** React paints the DOM. The empty `deps` array (`[]`) means "run once when the component first mounts."

- `initSyncAutoPush()` subscribes to store changes so any edit triggers a debounced cloud push (Part 6).
- `void pullFromServer()` pulls the latest cloud snapshot if the user is signed in. The `void` operator discards the Promise's return value (suppresses a "Promise not awaited" lint warning).

#### The JSX tree

```tsx
<div className="h-screen flex flex-col bg-gray-950 text-white">
```

Tailwind utility classes:
- `h-screen` = `height: 100vh` (full viewport height)
- `flex flex-col` = `display: flex; flex-direction: column`
- `bg-gray-950` / `text-white` = dark background, white text

Everything in the app sits inside this root div.

```tsx
<Navbar view={view} onSetView={setView} onToggleCollections={...} />
```

Props passed down: current view, setter, and a toggle for the drawer. The arrow function `() => setCollectionsOpen(o => !o)` flips the boolean.

```tsx
{view === 'request' ? ( ... ) : ( <FlowPage /> )}
```

Conditional rendering. If `view === 'request'`, render the workbench (TabBar + split). Otherwise, render the flow editor.

#### The split layout

```tsx
<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
  <div className="md:w-1/2 md:border-r border-b md:border-b-0 border-gray-800 overflow-auto">
    <RequestBuilder />
  </div>
  <div className="md:w-1/2 overflow-auto">
    <ResponseViewer />
  </div>
</div>
```

- `flex-1` = "take up remaining space."
- `flex-col md:flex-row` = stack vertically on mobile, side-by-side on desktop.
- `md:w-1/2` = on medium+ screens, each half is 50% wide.
- `overflow-auto` = scrollbars appear if content overflows.

This is Postman's classic two-pane layout: request on the left, response on the right.

#### Conditional drawer

```tsx
{collectionsOpen && <CollectionsPanel onClose={...} />}
```

When `collectionsOpen` is `true`, render the panel. When `false`, render nothing. The panel is a full-screen overlay.

#### Why this file doesn't pass any data to RequestBuilder / ResponseViewer

No props are passed to those components. They each subscribe directly to the Zustand store. This is the **single source of truth** pattern — see File 4.

---

## 1.7 File 4 — `client/src/store/useRequestStore.ts` (THE BRAIN)

This is the most important file in Part 1. Read it slowly.

### The full file

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  headers: KeyValuePair[]
  body: string
  loading: boolean
  response: ResponseData | null
  error: string | null
}

interface RequestState {
  tabs: RequestTab[]
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
  persist(
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
        const tab = get().tabs.find((t) => t.id === id)
        if (!tab || !tab.url.trim()) return

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

          get().updateTab(id, {
            loading: false,
            response: {
              status: data.status,
              statusText: data.statusText,
              headers: data.headers,
              body: data.body,
              responseTime: data.responseTime,
              size: new Blob([data.body]).size,
            },
          })
        } catch {
          get().updateTab(id, { loading: false, error: 'Failed to reach backend server' })
        }
      },
    }),
    {
      name: 'reqbench-tabs',
      partialize: (s) => ({
        tabs: s.tabs.map((t) => ({ ...t, loading: false, error: null, response: null })),
        activeTabId: s.activeTabId,
      }),
    },
  ),
)
```

### Section A — type definitions

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
```

A string union. Anywhere we accept an `HttpMethod`, TypeScript enforces one of these five strings. Typos like `'GETT'` won't compile.

```ts
export interface KeyValuePair {
  key: string
  value: string
  enabled: boolean
}
```

Each header in the UI has these three fields. `enabled` lets the user toggle a header on/off via a checkbox without deleting it. Postman has the same pattern.

```ts
export interface ResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  responseTime: number
  size: number
}
```

What the backend sends back after fetching the target URL.

- `status` — HTTP status code (200, 404, etc.).
- `statusText` — "OK", "Not Found".
- `headers: Record<string, string>` — TypeScript shorthand for "an object whose keys and values are both strings."
- `body` — the response body as a plain string (we'll parse it as JSON only for display).
- `responseTime` — server-measured time in ms.
- `size` — body size in bytes (computed in the browser using `new Blob([body]).size`).

```ts
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
```

This is what one tab looks like. Notice:
- `response: ResponseData | null` — `null` means "no response yet." Using `null` instead of `undefined` is a stylistic choice.
- `error: string | null` — same idea.
- `loading: boolean` — true while a request is in flight.

```ts
interface RequestState {
  tabs: RequestTab[]
  activeTabId: string

  addTab: () => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<RequestTab>) => void
  loadRequest: (r: { method: HttpMethod; url: string; headers: KeyValuePair[]; body: string }) => void
  send: (id: string) => Promise<void>
}
```

The full store shape: **state** (`tabs`, `activeTabId`) + **actions** (the six functions).

- `Partial<RequestTab>` is a TypeScript utility type. It makes every field of `RequestTab` optional. So `updateTab(id, { url: 'new' })` is valid — you don't have to pass the whole tab.

### Section B — helper functions

#### `createBlankTab()`

```ts
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
```

- `crypto.randomUUID()` is a browser/Node global that returns a UUID like `f81d4fae-7dec-11d0-a765-00a0c91e6bf6`. UUIDs are practically guaranteed to be unique without coordination.
- The headers array starts with one empty row so the UI shows a row immediately (the user doesn't have to click "+ Add" first).
- All transient fields (`loading`, `response`, `error`) start in their "nothing happening" state.

#### `deriveName(url)`

```ts
function deriveName(url: string): string {
  if (!url.trim()) return 'New Request'
  try {
    const u = new URL(url)
    return u.host + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url.length > 30 ? url.slice(0, 30) + '...' : url
  }
}
```

Turns a URL into a short, readable label for the tab.

Walking through it:
- Empty URL → `'New Request'`.
- `new URL(url)` parses a valid URL into its parts. For `'https://api.github.com/users/1?ref=foo'`, you get `u.host = 'api.github.com'`, `u.pathname = '/users/1'`.
- We concatenate host + path. If the path is just `/`, we skip it (`api.github.com` looks better than `api.github.com/`).
- If `new URL` throws (invalid URL), we fall through to the `catch` and show up to 30 characters of the raw string.

Why? Because tabs are narrow. Showing the full URL would push other tabs off screen.

#### `buildHeaders(pairs)`

```ts
function buildHeaders(pairs: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) if (p.enabled && p.key) out[p.key] = p.value
  return out
}
```

Converts the UI shape (array of `{key, value, enabled}`) to the network shape (plain object `{Header: value}`).

- Only includes headers that are **enabled** and have a **non-empty key**. Empty rows or unchecked rows are skipped.
- The result is what `fetch()` actually accepts.

### Section C — creating the store

```ts
const initialTab = createBlankTab()

export const useRequestStore = create<RequestState>()(
  persist(
    (set, get) => ({
      tabs: [initialTab],
      activeTabId: initialTab.id,
      // ...actions
    }),
    {
      name: 'reqbench-tabs',
      partialize: (s) => ({
        tabs: s.tabs.map((t) => ({ ...t, loading: false, error: null, response: null })),
        activeTabId: s.activeTabId,
      }),
    },
  ),
)
```

This is the most "magical" part of Zustand. Let's break it down.

#### `create<RequestState>()(...)`

`create` is Zustand's main export. The unusual `()()` (call twice) is a TypeScript trick: the first `()` accepts the generic type parameter, the second `()` accepts the implementation. This lets TypeScript infer types correctly with middleware.

#### `persist(...)` middleware

`persist` is a built-in Zustand middleware that mirrors the store into `localStorage`. When you call `set()`, persist also writes the new state to `localStorage`. On page load, persist reads `localStorage` and rehydrates the store with the saved values.

#### `(set, get) => ({...})`

This function defines the initial state and actions. Zustand passes you two helpers:
- `set(updater)` — updates state. The updater can be either a new state object or a function that takes current state and returns new state.
- `get()` — reads current state.

The function returns an object that becomes your store: keys are state fields and actions, values are their initial values or function implementations.

#### Persist config

```ts
{
  name: 'reqbench-tabs',
  partialize: (s) => ({...}),
}
```

- `name: 'reqbench-tabs'` — the key under which the store is saved in `localStorage`. Open DevTools → Application → Local Storage to see `reqbench-tabs: {"state": ..., "version": 0}`.
- `partialize: (s) => ({...})` — controls which parts of the state are persisted. We strip `loading`, `error`, `response` from each tab before saving. Why? Because:
  - A stale "loading: true" from yesterday's session would freeze the UI on next load.
  - Old errors are no longer accurate.
  - Old responses might be huge and bloat localStorage; users can refetch.

  But form fields (method, url, headers, body) are persisted, so reopening the browser feels like nothing was lost.

### Section D — actions, one by one

#### `addTab`

```ts
addTab: () => {
  const tab = createBlankTab()
  set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
},
```

Create a fresh tab. Append it to the array (immutably, via spread). Set it as active.

**Why spread instead of `s.tabs.push(tab)`?** Because React (and Zustand) detect changes by **reference comparison**. `push` mutates the existing array — same reference — and React won't re-render. `[...s.tabs, tab]` creates a brand new array with a new reference, which triggers re-renders.

This is **immutability**, a fundamental rule of React state.

#### `removeTab`

```ts
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
```

Walking through:
1. If only one tab exists, do nothing (`return s`).
2. Find the position of the tab being removed.
3. Create a new array without that tab (`filter`).
4. If the closed tab was the active one, pick a neighbor as the new active:
   - We want to keep the position roughly the same.
   - `Math.min(idx, filtered.length - 1)` — if you closed position 3 and only 3 items remain (indexes 0,1,2), pick index 2.
5. Return the new state.

If the closed tab wasn't active, `activeTabId` stays the same.

#### `setActiveTab`

```ts
setActiveTab: (id) => set({ activeTabId: id }),
```

Trivial. Just update the active ID.

#### `updateTab`

```ts
updateTab: (id, patch) =>
  set((s) => ({
    tabs: s.tabs.map((t) => {
      if (t.id !== id) return t
      const updated = { ...t, ...patch }
      if ('url' in patch) updated.name = deriveName(updated.url)
      return updated
    }),
  })),
```

The Swiss Army knife. Used by `setMethod`, `setUrl`, `setHeaders`, `setBody`, and inside `send()` itself.

Step by step:
1. Map every tab. Non-matching tabs pass through unchanged.
2. For the matching tab, merge: `{ ...t, ...patch }` keeps existing fields, overwrites with patch fields.
3. If the patch contains `url`, also recompute `name`. This is what makes the tab label update as you type.

`'url' in patch` is a JavaScript operator that checks if a property exists on an object — regardless of its value (even if `undefined`).

#### `loadRequest`

```ts
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
```

Called from Collections (loading a saved request) and AI (after Fix/NL produces a request). Instead of overwriting the current tab, it **opens a new tab** with the loaded data. This is what Postman does — and it means users never lose work.

`headers.length > 0 ? headers : [...]` ensures the headers array isn't empty (the UI expects at least one row).

#### `send` — THE BIG ONE

```ts
send: async (id) => {
  const tab = get().tabs.find((t) => t.id === id)
  if (!tab || !tab.url.trim()) return

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

    get().updateTab(id, {
      loading: false,
      response: {
        status: data.status,
        statusText: data.statusText,
        headers: data.headers,
        body: data.body,
        responseTime: data.responseTime,
        size: new Blob([data.body]).size,
      },
    })
  } catch {
    get().updateTab(id, { loading: false, error: 'Failed to reach backend server' })
  }
},
```

The most important function in this file. Five logical sections:

**(1) Find the tab and bail on bad input**

```ts
const tab = get().tabs.find((t) => t.id === id)
if (!tab || !tab.url.trim()) return
```

`get()` reads the current state at the moment `send` is invoked. We look up the specific tab and bail early if no URL was provided.

**(2) Flip to "loading" state**

```ts
get().updateTab(id, { loading: true, response: null, error: null })
```

We use `updateTab` to set three fields atomically:
- `loading: true` → UI shows a spinner.
- `response: null` → clear any previous response.
- `error: null` → clear any previous error.

The component re-renders immediately because Zustand notifies subscribers synchronously.

**(3) POST to our own backend**

```ts
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
```

- `fetch('/api/requests/execute', ...)` — relative URL. Vite's proxy forwards it to `localhost:3001`.
- `method: 'POST'` — we always POST, regardless of the user's desired method. The user's method is inside the body.
- `Content-Type: application/json` — tells the backend our body is JSON.
- `JSON.stringify({...})` — encode the request details as a JSON string.
- `body: tab.method !== 'GET' && tab.method !== 'DELETE' ? tab.body : undefined` — only include a body for methods that allow it. Setting `undefined` makes JSON.stringify omit the field.
- `await res.json()` — parse the response body as JSON. Returns the object the backend sent (status, headers, body, responseTime, etc.).

**(4) Branch: error response vs success**

```ts
if (data.error) {
  get().updateTab(id, { loading: false, error: data.error })
  return
}
```

If the backend returned an error JSON (e.g. `{"error": "Invalid URL"}`), record the error message and stop.

```ts
get().updateTab(id, {
  loading: false,
  response: {
    status: data.status,
    statusText: data.statusText,
    headers: data.headers,
    body: data.body,
    responseTime: data.responseTime,
    size: new Blob([data.body]).size,
  },
})
```

If the backend returned a successful response, build a `ResponseData` object and store it. **`new Blob([data.body]).size`** is a trick: Blob is a built-in browser API for binary data. Wrapping a string in a Blob and reading `.size` gives the byte length of the UTF-8 encoding — not the character count. (JavaScript strings count UTF-16 code units, which is misleading for size.)

**(5) The catch block**

```ts
catch {
  get().updateTab(id, { loading: false, error: 'Failed to reach backend server' })
}
```

`fetch()` only throws when it can't even **reach** the server. That means: server is down, no network, DNS failure. Errors from the target URL come back as data, not exceptions.

We don't even capture the error object (no `catch (e)`), because we always show the same friendly message.

### Section E — interplay between persist and partialize

When the user closes the browser and reopens it:

1. React mounts. The store hook runs.
2. Persist middleware reads `localStorage["reqbench-tabs"]`.
3. The saved JSON looks like: `{"state": {"tabs": [...], "activeTabId": "..."}, "version": 0}`.
4. Persist passes the loaded state into the store, overwriting the defaults.
5. `partialize` was used **during save** to strip transient fields, so the loaded tabs already have `loading: false, response: null, error: null`.
6. UI renders with the user's tabs restored.

That's how state survives a refresh.

---

## 1.8 File 5 — `client/src/components/TabBar.tsx`

### Complete code

```tsx
import { useRequestStore } from '../store/useRequestStore'

const methodColor: Record<string, string> = {
  GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400',
  PATCH: 'text-purple-400', DELETE: 'text-red-400',
}

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, addTab, removeTab } = useRequestStore()

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center overflow-x-auto shrink-0">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`group h-full px-3 text-sm flex items-center gap-1.5 border-r border-gray-800 shrink-0 cursor-pointer select-none ${
            activeTabId === tab.id
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <span className={`text-xs font-semibold ${methodColor[tab.method] ?? 'text-gray-400'}`}>
            {tab.method}
          </span>
          <span className="truncate max-w-36">{tab.name}</span>
          {tabs.length > 1 && (
            <span
              onClick={(e) => { e.stopPropagation(); removeTab(tab.id) }}
              className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm ml-1 cursor-pointer"
              title="Close tab"
            >
              ×
            </span>
          )}
        </div>
      ))}
      <button
        onClick={addTab}
        className="h-full px-3 text-gray-500 hover:text-white hover:bg-gray-800/50 text-lg cursor-pointer"
        title="New tab"
      >
        +
      </button>
    </div>
  )
}
```

### Walkthrough

#### Subscribing to the store

```ts
const { tabs, activeTabId, setActiveTab, addTab, removeTab } = useRequestStore()
```

Destructuring everything we need from the store in one line. This component will re-render whenever **any** of these change.

> **Performance note:** Calling `useRequestStore()` without a selector subscribes to the entire store. That means even unrelated changes (e.g., updating `tab.body`) re-render TabBar. For a small list of tabs, that's fine. If it became a problem, we'd switch to selector form: `useRequestStore(s => s.tabs)`.

#### Method color lookup

```ts
const methodColor: Record<string, string> = {
  GET: 'text-green-400',
  ...
}
```

Just a map from method name to a Tailwind class. Used to color-code the method label.

#### The container div

```tsx
<div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center overflow-x-auto shrink-0">
```

- `h-10` = 40px tall (Tailwind: 1 unit = 4px).
- `bg-gray-900` = dark background.
- `border-b border-gray-800` = thin bottom border.
- `flex items-center` = vertically center children.
- `overflow-x-auto` = horizontal scroll if too many tabs.
- `shrink-0` = don't shrink even if the parent doesn't have room.

#### Rendering each tab

```tsx
{tabs.map((tab) => (
  <div
    key={tab.id}
    onClick={() => setActiveTab(tab.id)}
    className={`group ... ${activeTabId === tab.id ? 'bg-gray-800 text-white' : 'text-gray-400 ...'}`}
  >
```

- `tabs.map(...)` renders one `<div>` per tab.
- `key={tab.id}` — React needs a stable, unique key per list item. Without it, React's diffing breaks (it might reuse the wrong DOM node when the list reorders).
- `onClick` activates the tab.
- The template literal switches CSS classes based on whether this tab is active.

`group` is a special Tailwind class that lets child elements style themselves on parent hover (used by the close button below).

#### Method label

```tsx
<span className={`text-xs font-semibold ${methodColor[tab.method] ?? 'text-gray-400'}`}>
  {tab.method}
</span>
```

`methodColor[tab.method] ?? 'text-gray-400'` — `??` is the **nullish coalescing operator**. If the method isn't in the lookup (shouldn't happen, but defensive), fall back to gray.

#### Tab name

```tsx
<span className="truncate max-w-36">{tab.name}</span>
```

- `truncate` = CSS overflow + ellipsis for long text.
- `max-w-36` = max width 144px. Beyond that, the text gets "..."ed.

#### Close button

```tsx
{tabs.length > 1 && (
  <span
    onClick={(e) => { e.stopPropagation(); removeTab(tab.id) }}
    className="... opacity-0 group-hover:opacity-100 ..."
  >
    ×
  </span>
)}
```

- Only render if there's more than one tab (you can't close the last one).
- `opacity-0 group-hover:opacity-100` — invisible by default, fades in when the parent (`group`) is hovered. Cleaner UI.
- **`e.stopPropagation()`** — prevent the click from bubbling up to the parent div's `onClick` (which would activate the tab we're trying to close).

#### The `+` button

```tsx
<button onClick={addTab} className="...">+</button>
```

Adds a new tab. Simple.

---

## 1.9 File 6 — `client/src/components/RequestBuilder.tsx`

This is the biggest component in Part 1. It contains:
- The URL bar with method + URL + buttons
- The Headers / Body tabs
- A KeyValueEditor for headers
- An inline SaveModal (we'll touch it lightly here — Part 2 covers Collections)

### The full file is in `client/src/components/RequestBuilder.tsx`. Walking through the major pieces.

### Top-level imports

```tsx
import { useEffect, useState } from 'react'
import { useRequestStore, type HttpMethod, type KeyValuePair } from '../store/useRequestStore'
import { useCollectionStore } from '../store/useCollectionStore'
import BenchmarkModal from './BenchmarkModal'
import AiModal from './AiModal'
```

- React hooks.
- The request store + its types.
- The collection store (for Save modal — Part 2).
- The Benchmark modal (Part 3) and AI modal (Part 5).

The `type` keyword on `HttpMethod` and `KeyValuePair` tells TypeScript these are only types (not runtime values), which lets bundlers strip them.

### Constants

```ts
const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const methodColor: Record<HttpMethod, string> = {
  GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400',
  PATCH: 'text-purple-400', DELETE: 'text-red-400',
}

type Tab = 'Headers' | 'Body'
```

- `methods` — the list rendered in the dropdown.
- `methodColor` — color per method (same lookup as TabBar).
- `Tab` — local union for which sub-tab is selected (Headers or Body).

### The `KeyValueEditor` sub-component

```tsx
function KeyValueEditor({ pairs, onChange }: {
  pairs: KeyValuePair[]
  onChange: (p: KeyValuePair[]) => void
}) {
  const update = (i: number, field: keyof KeyValuePair, value: string | boolean) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))

  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={p.enabled}
            onChange={(e) => update(i, 'enabled', e.target.checked)}
          />
          <input
            type="text"
            placeholder="Key"
            value={p.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            className="flex-1 ..."
          />
          <input
            type="text"
            placeholder="Value"
            value={p.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            className="flex-1 ..."
          />
          <button
            onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}
            className="text-gray-500 hover:text-red-400 cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...pairs, { key: '', value: '', enabled: true }])}
        className="text-xs text-gray-400 hover:text-white cursor-pointer"
      >
        + Add
      </button>
    </div>
  )
}
```

A reusable component for editing an array of key-value pairs. Used here for headers.

#### How it accepts data

Props are **`pairs`** (the array) and **`onChange`** (a callback). This is a **controlled component** pattern — the parent owns the state.

#### The `update` helper

```ts
const update = (i: number, field: keyof KeyValuePair, value: string | boolean) =>
  onChange(pairs.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))
```

This is the cleverest line in the file. Walking through:
- `i` is the index of the pair being edited.
- `field` is `'key' | 'value' | 'enabled'` (TypeScript infers from `keyof KeyValuePair`).
- `value` is the new value (string for key/value, boolean for enabled).
- `pairs.map(...)` rebuilds the array immutably.
- The matching pair gets `{ ...p, [field]: value }` — spread the old object, override one field. `[field]` is **computed property syntax**: the key is whatever the variable `field` holds.

#### Each row's JSX

Three inputs (checkbox, key, value) + a delete button. Each input is **controlled**:
- `checked` or `value` comes from props.
- `onChange` calls `update` to push the new value up to the parent.

#### Delete and Add

```tsx
<button onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}>×</button>
```

Remove the row by filtering it out, then `onChange` with the new array.

```tsx
<button onClick={() => onChange([...pairs, { key: '', value: '', enabled: true }])}>+ Add</button>
```

Append a new empty row.

### The main RequestBuilder component

```tsx
export default function RequestBuilder() {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const updateTab = useRequestStore((s) => s.updateTab)
  const send = useRequestStore((s) => s.send)
  const tab = tabs.find((t) => t.id === activeTabId)!

  const [view, setView] = useState<Tab>('Headers')
  const [saveOpen, setSaveOpen] = useState(false)
  const [benchOpen, setBenchOpen] = useState(false)
  const [nlOpen, setNlOpen] = useState(false)
  ...
}
```

#### Selective subscriptions

We use `useRequestStore(s => s.tabs)` four times instead of destructuring everything. Each call subscribes to **only** that slice of state. So if `activeTabId` doesn't change, the component doesn't re-render based on that.

This is a Zustand performance pattern: granular selectors.

#### Local UI state

Four `useState`s for local component state:
- `view` — which sub-tab (Headers or Body) is selected.
- `saveOpen` / `benchOpen` / `nlOpen` — modal visibility flags.

These are not in the store because they're truly per-component.

#### The keyboard shortcut effect

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !tab.loading) {
      e.preventDefault()
      void send(tab.id)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [send, tab.id, tab.loading])
```

Walking through:
- We attach a global `keydown` listener.
- On Ctrl+Enter (or Cmd+Enter on Mac, hence `metaKey`), if a request isn't already running, fire `send`.
- `e.preventDefault()` blocks any default action.
- **The return function is critical**: it cleans up by removing the listener. Without it, every time the dependencies change you'd add a new listener without removing the old one → memory leak.
- Dependency array `[send, tab.id, tab.loading]` — re-run the effect (cleanup + re-attach) when any of these change. `send` is stable, but `tab.id` changes when you switch tabs, and `tab.loading` changes during requests.

#### The URL bar JSX

```tsx
<div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-800">
  <select
    value={tab.method}
    onChange={(e) => updateTab(tab.id, { method: e.target.value as HttpMethod })}
    className={`bg-gray-800 ... ${methodColor[tab.method]}`}
  >
    {methods.map((m) => <option key={m} value={m} className="text-white">{m}</option>)}
  </select>
  <input
    type="text"
    placeholder="Enter URL..."
    value={tab.url}
    onChange={(e) => updateTab(tab.id, { url: e.target.value })}
    className="flex-1 ..."
  />
  <button onClick={() => setNlOpen(true)} ...>✨ NL</button>
  <button onClick={() => setBenchOpen(true)} ...>Bench</button>
  <button onClick={() => setSaveOpen(true)} ...>Save</button>
  <button
    onClick={() => void send(tab.id)}
    disabled={tab.loading}
    className="bg-blue-600 ..."
  >
    {tab.loading ? <Spinner /> : 'Send'}
  </button>
</div>
```

Five action buttons + one URL input + one method dropdown.

- **Method dropdown**: `<select>` whose value is the tab's method. On change, we cast the string to `HttpMethod` (TypeScript can't prove it without help).
- **URL input**: controlled by `tab.url`.
- **NL / Bench / Save buttons**: open the corresponding modal by flipping local state.
- **Send button**:
  - `void send(tab.id)` — fire and forget. `void` discards the Promise.
  - `disabled={tab.loading}` — can't click while in flight.
  - The label is a spinner (when loading) or "Send" (otherwise). The spinner is a styled span with `animate-spin` from Tailwind.

#### Headers/Body tabs

```tsx
<div className="flex border-b border-gray-800">
  {(['Headers', 'Body'] as Tab[]).map((t) => (
    <button
      key={t}
      onClick={() => setView(t)}
      className={`px-4 py-2 text-sm cursor-pointer ${
        view === t ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {t}
    </button>
  ))}
</div>
```

Two buttons. The active one gets a blue bottom border. Clicking switches `view`.

#### Tab content

```tsx
<div className="flex-1 overflow-auto p-3">
  {view === 'Headers' && (
    <KeyValueEditor
      pairs={tab.headers}
      onChange={(headers) => updateTab(tab.id, { headers })}
    />
  )}
  {view === 'Body' && (
    <textarea
      value={tab.body}
      onChange={(e) => updateTab(tab.id, { body: e.target.value })}
      placeholder='{ "key": "value" }'
      className="w-full h-full bg-gray-800 ..."
    />
  )}
</div>
```

- Headers view → render the `KeyValueEditor` we already built. When it calls `onChange`, we update the store.
- Body view → a giant textarea. JSON pretty-printing isn't done here — the user types raw text.

#### Modal portals

```tsx
{saveOpen && <SaveModal onClose={() => setSaveOpen(false)} />}
{benchOpen && <BenchmarkModal onClose={() => setBenchOpen(false)} />}
{nlOpen && <AiModal mode="nl" onClose={() => setNlOpen(false)} />}
```

Conditional rendering. When the local flag is true, the modal is in the tree. The modal renders itself as a fixed-position overlay (we'll see that in Part 2/3/5).

---

## 1.10 File 7 — `client/src/components/ResponseViewer.tsx`

### Complete code

```tsx
import { useState } from 'react'
import { useRequestStore } from '../store/useRequestStore'
import AiModal, { type AiMode } from './AiModal'

function statusColor(status: number): string {
  if (status < 300) return 'text-green-400'
  if (status < 400) return 'text-yellow-400'
  return 'text-red-400'
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

function formatBody(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2) }
  catch { return body }
}

type Tab = 'Body' | 'Headers'

export default function ResponseViewer() {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)!
  const { response, error, loading } = tab

  const [view, setView] = useState<Tab>('Body')
  const [aiMode, setAiMode] = useState<AiMode | null>(null)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 p-3 border-b border-gray-800">
        <div className="flex gap-1.5 text-sm">
          <span className="text-gray-500">Status:</span>
          {response
            ? <span className={`font-semibold ${statusColor(response.status)}`}>{response.status} {response.statusText}</span>
            : <span className="text-gray-400">---</span>}
        </div>
        <div className="flex gap-1.5 text-sm">
          <span className="text-gray-500">Time:</span>
          {response ? <span className="text-green-400">{response.responseTime} ms</span> : <span className="text-gray-400">---</span>}
        </div>
        <div className="flex gap-1.5 text-sm">
          <span className="text-gray-500">Size:</span>
          {response ? <span>{formatSize(response.size)}</span> : <span className="text-gray-400">---</span>}
        </div>

        <div className="ml-auto flex gap-1.5">
          {(error || (response && response.status >= 400)) && (
            <button onClick={() => setAiMode('fix')} className="...">✨ Fix with AI</button>
          )}
          {response && (
            <button onClick={() => setAiMode('explain')} className="...">✨ Explain</button>
          )}
        </div>
      </div>

      <div className="flex border-b border-gray-800">
        {(['Body', 'Headers'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`px-4 py-2 text-sm cursor-pointer ${
              view === t ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {loading && <Spinner />}
        {!loading && error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{error}</div>
        )}
        {!loading && !error && !response && (
          <p className="text-gray-500 text-sm text-center mt-8">
            Send a request to see the response<br/>
            <span className="text-xs text-gray-600">Ctrl+Enter to send</span>
          </p>
        )}
        {!loading && !error && response && (
          view === 'Body' ? (
            <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words">
              {formatBody(response.body)}
            </pre>
          ) : (
            <div className="space-y-1">
              {Object.entries(response.headers).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-sm">
                  <span className="text-blue-400 shrink-0">{k}:</span>
                  <span className="text-gray-300 break-all">{v}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {aiMode && <AiModal mode={aiMode} onClose={() => setAiMode(null)} />}
    </div>
  )
}
```

### Pure utility functions

```ts
function statusColor(status: number): string { ... }
function formatSize(bytes: number): string { ... }
function formatBody(body: string): string { ... }
```

Three small pure helpers (same input → same output, no side effects).

- **`statusColor`** — green for 2xx, yellow for 3xx, red for everything else (4xx and 5xx). Classic HTTP success/error gradient.
- **`formatSize`** — show `N B` below 1024 bytes, `N.N KB` otherwise. No MB because responses rarely get that big.
- **`formatBody`** — try to parse as JSON and pretty-print. If that fails (HTML, plain text, malformed JSON), show the raw body. The `try/catch` is exhaustive — `JSON.parse` throws on invalid input, and the `catch` returns the original.

### Reading the active tab

```ts
const tabs = useRequestStore((s) => s.tabs)
const activeTabId = useRequestStore((s) => s.activeTabId)
const tab = tabs.find((t) => t.id === activeTabId)!
const { response, error, loading } = tab
```

Same pattern as RequestBuilder: subscribe to slices of the store, find the active tab, destructure the relevant fields.

This component **only reads** the store; it never calls `updateTab` or `send`. That's a clean separation: RequestBuilder writes, ResponseViewer reads.

### The header strip

```tsx
<div className="flex items-center gap-4 p-3 border-b border-gray-800">
  <div className="flex gap-1.5 text-sm">
    <span className="text-gray-500">Status:</span>
    {response
      ? <span className={`font-semibold ${statusColor(response.status)}`}>{response.status} {response.statusText}</span>
      : <span className="text-gray-400">---</span>}
  </div>
  ...
</div>
```

Three info chips: Status, Time, Size. Each uses a ternary — show real data if `response` exists, otherwise show `---`.

The status chip uses `statusColor(response.status)` to colorize itself.

### The AI buttons

```tsx
<div className="ml-auto flex gap-1.5">
  {(error || (response && response.status >= 400)) && (
    <button onClick={() => setAiMode('fix')}>✨ Fix with AI</button>
  )}
  {response && (
    <button onClick={() => setAiMode('explain')}>✨ Explain</button>
  )}
</div>
```

- `ml-auto` pushes this div to the right side (using flex auto margins).
- "Fix with AI" appears only on error or HTTP ≥ 400.
- "Explain" appears whenever there's a response.

These buttons set `aiMode`, which renders an `<AiModal>` at the bottom. Details in Part 5.

### The body/headers display

```tsx
{!loading && !error && response && (
  view === 'Body' ? (
    <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words">
      {formatBody(response.body)}
    </pre>
  ) : (
    <div className="space-y-1">
      {Object.entries(response.headers).map(([k, v]) => (
        <div key={k} className="flex gap-2 text-sm">
          <span className="text-blue-400 shrink-0">{k}:</span>
          <span className="text-gray-300 break-all">{v}</span>
        </div>
      ))}
    </div>
  )
)}
```

- **Body view**: a `<pre>` (preserves whitespace) with the pretty-printed JSON or raw body.
  - `whitespace-pre-wrap` allows long lines to wrap.
  - `break-words` breaks long unbreakable strings (URLs).
- **Headers view**: `Object.entries(...)` turns `{ key: value }` into `[[key, value], ...]`. Map over the pairs and render each as a row.

### Why four conditional blocks (loading / error / empty / response)?

Because the four states are mutually exclusive:
1. Loading — show a spinner.
2. Error — show the error.
3. No response yet — show a placeholder.
4. Response exists — show body or headers.

The `&&` chains ensure only one block ever renders.

---

## 1.11 File 8 — `server/src/index.ts` (the `/api/requests/execute` route)

The backend is in `server/src/index.ts`. We only care about one route for Part 1.

### The full route

```ts
app.post('/api/requests/execute', async (req, res) => {
  const { method, url, headers, body } = req.body

  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }
  try { new URL(url) } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const start = performance.now()
    const response = await fetch(url, {
      method,
      headers: headers || {},
      body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
      signal: controller.signal,
    })
    const responseTime = Math.round(performance.now() - start)

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => { responseHeaders[key] = value })

    const responseBody = await response.text()

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      responseTime,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      res.status(408).json({ error: 'Request timed out (30s)' })
      return
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(502).json({ error: `Network error: ${message}` })
  } finally {
    clearTimeout(timeout)
  }
})
```

### Express setup (above the route)

```ts
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
...
const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))
```

- `dotenv/config` loads `server/.env` into `process.env`.
- `cors()` middleware adds permissive CORS headers to every response — so the browser at `:5173` accepts replies from `:3001`. (In dev we proxy via Vite, but we keep this for direct browser access during testing.)
- `express.json({ limit: '2mb' })` parses incoming JSON bodies up to 2MB.

### Step 1 — destructure and validate

```ts
const { method, url, headers, body } = req.body

if (!url || !method) {
  res.status(400).json({ error: 'method and url are required' })
  return
}
try { new URL(url) } catch {
  res.status(400).json({ error: 'Invalid URL' })
  return
}
```

- Destructure the four expected fields from the parsed JSON body.
- Check that URL and method are present.
- `new URL(url)` is the cheapest URL validator in JavaScript. It throws `TypeError: Invalid URL` on garbage input. We don't need the parsed URL — just want to know if it's valid.
- Each failure: respond with HTTP 400 and a JSON error object. `return` exits the handler (otherwise Express would log a "Cannot set headers after they are sent" error).

### Step 2 — set up a 30-second timeout

```ts
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30000)
```

- `AbortController` is a standard mechanism for cancelling async operations.
- Calling `controller.abort()` triggers the abort signal.
- `setTimeout(fn, 30000)` schedules `fn` to run after 30 seconds.
- So: 30 seconds from now, if the request isn't done, we abort it.

### Step 3 — make the real fetch

```ts
const start = performance.now()
const response = await fetch(url, {
  method,
  headers: headers || {},
  body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
  signal: controller.signal,
})
const responseTime = Math.round(performance.now() - start)
```

- `performance.now()` returns a high-resolution timestamp in ms. Two snapshots (before/after) give us the response time.
- `fetch(url, options)` — Node 18+ has `fetch` built in.
- `headers: headers || {}` — if the user sent no headers, use an empty object.
- `body: ... ? body : undefined` — GET and HEAD requests cannot have a body. For those methods, set body to `undefined` (omitted from the actual request).
- `signal: controller.signal` — links the fetch to the abort controller. If `abort()` fires, this fetch rejects with an `AbortError`.

If the target responds within 30 seconds, `await fetch(...)` resolves with a `Response` object.

### Step 4 — extract headers and body

```ts
const responseHeaders: Record<string, string> = {}
response.headers.forEach((value, key) => { responseHeaders[key] = value })

const responseBody = await response.text()
```

- `response.headers` is a `Headers` object (not a plain `{}`). It's iterable. We loop and copy into a plain object so we can JSON-serialize it.
- `response.text()` reads the body as a UTF-8 string. Works for JSON, HTML, plain text — anything. We don't try to parse as JSON; we send the raw string to the browser, which decides what to do with it.

> **Note:** `.text()` returns a Promise because reading the body can be slow (streaming). The `await` waits for the full body.

### Step 5 — send back to the browser

```ts
res.json({
  status: response.status,
  statusText: response.statusText,
  headers: responseHeaders,
  body: responseBody,
  responseTime,
})
```

`res.json(obj)` sends `JSON.stringify(obj)` with `Content-Type: application/json`.

The browser's `await res.json()` (in the store) will receive this exact object.

### Step 6 — error handling

```ts
} catch (err: unknown) {
  if (err instanceof Error && err.name === 'AbortError') {
    res.status(408).json({ error: 'Request timed out (30s)' })
    return
  }
  const message = err instanceof Error ? err.message : 'Unknown error'
  res.status(502).json({ error: `Network error: ${message}` })
} finally {
  clearTimeout(timeout)
}
```

- `err: unknown` — TypeScript best practice. `catch` variables used to be typed `any`, but `unknown` forces you to check before using.
- `err.name === 'AbortError'` → the 30-second timer fired. Respond 408 (Request Timeout).
- Anything else (DNS failure, connection refused, target threw, …) → 502 (Bad Gateway). The actual error message is passed through.
- The `finally` block clears the timeout. Why? Because if the request succeeded in 100ms, the timer would still fire 29.9 seconds later and try to abort an already-completed request. Wastes resources. `clearTimeout` cancels it.

### Why these status codes?

- **400 Bad Request** — the client (our browser) sent bad input (missing URL).
- **408 Request Timeout** — we waited too long for the target.
- **502 Bad Gateway** — we're a gateway/proxy, and the upstream server failed.
- **2xx success** — never sent directly here; we forward the target's status inside `data.status` but our own response is always 200 OK if no error.

This is the official HTTP semantics. Worth memorizing for interviews.

---

## 1.12 The end-to-end trace

Bringing everything together. The user types `https://jsonplaceholder.typicode.com/todos/1`, leaves method on GET, clicks **Send**.

| Step | Where | What happens |
|---|---|---|
| 1 | Browser DOM | Send button receives `click` event. |
| 2 | RequestBuilder | `onClick` handler calls `send(tab.id)`. |
| 3 | useRequestStore | `send` calls `get()` to read the current tab. URL is non-empty. |
| 4 | useRequestStore | `updateTab(id, { loading: true, response: null, error: null })`. |
| 5 | Zustand internals | Subscribers are notified; ResponseViewer and RequestBuilder re-render. |
| 6 | ResponseViewer | Renders the spinner because `tab.loading === true`. |
| 7 | RequestBuilder | Send button shows the spinner instead of "Send". |
| 8 | useRequestStore | `fetch('/api/requests/execute', { method: 'POST', body: '{...}' })` starts. |
| 9 | Vite dev server | Sees the `/api/...` path, forwards the request to `http://localhost:3001/api/requests/execute`. |
| 10 | Express | The `app.post('/api/requests/execute', ...)` handler runs. |
| 11 | Express | URL validates. AbortController + 30s timer set up. |
| 12 | Node `fetch` | Calls `https://jsonplaceholder.typicode.com/todos/1` over the network. |
| 13 | JSONPlaceholder | Responds with `200 OK` + JSON body. |
| 14 | Express | `performance.now()` measures total elapsed time. Headers converted to plain object. Body read as text. |
| 15 | Express | Sends back `{status, statusText, headers, body, responseTime}` as JSON. |
| 16 | Express | `clearTimeout(timeout)` runs in `finally`. |
| 17 | Browser (back in store) | `await res.json()` resolves with the data. |
| 18 | useRequestStore | No `data.error`, so the success branch runs. |
| 19 | useRequestStore | `new Blob([data.body]).size` computes byte size. |
| 20 | useRequestStore | `updateTab(id, { loading: false, response: {...} })`. |
| 21 | Zustand | Notifies subscribers. |
| 22 | ResponseViewer | Re-renders with status pill (green 200), time, size, and pretty-printed body. |
| 23 | RequestBuilder | Send button returns to "Send" (loading is false). |

Wall-clock time on a fast network: ~150ms.

---

## 1.13 Common pitfalls and gotchas

- **Backend down.** If `npm run dev` isn't running in `server/`, every click of Send shows "Failed to reach backend server." The `catch` block in `send` is the only path that produces this exact message.

- **CORS test.** Try changing the browser code to `fetch('https://api.github.com/users/octocat')` directly (no `/api/` prefix). You'll get a CORS error in DevTools. This is exactly why the proxy exists.

- **30-second hard limit.** Some APIs take a long time. The server cuts off at 30 seconds and returns 408. If you want longer, change `setTimeout(..., 30000)` to a larger number — but consider whether you really want to wait that long.

- **Body size limit.** `express.json({ limit: '2mb' })` rejects request bodies over 2MB. If a request body needs to be huge (uploading a file as a base64 string, for instance), increase this. But typically API requests are small.

- **`new URL()` accepts weird inputs.** `new URL('https://')` actually works! It treats `https:` as a valid scheme and an empty host. Validation isn't perfect; if you need strict checks, add them.

- **Status >= 400 from the target is not an error in our app.** A 404 means the target said "not found." That's still valid response data. The `data.error` branch is only for *our server's* errors (validation, timeout, network).

- **Persist hydration timing.** On first render, Zustand uses the default state. After persist reads localStorage, it triggers a re-render with the rehydrated state. So you may see one render with default values, then a flash to your saved tabs. For our case it's invisible because both states look fine.

- **The `!` non-null assertions.** `tabs.find(t => t.id === activeTabId)!` could in principle return undefined (if activeTabId is stale). In practice, our store invariants ensure it can't happen. But if you ever see "cannot read properties of undefined" — that's where to look.

---

## 1.14 DevTools exercises

Open Chrome DevTools (F12) and try these:

1. **Network tab.** Send any request. You'll see only `/api/requests/execute` in the list. The actual call to JSONPlaceholder is invisible — it happens server-to-server.

2. **Application → Local Storage.** Find the key `reqbench-tabs`. The value is JSON. Edit the URL of a tab, click somewhere else, and refresh the storage view — you'll see your edit reflected.

3. **Performance tab.** Record while clicking Send. You'll see the React re-renders triggered by `loading: true` → `loading: false`.

4. **Kill the backend.** Stop the server (Ctrl+C). Click Send. Watch the `catch` block fire — "Failed to reach backend server."

5. **Invalid URL.** Type `whatever` in the URL bar and Send. The server's `new URL(url)` throws, the handler responds 400, and your error chip shows "Invalid URL".

6. **Slow URL.** Try `https://httpbin.org/delay/5`. Watch the spinner spin for 5 seconds, then see the result. Try `https://httpbin.org/delay/40` — it'll timeout after 30 seconds and show 408.

7. **Tabs.** Open three tabs with three different URLs. Send all three. Switch between them — each shows its own response. Close the middle tab — the neighbor becomes active. Refresh the page — your tabs come back (but responses are cleared, as designed).

8. **Disable a header.** Add a header `X-Custom: 1` and send a request to `https://httpbin.org/headers`. The response will show your header. Uncheck the box for that header and send again. The header is gone.

---

## 1.15 Checklist — what you should now understand

- [ ] Why a backend is required (CORS).
- [ ] What the Vite proxy does and why we don't hard-code `localhost:3001`.
- [ ] How Zustand's `create`, `set`, `get` work.
- [ ] What `persist` and `partialize` do, and when each runs.
- [ ] Why we use immutable updates (`...spread`) instead of `.push()`.
- [ ] How tabs are modeled as an array + an active ID.
- [ ] How `updateTab` accepts partial patches.
- [ ] What controlled inputs look like (`value` from store, `onChange` writes to store).
- [ ] What `useEffect` cleanup does and why it matters.
- [ ] What `async`/`await` actually waits on (the resolution of a Promise).
- [ ] How `AbortController` cancels in-flight fetches.
- [ ] The four mutually exclusive UI states (loading / error / empty / response).
- [ ] Why HTTP 400, 408, 502 (not 500 for everything).
- [ ] The full 23-step trace from click to display.

When you're ready, say **"part 2"** for Collections — the Save/Load drawer that uses persistence and an inline modal.

---

# Part 2 — Collections (Save / Load)

Part 1-এ আমরা request workbench বানিয়েছিলাম। কিন্তু browser বন্ধ করলেই request হারিয়ে যেত। Part 2-এ আমরা যোগ করছি **Collections** — saved requests যেগুলো এক click-এ আবার load করা যাবে। এটাই "local-first" promise: তোমার data **তোমার** browser-এই থাকে by default, আর (পরে Part 6-এ) optionally তোমার নিজের database-এ sync হয়।

## 2.1 User story (user কী করবে)

1. User একটা request বানায় (method, URL, headers, body) — Part 1-এর flow।
2. URL bar-এ **Save** button-এ click করে।
3. একটা ছোট modal আসে — request-এর নাম জানতে চায় আর কোন collection-এ save হবে সেটা জানতে চায়। যদি কোনো collection না থাকে, একটা নতুন collection-এর নাম টাইপ করে।
4. **Save** click করে। Modal বন্ধ হয়ে যায়।
5. পরে কখনো navbar-এ **Collections** click করে। ডান দিক থেকে একটা drawer slide হয়ে আসে — সব collections আর তাদের saved requests দেখায়।
6. একটা saved request-এ click করে। **নতুন একটা tab**-এ method, URL, headers, body সব restore হয়ে আসে। Drawer automatically বন্ধ হয়ে যায়।
7. Drawer থেকে individual request বা পুরো collection delete করা যায়।
8. Browser restart করলেও সব data থাকে — `localStorage`-এ save আছে।

এটাই পুরো feature।

---

## 2.2 কেন এটা সহজ না?

তিনটা কারণ:

### কারণ ১ — Persistence (data টিকিয়ে রাখা)

Browser-এর memory reload করলেই **চলে যায়**। Refresh-এ data টিকিয়ে রাখতে হলে **`localStorage`** (বা IndexedDB)-এ লিখতে হয়। আমরা Part 1-এর মতোই Zustand-এর `persist` middleware use করব, কিন্তু একটু আলাদা configuration-এ।

### কারণ ২ — Shape design (data কেমন দেখতে হবে)

আমাদের ঠিক করতে হবে: saved requests কি flat list হবে, নাকি collection-এ group হবে? Postman-এ workspace-এর ভেতরে collection, collection-এর ভেতরে folder — তিন level deep। আমাদের জন্য এটা অতিরিক্ত। আমরা সবচেয়ে সহজ useful structure বেছে নিলাম:

```
Collection (শুধু একটা name + একটা list)
  └── SavedRequest (name + method + url + headers + body)
```

দুই level। কোনো folder নেই, কোনো workspace নেই। Model বানানো সহজ, render করা সহজ।

### কারণ ৩ — দুটো store, একটা feature

Save modal `RequestBuilder.tsx`-এর ভেতরে থাকে। এটা `useRequestStore` থেকে **বর্তমান request** পড়ে, আর `useCollectionStore`-এ **saved request** লেখে। দুটো আলাদা store-কে coupling ছাড়াই cooperate করতে হয়।

CollectionsPanel উল্টো দিক যায়: `useCollectionStore` থেকে পড়ে আর (`loadRequest` দিয়ে) `useRequestStore`-এ লেখে।

এই split intentional — প্রতিটা store একটা concept-এর owner, আর components মাঝখানে glue হিসেবে কাজ করে।

---

## 2.3 কোন কোন file লাগবে

পাঁচটা file cooperate করে, কিন্তু দুটো-ই মূল কাজ করে।

| # | File | কাজ |
|---|---|---|
| 1 | `client/src/store/useCollectionStore.ts` | Collections-এর Zustand store (state + actions) |
| 2 | `client/src/components/CollectionsPanel.tsx` | Slide-in drawer UI |
| 3 | `client/src/components/RequestBuilder.tsx` (`SaveModal` ভেতরে) | Save modal — Part 1-এ আমরা ছুঁয়ে গিয়েছিলাম |
| 4 | `client/src/components/Navbar.tsx` | Drawer toggle করার button |
| 5 | `client/src/App.tsx` | Drawer খোলা থাকলে render করে |

---

## 2.4 File 1 — `client/src/store/useCollectionStore.ts`

### সম্পূর্ণ code

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HttpMethod, KeyValuePair } from './useRequestStore'

export interface SavedRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  body: string
}

export interface Collection {
  id: string
  name: string
  requests: SavedRequest[]
}

interface CollectionState {
  collections: Collection[]

  setCollections: (cs: Collection[]) => void
  createCollection: (name: string) => void
  deleteCollection: (id: string) => void
  saveRequest: (collectionId: string, req: Omit<SavedRequest, 'id'>) => void
  deleteRequest: (collectionId: string, requestId: string) => void
}

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set) => ({
      collections: [],

      setCollections: (collections) => set({ collections }),

      createCollection: (name) =>
        set((s) => ({
          collections: [...s.collections, { id: crypto.randomUUID(), name, requests: [] }],
        })),

      deleteCollection: (id) =>
        set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),

      saveRequest: (collectionId, req) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: [...c.requests, { ...req, id: crypto.randomUUID() }] }
              : c,
          ),
        })),

      deleteRequest: (collectionId, requestId) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === collectionId
              ? { ...c, requests: c.requests.filter((r) => r.id !== requestId) }
              : c,
          ),
        })),
    }),
    { name: 'reqbench-collections' },
  ),
)
```

এটা `useRequestStore`-এর একটা ছোট, শান্ত version। একটা একটা করে দেখি।

### Section A — type definitions

```ts
import type { HttpMethod, KeyValuePair } from './useRequestStore'
```

`import type` form **শুধু types import করে** — runtime-এ কিছুই import হয় না। যখন তুমি শুধু TypeScript info লাগে, actual value না — তখন এটাই সঠিক form। Bundle size কম রাখে আর circular import-এর সমস্যা avoid করে।

```ts
export interface SavedRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  body: string
}
```

`SavedRequest` Part 1-এর `RequestTab`-এর মতোই, কিন্তু transient fields (`loading`, `response`, `error`) বাদ। কেন? কারণ saved request একটা **template** — পরে পাঠানোর জন্য রাখা request। এর সাথে response থাকে না।

আমরা `params` বা `auth` রাখি না কারণ আমাদের simplified app-এ ওগুলো আলাদা field হিসেবে নেই (headers দিয়েই সব হয়)।

```ts
export interface Collection {
  id: string
  name: string
  requests: SavedRequest[]
}
```

Collection মানে একটা নামওয়ালা request-এর bucket। কোনো nested folder নেই।

```ts
interface CollectionState {
  collections: Collection[]
  setCollections: (cs: Collection[]) => void
  createCollection: (name: string) => void
  deleteCollection: (id: string) => void
  saveRequest: (collectionId: string, req: Omit<SavedRequest, 'id'>) => void
  deleteRequest: (collectionId: string, requestId: string) => void
}
```

Store-এর shape: একটা state field (`collections`) আর পাঁচটা actions।

**`Omit<SavedRequest, 'id'>`** আরেকটা TypeScript utility type। এটা `SavedRequest` নেয় আর `'id'` field বাদ দেয়। কেন? কারণ caller ID generate করে না — store করে। Caller বাকি সব দেয়; store-ই `saveRequest`-এর ভেতরে UUID দেয়।

এটা `Partial<T>` (Part 1-এ use করেছিলাম) এর মতোই pattern — ছোট utility types যেগুলো function signatures clearer করে।

### Section B — store create করা

```ts
export const useCollectionStore = create<CollectionState>()(
  persist(
    (set) => ({
      collections: [],
      // actions...
    }),
    { name: 'reqbench-collections' },
  ),
)
```

Part 1-এর মতোই Zustand `create` + `persist` recipe, কিন্তু **দুটো পার্থক্য**:

1. **কোনো `partialize` নেই।** আমরা পুরো state save করি। কেন? কারণ `collections`-এর *সবটাই* meaningful — `loading`-এর মতো transient field নেই যেটা strip করতে হবে। Default behavior (সব save করা) ঠিক আছে।
2. **Initial state `collections: []`।** কোনো initial tab seed করতে হয় না।
3. **শুধু `set` destructure করি (`get` না)।** কোনো action-এর `get()` দিয়ে state পড়ার দরকার নেই — সব functional form `set((s) => ...)` use করে, যেখানে `s` হলো current state।

localStorage key `reqbench-collections`। প্রথম save-এর পর DevTools → Application → Local Storage খুললে এরকম দেখবে:

```json
{
  "state": {
    "collections": [
      {
        "id": "f47ac10b-...",
        "name": "JSONPlaceholder",
        "requests": [
          { "id": "...", "name": "Get Todo 1", "method": "GET", "url": "...", ... }
        ]
      }
    ]
  },
  "version": 0
}
```

### Section C — actions, একটা একটা করে

#### `setCollections`

```ts
setCollections: (collections) => set({ collections }),
```

পুরো replace। Cloud sync (Part 6)-এর সময় use হয় যখন server fresh snapshot push করে। Local app server-এর data trust করে।

#### `createCollection`

```ts
createCollection: (name) =>
  set((s) => ({
    collections: [...s.collections, { id: crypto.randomUUID(), name, requests: [] }],
  })),
```

দেওয়া name আর খালি `requests` array দিয়ে একটা নতুন collection বানায়। List-এ append করে।

`crypto.randomUUID()` unique ID generate করে — UUIDs-এ collision statistically impossible, তাই server-side helping দরকার নেই।

#### `deleteCollection`

```ts
deleteCollection: (id) =>
  set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),
```

এই ID-র collection filter করে বাদ দেয়। ভেতরের সব request-ও মিলিয়ে যায় (কোনো cascade logic দরকার নেই — সব ওই array-এর ভেতরেই nested ছিল)।

#### `saveRequest`

```ts
saveRequest: (collectionId, req) =>
  set((s) => ({
    collections: s.collections.map((c) =>
      c.id === collectionId
        ? { ...c, requests: [...c.requests, { ...req, id: crypto.randomUUID() }] }
        : c,
    ),
  })),
```

সবচেয়ে interesting action। Walk through:

1. `s.collections.map(...)` — নতুন array বানায়, প্রতিটা collection visit করে।
2. Collection-এর ID যদি `collectionId`-র সাথে match করে:
   - Existing collection-কে spread করে (id আর name রাখে)।
   - `requests`-কে নতুন array দিয়ে replace করে: পুরোনো requests + নতুনটা।
   - নতুন request: caller-এর data spread, generated `id` যোগ।
3. না হলে collection unchanged return।

একসাথে তিন level-এর immutable update হচ্ছে — collections array, matched collection, আর তার requests array — সব fresh build।

#### `deleteRequest`

```ts
deleteRequest: (collectionId, requestId) =>
  set((s) => ({
    collections: s.collections.map((c) =>
      c.id === collectionId
        ? { ...c, requests: c.requests.filter((r) => r.id !== requestId) }
        : c,
    ),
  })),
```

একই pattern। Collection খুঁজে, request filter করে বাদ দেয়।

### Component-এ logic না রেখে store-level CRUD কেন?

আমরা এই logic component-এ রাখতে পারতাম। কিন্তু store-এ রাখলে তিনটা সুবিধা:

1. **Reusability।** SaveModal আর CollectionsPanel দুটোই একই `saveRequest` / `deleteCollection` call করে। Duplication নেই।
2. **Encapsulation।** Components-এর UUIDs বা immutability নিয়ে চিন্তা করতে হয় না।
3. **Sync hook।** Cloud sync add করলে (Part 6) আমরা store changes-এ subscribe করি। Logic component-এ থাকলে বাইরে থেকে change detect করতে পারতাম না।

---

## 2.5 File 2 — `client/src/components/CollectionsPanel.tsx`

এটাই সেই slide-in drawer।

### সম্পূর্ণ code

```tsx
import { useState } from 'react'
import { useCollectionStore, type SavedRequest } from '../store/useCollectionStore'
import { useRequestStore } from '../store/useRequestStore'

const methodColor: Record<string, string> = {
  GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400',
  PATCH: 'text-purple-400', DELETE: 'text-red-400',
}

export default function CollectionsPanel({ onClose }: { onClose: () => void }) {
  const { collections, createCollection, deleteCollection, deleteRequest } = useCollectionStore()
  const loadRequest = useRequestStore((s) => s.loadRequest)
  const [newName, setNewName] = useState('')

  const create = () => {
    if (!newName.trim()) return
    createCollection(newName.trim())
    setNewName('')
  }

  const load = (req: SavedRequest) => {
    loadRequest({ method: req.method, url: req.url, headers: req.headers, body: req.body })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-gray-900 border-l border-gray-800 flex flex-col h-full">
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">Collections</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer">×</button>
        </div>

        <div className="p-3 border-b border-gray-800 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="New collection name"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 rounded cursor-pointer"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {collections.length === 0 && (
            <p className="text-center text-gray-500 text-sm mt-8">
              No collections yet. Save a request to start.
            </p>
          )}
          {collections.map((c) => (
            <div key={c.id} className="border-b border-gray-800/50">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-800/30">
                <span className="font-medium text-sm">{c.name}</span>
                <button
                  onClick={() => deleteCollection(c.id)}
                  className="text-gray-600 hover:text-red-400 text-xs cursor-pointer"
                >
                  Delete
                </button>
              </div>
              {c.requests.length === 0 ? (
                <p className="px-4 py-2 text-xs text-gray-600">Empty</p>
              ) : (
                c.requests.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => load(r)}
                    className="group flex justify-between items-center px-4 py-2 hover:bg-gray-800/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-semibold w-12 ${methodColor[r.method] ?? 'text-gray-400'}`}>
                        {r.method}
                      </span>
                      <span className="text-sm text-gray-300 truncate">{r.name}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRequest(c.id, r.id) }}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

### Section A — props আর stores

```tsx
export default function CollectionsPanel({ onClose }: { onClose: () => void }) {
  const { collections, createCollection, deleteCollection, deleteRequest } = useCollectionStore()
  const loadRequest = useRequestStore((s) => s.loadRequest)
  const [newName, setNewName] = useState('')
```

- **Prop `onClose`** — parent (App.tsx) থেকে আসা callback। User যখন X, backdrop, বা request load করার পর — panel এটা call করে।
- **`useCollectionStore()`** — collection store থেকে যা যা দরকার সব destructure করি।
- **`useRequestStore((s) => s.loadRequest)`** — *অন্য* store থেকে শুধু `loadRequest` টানি। এটাই bridge — panel এক store-এ লেখে আর অন্য store থেকে পড়ে।
- **`useState('')`** — "new collection name" input-এর জন্য local state। Typing-এর সময়ই দরকার, তাই component-এ থাকে।

### Section B — local actions

#### `create`

```ts
const create = () => {
  if (!newName.trim()) return
  createCollection(newName.trim())
  setNewName('')
}
```

Validate (খালি না), whitespace trim, store action call, input clear। UUID generation store handle করে।

#### `load`

```ts
const load = (req: SavedRequest) => {
  loadRequest({ method: req.method, url: req.url, headers: req.headers, body: req.body })
  onClose()
}
```

Saved request নেয়, চারটা field request store-এর `loadRequest`-কে দেয়, তারপর drawer বন্ধ করে।

লক্ষ্য করো `req.id` বা `req.name` pass করি না — নতুন tab নিজে fresh UUID পায়, আর URL থেকে name derive হয় (Part 1-এর `deriveName` দেখো)।

### Section C — overlay structure

```tsx
<div className="fixed inset-0 z-50 flex">
  <div className="absolute inset-0 bg-black/60" onClick={onClose} />
  <div className="relative ml-auto w-full max-w-md bg-gray-900 border-l border-gray-800 flex flex-col h-full">
    ...
  </div>
</div>
```

তিনটা nested div। এটাই **modal/drawer pattern**:

1. **Outer wrapper:** `fixed inset-0` = পুরো viewport cover। `z-50` = সবকিছুর উপরে।
2. **Backdrop:** `absolute inset-0 bg-black/60` = semi-transparent কালো wrapper-এ ভরে। `onClick={onClose}` — drawer-এর বাইরে click করলে বন্ধ।
3. **Drawer নিজে:** `relative ml-auto` = normal positioned, ডান দিকে ঠেলে দেওয়া (`ml-auto` = `margin-left: auto`, flex children-কে ডানে ঠেলে)। `max-w-md` = max width ~28rem। `bg-gray-900 border-l` = solid dark panel।

`z-50` panel-কে সবার উপরে রাখে। 50 কেন, 1 কেন না? কারণ Tailwind-এর standard `z-` levels আছে (10, 20, 30, 40, 50), আর 50 top-এর জন্য reserved।

### Section D — header row

```tsx
<div className="flex justify-between items-center p-4 border-b border-gray-800">
  <h2 className="text-lg font-semibold">Collections</h2>
  <button onClick={onClose} className="text-gray-400 hover:text-white text-xl cursor-pointer">×</button>
</div>
```

বাঁ দিকে title, ডান দিকে close button। `justify-between` দুটোকে row-এর দুই প্রান্তে রাখে।

### Section E — new collection input

```tsx
<input
  value={newName}
  onChange={(e) => setNewName(e.target.value)}
  onKeyDown={(e) => e.key === 'Enter' && create()}
  placeholder="New collection name"
  ...
/>
<button onClick={create} ...>+</button>
```

Classic controlled input + button। `onKeyDown` shortcut user-কে `+` click না করে Enter চাপতে দেয়। `&&` short-circuit — `key === 'Enter'` হলেই `create()` call হয়।

### Section F — list

```tsx
<div className="flex-1 overflow-auto">
  {collections.length === 0 && (
    <p className="text-center text-gray-500 text-sm mt-8">
      No collections yet. Save a request to start.
    </p>
  )}
  {collections.map((c) => (
    <div key={c.id} className="border-b border-gray-800/50">
      ...
    </div>
  ))}
</div>
```

`flex-1` list-কে বাকি vertical space নিতে দেয়। `overflow-auto` list বড় হলে scrollbar add করে।

#### Empty state

```tsx
{collections.length === 0 && <p>No collections yet...</p>}
```

কোনো fancy কিছু না। Array খালি হলে একটা placeholder দেখাও।

#### Collection header

```tsx
<div className="flex justify-between items-center px-4 py-2 bg-gray-800/30">
  <span className="font-medium text-sm">{c.name}</span>
  <button onClick={() => deleteCollection(c.id)} ...>Delete</button>
</div>
```

বাঁ দিকে name, ডান দিকে Delete button। Delete click করলে পুরো collection (আর তার সব request) মুছে যায়।

#### Empty requests state

```tsx
{c.requests.length === 0 ? (
  <p className="px-4 py-2 text-xs text-gray-600">Empty</p>
) : (
  c.requests.map((r) => ( ... ))
)}
```

Ternary। Collection-এ কোনো request না থাকলে "Empty" দেখাও; না হলে map করো।

#### প্রতিটা saved request

```tsx
<div
  key={r.id}
  onClick={() => load(r)}
  className="group flex justify-between items-center px-4 py-2 hover:bg-gray-800/50 cursor-pointer"
>
  <div className="flex items-center gap-2 min-w-0">
    <span className={`text-xs font-semibold w-12 ${methodColor[r.method] ?? 'text-gray-400'}`}>
      {r.method}
    </span>
    <span className="text-sm text-gray-300 truncate">{r.name}</span>
  </div>
  <button
    onClick={(e) => { e.stopPropagation(); deleteRequest(c.id, r.id) }}
    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-sm cursor-pointer"
  >
    ×
  </button>
</div>
```

একটা row-এ:
- Method label (color দেওয়া)।
- Request name (লম্বা হলে truncated)।
- Delete X button (row-এ hover করলেই দেখা যায় — TabBar-এর মতোই `group-hover` trick)।

**পুরো row clickable** (`onClick={() => load(r)}`)। Delete X-এ `e.stopPropagation()` use করি যাতে এতে click করলে row-এর load action trigger না হয়। TabBar-এর close button-এ একই pattern use করেছিলাম।

---

## 2.6 File 3 — `RequestBuilder.tsx`-এর ভেতরের `SaveModal`

এবার Part 1-এ যে অংশ আমরা ছেড়ে এসেছিলাম সেটাতে ফিরি: inline SaveModal।

### সম্পূর্ণ code (শুধু modal portion)

```tsx
function SaveModal({ onClose }: { onClose: () => void }) {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)!
  const { collections, createCollection, saveRequest } = useCollectionStore()
  const [name, setName] = useState('')
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '')
  const [newCollectionName, setNewCollectionName] = useState('')

  const save = () => {
    if (!name.trim()) return
    let cid = collectionId
    if (!cid && newCollectionName.trim()) {
      createCollection(newCollectionName.trim())
      const cs = useCollectionStore.getState().collections
      cid = cs[cs.length - 1].id
    }
    if (!cid) return
    saveRequest(cid, {
      name: name.trim(),
      method: tab.method,
      url: tab.url,
      headers: tab.headers,
      body: tab.body,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md p-5 space-y-3">
        <h2 className="text-lg font-semibold">Save Request</h2>
        <input
          placeholder="Request name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        {collections.length > 0 ? (
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <input
            placeholder="New collection name"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="...">Cancel</button>
          <button onClick={save} className="...">Save</button>
        </div>
      </div>
    </div>
  )
}
```

### Section A — দুটো store থেকে পড়া

```ts
const tabs = useRequestStore((s) => s.tabs)
const activeTabId = useRequestStore((s) => s.activeTabId)
const tab = tabs.find((t) => t.id === activeTabId)!
const { collections, createCollection, saveRequest } = useCollectionStore()
```

Modal-এর যা লাগে:
- **Active tab** request store থেকে — এটাই save হচ্ছে।
- **Collections list + actions** collection store থেকে — কোথায় save হবে।

এটা CollectionsPanel-এর মতোই cross-store pattern (উল্টো direction)।

### Section B — তিন piece local state

```ts
const [name, setName] = useState('')
const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '')
const [newCollectionName, setNewCollectionName] = useState('')
```

- `name` — user request-এর জন্য যে নাম টাইপ করে।
- `collectionId` — selected collection ID। Initially প্রথম existing collection, বা empty string যদি না থাকে।
- `newCollectionName` — শুধু যখন কোনো collection নেই তখন use হয়।

**একটার বদলে তিন piece local state কেন?** কারণ এগুলো independent inputs। একসাথে object-এ combine করলে noise বাড়ে, benefit নেই।

`collections[0]?.id ?? ''` initialization-এ **optional chaining** (`?.`) আর **nullish coalescing** (`??`) use:
- `collections[0]` থাকলে তার `id` দাও।
- `collections[0]` undefined হলে (empty array), `?.` short-circuit হয়ে পুরো expression `undefined` হয়।
- `??` fallback দেয় যখন বাঁ পাশ `null` বা `undefined` হয়। তাই `''` পাই।

### Section C — `save` function (সবচেয়ে interesting)

```ts
const save = () => {
  if (!name.trim()) return
  let cid = collectionId
  if (!cid && newCollectionName.trim()) {
    createCollection(newCollectionName.trim())
    const cs = useCollectionStore.getState().collections
    cid = cs[cs.length - 1].id
  }
  if (!cid) return
  saveRequest(cid, {
    name: name.trim(),
    method: tab.method,
    url: tab.url,
    headers: tab.headers,
    body: tab.body,
  })
  onClose()
}
```

Walk through:

1. **Name validate করো।** খালি → চুপচাপ bail out।
2. **Collection ID resolve করো।** `collectionId`-এ যা আছে সেটা দিয়ে শুরু।
3. **Collection ID নেই কিন্তু user নতুন collection name টাইপ করেছে:**
   - নতুন collection বানাও।
   - **`useCollectionStore.getState().collections` দিয়ে store সরাসরি re-read করো।** কেন? কারণ `collections` (hook-এর variable) last render-এর snapshot — এতে এইমাত্র বানানো নতুন collection নেই। `.getState()` call করে আমরা *latest* state synchronously পাই।
   - নতুন collection array-এর শেষে, তাই `cs[cs.length - 1].id` আমাদের চাওয়া ID।
4. **এখনো ID না থাকলে bail করো।** আগের step-এর পরে হওয়ার কথা না, কিন্তু defensive।
5. **`saveRequest` call করো** resolved collection ID আর tab-এর current data দিয়ে (`id` বাদে — store generate করে)।
6. **Modal বন্ধ করো।**

> **Key concept:** `useStore.getState()` React-এর render cycle-এর বাইরে store পড়ে। এটা synchronous, non-reactive read। যখন তোমার এই মুহূর্তে latest value লাগে — component last render-এর সময়কার না — তখন use করো।

### Section D — modal markup

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/60" onClick={onClose} />
  <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md p-5 space-y-3">
    ...
  </div>
</div>
```

CollectionsPanel-এর মতোই overlay pattern, কিন্তু inner box `items-center justify-center` (দুই দিকে center) — `ml-auto` (ডানে aligned drawer)-এর বদলে।

`space-y-3` প্রথম ছাড়া প্রতিটা child-এ `margin-top: 0.75rem` apply করে। Tailwind-এর vertical-stack helper।

### Section E — conditional input

```tsx
{collections.length > 0 ? (
  <select value={collectionId} onChange={...}>
    {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
) : (
  <input placeholder="New collection name" value={newCollectionName} ... />
)}
```

Clever অংশ: **collections আছে কি না তার উপর UI adapt করে।**
- থাকলে → একটা pick করার dropdown।
- না থাকলে → নতুন বানানোর input।

এর মানে একদম নতুন user simple flow পায় (name টাইপ, Save) — "আগে একটা collection বানাও" আলাদা step লাগে না।

---

## 2.7 File 4 — `Navbar.tsx` (শুধু Collections button)

```tsx
<button
  onClick={onToggleCollections}
  className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded hover:bg-gray-800 cursor-pointer"
>
  Collections
</button>
```

Button `App.tsx` থেকে prop হিসেবে `onToggleCollections` পায়। Click করলে `setCollectionsOpen((o) => !o)` call হয় — boolean flip হয়।

ব্যস। Button সরাসরি store-এর কথা জানে না; শুধু parent-এর সাথে কথা বলে।

---

## 2.8 File 5 — `App.tsx` (conditional render)

```tsx
{collectionsOpen && <CollectionsPanel onClose={() => setCollectionsOpen(false)} />}
```

সহজ conditional render। Boolean true হলে component mount হয় (দেখায়); false হলে unmount হয়।

`onClose={() => setCollectionsOpen(false)}` — panel-কে একটা callback দিই যেটা সে নিজে close করতে চাইলে call করবে। Panel এই গুলোতে call করে:
- Backdrop click।
- X button।
- Request load করার পর (আমাদের `load` function-এ)।

---

## 2.9 End-to-end traces

### Trace A — নতুন collection-এ নতুন request save করা

তুমি `https://jsonplaceholder.typicode.com/users/1`-এ একটা GET request craft করো। **Save** click করো।

| Step | কোথায় | কী হচ্ছে |
|---|---|---|
| 1 | RequestBuilder | Save button-এর `onClick` `setSaveOpen(true)` call করে |
| 2 | React | `saveOpen === true` নিয়ে RequestBuilder re-render হয় |
| 3 | RequestBuilder | `{saveOpen && <SaveModal ... />}` line modal render করে |
| 4 | SaveModal | Component mount হয়। Request store থেকে active tab পড়ে। `collections.length === 0`, তাই dropdown-এর বদলে "new collection name" input দেখায়। |
| 5 | User | New collection input-এ "JSONPlaceholder" টাইপ করে। `setNewCollectionName('JSONPlaceholder')` |
| 6 | User | Request name input-এ "Get User 1" টাইপ করে। `setName('Get User 1')` |
| 7 | User | Save click করে। `save()` run হয়। |
| 8 | `save()` | Name validate করে। `collectionId` খালি কিন্তু `newCollectionName` set → `createCollection('JSONPlaceholder')` call করে |
| 9 | useCollectionStore | Action run হয়, state update হয়, persist localStorage-এ mirror করে |
| 10 | `save()` | `useCollectionStore.getState().collections` fresh array (length 1) return করে। `cid = cs[0].id` |
| 11 | `save()` | `saveRequest(cid, { name: 'Get User 1', method: 'GET', url: '...', headers: [...], body: '' })` call করে |
| 12 | useCollectionStore | Collection-এর `requests` array-এ এখন একটা entry আছে। Persist আবার লেখে। |
| 13 | `save()` | `onClose()` call করে |
| 14 | RequestBuilder | `setSaveOpen(false)` run হয়, modal unmount হয় |

শেষ। Request localStorage-এ saved।

### Trace B — drawer খুলে request load করা

পরের দিন browser আবার খুললে।

| Step | কোথায় | কী হচ্ছে |
|---|---|---|
| 1 | Browser | React mount হয়। |
| 2 | useCollectionStore | Persist middleware localStorage থেকে `reqbench-collections` পড়ে। Store তোমার collections দিয়ে rehydrate হয়। |
| 3 | User | Navbar-এ "Collections" click করে। |
| 4 | Navbar | `onToggleCollections` run হয় → App `collectionsOpen` flip করে `true`-তে। |
| 5 | App | Re-render। `<CollectionsPanel>` mount হয়। |
| 6 | CollectionsPanel | Store থেকে `collections` পড়ে। JSONPlaceholder collection আর তার একটা saved request render করে। |
| 7 | User | Saved request row-এ click করে। |
| 8 | CollectionsPanel | `load(req)` run হয়। Request store-এ `loadRequest({...})` call করে। |
| 9 | useRequestStore | `loadRequest` saved data দিয়ে নতুন tab বানায়, `tabs`-এ append করে, `activeTabId` নতুন tab-এর ID-তে set করে। |
| 10 | CollectionsPanel | `onClose()` run হয়। App `collectionsOpen` flip করে `false`-এ। Panel unmount। |
| 11 | RequestBuilder | Re-render। নতুন tab এখন active। URL/method/headers/body সব ভরে আছে। |
| 12 | User | Send click করে। (Part 1-এর flow।) |

### Trace C — request delete করা

| Step | কোথায় | কী হচ্ছে |
|---|---|---|
| 1 | User | Drawer-এ একটা saved request row-এর উপরে hover করে। |
| 2 | CSS | X button fade in (`opacity-0 group-hover:opacity-100`)। |
| 3 | User | X click করে। |
| 4 | Browser | X-এর `onClick` fire। `e.stopPropagation()` আগে run করে — row-এর `onClick` (যেটা request load করত) prevent করে। |
| 5 | CollectionsPanel | `deleteRequest(c.id, r.id)` run। |
| 6 | useCollectionStore | Request filter out। Persist লেখে। |
| 7 | React | CollectionsPanel ওই row ছাড়াই re-render। |

---

## 2.10 এই design "local-first" কেন

"Local-first" মানে: **user-এর data by default তার device-এ থাকে**। Cloud optional।

আমাদের app-এ:
- Sign in না করেই তুমি 10টা collection-এ 100টা request save করতে পার। সব `localStorage`-এ থাকে। Refresh, browser restart, এমনকি OS reboot — সব থাকে।
- Internet নেই? Perfectly কাজ করে।
- অন্য device-এ চাও? Sign in করো (Part 6) — তোমার local data তোমার Neon database-এ sync হয়, সেখান থেকে অন্য device-এ।

Postman-এর সাথে তুলনা করো: locally request save করতে চাইলেও Postman cloud-এ sign in করতে বলে। তোমার data **by default তাদের**।

এই philosophy আমাদের design choices guide করে:
- Collection store আর cloud snapshot একই shape। কোনো translation layer নেই।
- Sync localStorage-এর *mirror*, source of truth না।
- App auth ছাড়াই বা auth সহ একইভাবে কাজ করে।

---

## 2.11 Pitfalls আর gotchas

- **`useCollectionStore.getState()` vs hook।** `save()`-এর ভেতরে collection তৈরির পরে `.getState()` call করি। যদি hook-এর variable `collections` use করতাম, সেটা **create-এর আগের** snapshot হতো — নতুন collection দেখা যেত না। Function-এর মাঝে latest value লাগলে সবসময় `.getState()` use করো।

- **Cascading deletes।** Collection delete করলে তার সব request আপনাআপনি delete হয়, কারণ তারা ভেতরে nested। কোনো special logic দরকার নেই। যদি কখনো request-গুলোকে আলাদা table (বা root-level state)-এ move করো, তখন cascade লাগবে।

- **Method coloring `Record<string, string>` use করে, `Record<HttpMethod, string>` না।** `?? 'text-gray-400'` fallback defensive — কোনো saved request-এ যদি invalid method থাকে, crash না হয়ে gray দেখায়।

- **Drawer overlay পুরো screen cover করে।** Navbar আর tab bar সহ। কিছু UI inline drawer use করে যেটা content ঠেলে; আমরা overlay বেছেছি কারণ সহজ।

- **Empty collection-এর empty state।** `c.requests.length === 0` "Empty" দেখায়। কেন? কারণ একদম খালি `<div>` weird দেখাত। List-এ কিছু না থাকলে সবসময় *কিছু একটা* দেখাও।

- **Stable `key` props।** লক্ষ্য করো প্রতিটা list `key={x.id}` use করে — `key={index}` কখনো না। Index key reorder বা mid-list delete-এ break হয়। সবসময় stable identity দিয়ে key করো।

- **Edit support নেই।** Request save করতে পার, delete করতে পার, কিন্তু name edit বা content replace করতে পার না। আমরা completeness-এর চেয়ে simplicity বেছেছি — নতুন version লাগলে নতুন name-এ আবার save করো (বা delete করে re-save)।

- **Drag-and-drop reordering নেই।** একই reason। `react-dnd` দিয়ে সহজে add করা যাবে, কিন্তু dependency আর complexity বাড়ে।

---

## 2.12 DevTools exercises (নিজে test করো)

1. **localStorage live update দেখো।** DevTools → Application → Local Storage → `http://localhost:5173` খোলো। `reqbench-collections` row-এ click করো। এবার একটা request save করো — value সাথে সাথে update হবে। Delete করো — আবার update।

2. **Storage manually edit করো।** Value-এ click করে edit করো (যেমন collection name বদলাও), Enter চাপো। Page reload করো। Store তোমার edit থেকে rehydrate হবে।

3. **সব storage clear করো।** একই panel-এ right-click → Clear। Reload। সব collection উধাও। (সাবধানে use করো।)

4. **Console থেকে সরাসরি store দেখো।** `useCollectionStore.getState()` টাইপ করো — current state দেখবে। কিন্তু এটা কাজ করবে শুধু store window-এ expose করা থাকলে। আমরা সেটা করি না, তাই debugging-এর জন্য কোথাও `window.cs = useCollectionStore` add করতে হবে।

5. **App-এর দুটো browser tab খোলো।** তারা localStorage share করে কিন্তু **auto-sync করে না**। Tab 1-এ একটা collection save করো; tab 2 reload করলে দেখা যাবে। (Reload ছাড়া sync করতে চাইলে `storage` event listener লাগবে — scope-এর বাইরে।)

6. **একই request দুটো আলাদা collection-এ save করো।** প্রতিটা fresh UUID পায়। তারা independent — একটা modify করলে অন্যটায় effect পড়ে না।

7. **খালি field দিয়ে request save করো।** URL খালি রেখে save করতে চেষ্টা করো। "Save" button কাজ করবে; তোমার `url: ''` দিয়ে একটা saved request থাকবে। Load করলে URL ছাড়া tab পাবে। হালকা UX bug — incomplete input-এ Save button disable করে improve করা যায়।

---

## 2.13 Checklist — এই Part-এ যা জানা উচিত

- [ ] `useCollectionStore` `useRequestStore` থেকে কিভাবে আলাদা (`partialize` নেই, transient field নেই)।
- [ ] `Omit<T, K>` আর `Partial<T>` utility types।
- [ ] `?.` আর `??` operators।
- [ ] SaveModal `createCollection`-এর পর `useCollectionStore.getState()` কেন use করে।
- [ ] Cross-store pattern: panel collections পড়ে, `loadRequest` দিয়ে request store-এ লেখে।
- [ ] Overlay/drawer markup pattern (`fixed inset-0 z-50` + backdrop click)।
- [ ] Delete-X button-এ `e.stopPropagation()` কেন লাগে।
- [ ] `key={x.id}` use করি কেন, `key={index}` না।
- [ ] "Local-first" philosophy আর `localStorage` কেন source of truth।
- [ ] তিনটা end-to-end trace (save, load, delete)।

Ready হলে **"part 3"** বলো — **Concurrent Benchmark** — worker-pool engine যেটা P50/P90/P99 stats দেয়।

---

# Part 3 — Concurrent Benchmark (P50/P90/P99 সহ)

এই Part-এ আমরা একটা **load testing engine** বানাব। User একটা request craft করবে, "Bench" button-এ click করবে, total requests আর concurrency দেবে — server N সংখ্যক request parallel-এ পাঠাবে, latency stats আর live chart দেখাবে।

কিন্তু code-এ যাওয়ার আগে — তোমাকে বুঝতে হবে **P50/P90/P99 আসলে কী** আর **কেন এগুলো average-এর চেয়ে important**।

---

## 3.1 Foundation — P50, P90, P99 কী?

### সমস্যা: Average মিথ্যা বলে

ধরো তুমি একটা API-তে 100 request পাঠালে। 99টা request 100ms-এ response দিল। 1টা request 5000ms-এ। তুমি যদি **average** দেখো:

```
avg = (99 × 100 + 1 × 5000) / 100 = 149ms
```

149ms — শুনতে ভালো লাগে। কিন্তু সত্যি হলো: তোমার একজন user 5 second wait করেছে। অন্য 99 জন 100ms-এ পেয়েছে।

**Average এই reality হাইড করে।**

এখন উল্টোটা ভাবো: 50টা request 50ms-এ, 50টা request 500ms-এ:
```
avg = (50 × 50 + 50 × 500) / 100 = 275ms
```

আর: 100টা request সব 275ms-এ:
```
avg = 275ms
```

**দুটো scenario-র average একই। কিন্তু user experience আকাশ-পাতাল আলাদা।** প্রথম case-এ অর্ধেক user দ্রুত response পায়, অর্ধেক slow। দ্বিতীয় case-এ সবাই same medium-slow response পায়।

Average দিয়ে এটা ধরা যায় না। তাই **percentiles**।

### Percentile কী?

Response time-গুলোকে sort করে ছোট থেকে বড় সাজাও। তারপর কোনো একটা **percentage point**-এ যে value আছে সেটা পড়ো।

> **P50 (50th percentile)** = এমন একটা value যেখানে 50% request **এর সমান বা কম** time নিয়েছে। এটাকে **median** বলে।
>
> **P90** = 90% request এর সমান বা কম time নিয়েছে। অর্থাৎ 10% request এর চেয়ে slow।
>
> **P99** = 99% request এর সমান বা কম time নিয়েছে। অর্থাৎ **শুধু 1% request এর চেয়ে slow**।

### একটা concrete example

100টা response time, sort করা:
```
[10, 12, 15, 18, 20, 22, 25, 28, 30, 32, ...
 ... 95, 100, 105, 110, 120, 150, 200, 500, 800, 5000]
```

- **P50** = index 50-এ যে value = `100ms` (median)। অর্ধেক user 100ms বা কম পেয়েছে।
- **P90** = index 90-এ যে value = `200ms`। 10% user 200ms-এর বেশি wait করেছে।
- **P99** = index 99-এ যে value = `5000ms`। 1% user 5 second wait করেছে।

### কেন P50/P90/P99 important — interview-এ এই কথা বলো

**P50 (median)** — "typical user experience"। অর্ধেক user এর চেয়ে ভালো পায়, অর্ধেক এর চেয়ে খারাপ। Average-এর চেয়ে এটা সত্যিকার typical।

**P90** — "slightly bad days"। 10% time তোমার API এই rate-এ slow। যদি তুমি 1000 user-কে serve করো, 100 জন এর চেয়ে slow পাবে।

**P99** — "worst case for real users"। 1% manage না করলে busy days-এ কিছু user terrible experience পাবে। Big tech companies P99 obsessively monitor করে।

> **Industry standard:** Google-এর "Latency Numbers Every Programmer Should Know" doc, Amazon-এর "every 100ms slower = 1% sales loss" study, Netflix-এর autoscaling — সবই P99-based। Average কেউ use করে না।

### Percentile vs Average — কোনটা কখন

| Question | Right metric |
|---|---|
| "Typically কতক্ষণ লাগে?" | P50 |
| "Worst case কতক্ষণ লাগে real users-এর জন্য?" | P99 |
| "SLA promise করব?" | "P95 < 300ms" — never "avg" |
| "Outlier detect করব?" | P99 - P50 (gap যত বড়, তত variability) |
| Average কখন use করব? | প্রায় কখনোই — শুধু সাধারণ feel-এর জন্য |

### Percentile calculation — algorithm

Code-এ আমরা ঠিক এই কাজটাই করব:

```ts
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}
```

Step by step:
1. **Array sort করতে হবে আগে** (ছোট থেকে বড়)। সবসময়।
2. `p / 100 × length` = কোন position-এ percentile।
3. `Math.ceil` উপরে round করে (যাতে exact হিসাব হয়)।
4. `-1` কারণ array 0-indexed।
5. Negative হলে 0 fallback।

100 items-এর জন্য:
- P50 → `ceil(0.5 × 100) - 1 = 49` → 50তম item (0-indexed)
- P90 → `ceil(0.9 × 100) - 1 = 89` → 90তম item
- P99 → `ceil(0.99 × 100) - 1 = 98` → 99তম item

Simple, deterministic, O(n log n) due to sort। বড় scale-এ (লাখ লাখ items) people more efficient algorithms use করে (t-digest, HDR Histogram) — কিন্তু আমাদের max 500 requests, sort-ই perfect।

---

## 3.2 Foundation — Concurrency কী আসলে?

P50/P90/P99-এর পরে আরেকটা concept lock করা দরকার benchmark code পড়ার আগে: **concurrency**। এটাই benchmark-এর second knob (Total Requests-এর সাথে)।

### এক বাক্যে

**Concurrency = একই সময়ে কতগুলো কাজ চলমান অবস্থায় আছে।**

"কতগুলো কাজ চলছে" — important। "কতগুলো কাজ শেষ হয়েছে" না।

### একটা real-life example

কল্পনা করো তুমি একটা restaurant চালাচ্ছ। তোমার কাছে **১০ জন customer** এসেছে।

**Scenario A: তুমি একা waiter, concurrency = 1**

- Customer 1-এর order নাও → kitchen-এ পাঠাও → wait করো → food এলো → serve করো → এরপর customer 2-এ যাও।
- প্রতি customer-এ 5 মিনিট লাগলে — **10 customers × 5 মিনিট = 50 মিনিট মোট**।
- বেশিরভাগ সময় তুমি wait করছ (kitchen-এর জন্য)। Idle।

**Scenario B: তুমি একা waiter কিন্তু smart, concurrency = 5**

- Customer 1, 2, 3, 4, 5-এর order একসাথে নাও → kitchen-এ সব পাঠাও।
- যেহেতু কেউ একজন food ready হলে তুমি সাথে সাথে serve করতে পার, আর order নেওয়ার সময়ও অন্যদের serve করতে পার।
- যখনই 1 জনের food ready হয়, তুমি customer 6-এর order নাও।
- **মোট সময়: ~10-15 মিনিট**, 50 না।

তুমি কাজগুলো **interleave** করছ। একই সময়ে 5 জনের কাজ "in progress"।

### Concurrency vs Parallelism (একটা confusing point clear করি)

- **Parallelism** = সত্যিই একই moment-এ কয়েকটা কাজ হচ্ছে (multiple CPU cores লাগে)। যেমন: 5 জন waiter একসাথে কাজ করলে।
- **Concurrency** = কয়েকটা কাজ **in progress**, কিন্তু এক moment-এ shudhu একটাই active। CPU দ্রুত switch করে।

Node.js single-threaded। তাই technically parallelism নেই। কিন্তু কেন তবু "concurrent" বলতে পারি?

**কারণ network I/O slow। CPU 1ms-এ অনেক কাজ করতে পারে; network response আসতে 100ms লাগে।** এই 100ms-এ CPU কিছুই করছে না — শুধু wait করছে।

Concurrency 5 মানে: 5টা request পাঠালাম, 5টাই network-এ wait করছে, **CPU যেকোনো একটার response আসা মাত্র সেটা handle করতে পারে।** 5টা request "in progress" থাকে — যদিও CPU তখন idle।

### আমাদের benchmark-এ concurrency কেন?

দুটো reason:

**Reason 1: Realistic load simulation**

Production-এ user-রা একে একে request পাঠায় না। দিনের একই moment-এ 100 user একই endpoint hit করতে পারে। তোমার server তখন কেমন behave করবে?

- Sequential test (concurrency=1) দেখাবে: API 100ms-এ response দেয়।
- Concurrent test (concurrency=50) দেখাবে: একসাথে 50 জনের request আসলে P99 = 5000ms! Server saturate।

**এই difference ধরা important।** Production crash এই কারণেই হয় — load test concurrency-তে না করলে।

**Reason 2: Total time-এ controllable**

- Concurrency=1, total=100, response time 1s প্রতিটা → **100 second** লাগবে।
- Concurrency=10, total=100, response time 1s → **10 second** লাগবে।
- Concurrency=100, total=100 → **1 second** লাগবে।

বড় benchmark চালাতে চাইলে concurrency বাড়াতে হবে।

### Concurrency=1 vs =5 — concrete demo

ধরো একটা API আছে যেটা প্রতিটা request-এ exactly **1 second** নেয়। তুমি 10 request পাঠাচ্ছ।

**Concurrency = 1 (সিকোয়েন্সিয়াল)**

```
Time:    0s  1s  2s  3s  4s  5s  6s  7s  8s  9s  10s
Req 1:  [████]
Req 2:       [████]
Req 3:            [████]
Req 4:                 [████]
Req 5:                      [████]
Req 6:                           [████]
Req 7:                                [████]
Req 8:                                     [████]
Req 9:                                          [████]
Req 10:                                              [████]

Total: 10 seconds
RPS: 1
```

একটা শেষ হলে পরেরটা শুরু। 10 second লাগল।

**Concurrency = 5 (5টা parallel)**

```
Time:    0s  1s  2s
Req 1:  [████]
Req 2:  [████]
Req 3:  [████]
Req 4:  [████]
Req 5:  [████]
Req 6:       [████]
Req 7:       [████]
Req 8:       [████]
Req 9:       [████]
Req 10:      [████]

Total: 2 seconds
RPS: 5
```

প্রথম 5 একসাথে fire — সব 1 second পর শেষ। তখন next 5 fire। 2 second-এ সব শেষ। **5x faster।**

**Concurrency = 10 (সব parallel)**

```
Time:    0s  1s
Req 1-10: সব একসাথে [████]

Total: 1 second
RPS: 10
```

সব 10টা একসাথে fire। 1 second-এ শেষ।

### আমাদের code-এ এটা কীভাবে কাজ করে (preview)

`server/src/lib/benchmark.ts`-এর worker pool:

```ts
let nextIndex = 0
const total = config.totalRequests

async function worker() {
  while (true) {
    if (config.runSignal?.aborted) break
    const idx = nextIndex++
    if (idx >= total) break
    results.push(await executeOne(config, idx))
  }
}

await Promise.all(
  Array.from({ length: Math.min(config.concurrency, total) }, () => worker()),
)
```

**`concurrency` ঠিক করে কতগুলো worker spawn হবে।**

- Concurrency = 1 → 1 worker। সে একে একে 100 request নেয়।
- Concurrency = 5 → 5 workers। প্রতিজন shared counter থেকে index নিয়ে request পাঠায়। 1 জন idle হলেই সে পরের index নেয়।
- Concurrency = 50 → 50 workers। যেকোনো মুহূর্তে 50টা request "in flight"।

**Worker pool-এর beauty:** workers নিজে থেকে balance করে। Slow request-এর জন্য fast worker wait করে না। (পরের section-গুলোতে এই code বিস্তারিত দেখব।)

### কেন concurrency-র limit (max 50)?

আমাদের code-এ:
```ts
const conc = Math.min(Math.max(Number(concurrency) || 1, 1), 50)
```

Maximum 50 কেন? তিনটা কারণ:

1. **Target API তোমাকে rate-limit বা ban করতে পারে।** GitHub API-তে 100 parallel request পাঠালে IP block হবে।
2. **Node.js-এর default socket pool limit আছে।** 500 simultaneous connection খুলতে চাইলে issue হবে।
3. **আমাদের server resources।** Memory, file descriptors।

50 একটা reasonable upper bound personal tool-এর জন্য। Production load testers (k6, wrk) আরো বেশি allow করে।

### Interview-এ এই কথা বলবে

> "Concurrency = একই সময়ে কতগুলো request 'in flight'। Sequential (concurrency=1) test API-র baseline দেখায়, কিন্তু production load simulate করে না। Concurrency বাড়িয়ে আমরা realistic traffic pattern test করতে পারি — যেখানে multiple user একসাথে hit করে। Worker pool pattern দিয়ে যেকোনো মুহূর্তে exactly N টা request active রাখি — slow request-এর জন্য fast worker block হয় না, আর target API কে ভাসিয়ে দিইও না।"

এই answer-এ তুমি দেখাচ্ছ:
- Concept (concurrency vs parallelism)
- Why it matters (load simulation)
- Implementation (worker pool)
- Trade-off awareness (rate limits, server resources)

---

## 3.3 User story (user কী করবে)

1. User একটা request তৈরি করে (Part 1-এর mechanism)।
2. URL bar-এ **Bench** button click করে।
3. একটা modal খোলে। Total Requests (1-500) আর Concurrency (1-50) দেয়।
4. **Run Benchmark** click করে।
5. Server N parallel workers spin করে। প্রতিটা worker request পাঠায়, response time মাপে।
6. সব শেষ হলে server stats compute করে: RPS, P50, P90, P99, status code distribution, time series।
7. Modal-এ live chart appear করে — line chart (response time per request), pie chart (status codes)।
8. User চাইলে মাঝপথে **Cancel** চাপতে পারে — server চলমান workers কে abort করে partial results return করে।

---

## 3.4 কেন এটা সহজ না?

তিনটা real challenges:

### Challenge 1 — Browser-এ benchmark করা যায় না

Browser-এর `fetch` slow আর rate-limited। 100 parallel request-এ browser নিজেই throttle করবে। Realistic numbers পেতে **backend-এ** benchmark চালাতে হবে — Node.js, যার network I/O fast আর unrestricted।

### Challenge 2 — Concurrency সঠিকভাবে handle করা

100 request "একসাথে" পাঠানো মানে কী? দুটো naive approach আছে:

**Naive ১:** `Promise.all(requests)` দিয়ে সব একসাথে fire করা। Problem: 100 simultaneous connections খোলে — target API ban করতে পারে, OS file descriptor limit hit হতে পারে।

**Naive ২:** Sequential loop — একটা শেষ হলে পরেরটা। Problem: এটা concurrency না, এটা single-threaded! Concurrency 10 মানে যেকোনো মুহূর্তে **10টা request in flight**, total 100।

আমরা **worker pool** pattern use করব — N workers একটা shared counter থেকে request নেয়। যেকোনো সময় ঠিক N টা active।

### Challenge 3 — Cancellation

User Cancel চাপলে — server-এ চলমান workers কে কীভাবে stop করব? **`AbortController`** + a registry of active runs।

---

## 3.5 কোন কোন file লাগবে

| # | File | কাজ |
|---|---|---|
| 1 | `server/src/lib/benchmark.ts` | **Worker pool engine** + percentile math |
| 2 | `server/src/index.ts` | দুটো routes: `/api/benchmarks/run` আর `/api/benchmarks/cancel` |
| 3 | `client/src/components/BenchmarkModal.tsx` | Config form + Recharts visualizations |
| 4 | `client/src/components/RequestBuilder.tsx` | "Bench" button যেটা modal খোলে (Part 1-এ আমরা দেখেছি) |

মূল কাজ benchmark.ts-এ। Modal শুধু UI।

---

## 3.6 File 1 — `server/src/lib/benchmark.ts` (engine)

### সম্পূর্ণ code

```ts
export interface BenchmarkConfig {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  totalRequests: number
  concurrency: number
  timeoutMs: number
  runSignal?: AbortSignal
}

export interface RequestResult {
  index: number
  status: number | null
  responseTime: number
}

export interface BenchmarkResults {
  totalRequests: number
  successCount: number
  failureCount: number
  totalDuration: number
  requestsPerSecond: number
  avgResponseTime: number
  p50: number
  p90: number
  p99: number
  statusCodeBreakdown: Record<string, number>
  timeSeries: { index: number; responseTime: number; status: number | null }[]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

async function executeOne(config: BenchmarkConfig, index: number): Promise<RequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  const start = performance.now()

  try {
    const res = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.body && config.method !== 'GET' && config.method !== 'HEAD' ? config.body : undefined,
      signal: controller.signal,
    })
    await res.text()
    return { index, status: res.status, responseTime: Math.round(performance.now() - start) }
  } catch {
    return { index, status: null, responseTime: Math.round(performance.now() - start) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResults> {
  const results: RequestResult[] = []
  let nextIndex = 0
  const total = config.totalRequests
  const benchmarkStart = performance.now()

  async function worker() {
    while (true) {
      if (config.runSignal?.aborted) break
      const idx = nextIndex++
      if (idx >= total) break
      results.push(await executeOne(config, idx))
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(config.concurrency, total) }, () => worker()),
  )

  const totalDuration = Math.round(performance.now() - benchmarkStart)
  const times = results.map((r) => r.responseTime).sort((a, b) => a - b)
  const successCount = results.filter((r) => r.status !== null && r.status < 500).length

  const statusBreakdown: Record<string, number> = {}
  for (const r of results) {
    const key = r.status === null ? 'error' : String(r.status)
    statusBreakdown[key] = (statusBreakdown[key] || 0) + 1
  }

  const sum = times.reduce((a, b) => a + b, 0)

  return {
    totalRequests: results.length,
    successCount,
    failureCount: results.length - successCount,
    totalDuration,
    requestsPerSecond: totalDuration > 0 ? Number(((results.length / totalDuration) * 1000).toFixed(2)) : 0,
    avgResponseTime: times.length > 0 ? Math.round(sum / times.length) : 0,
    p50: percentile(times, 50),
    p90: percentile(times, 90),
    p99: percentile(times, 99),
    statusCodeBreakdown: statusBreakdown,
    timeSeries: results
      .sort((a, b) => a.index - b.index)
      .map((r) => ({ index: r.index, responseTime: r.responseTime, status: r.status })),
  }
}
```

### Section A — type definitions

```ts
export interface BenchmarkConfig {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  totalRequests: number
  concurrency: number
  timeoutMs: number
  runSignal?: AbortSignal
}
```

Engine-কে যা যা দিতে হবে:
- **`method, url, headers, body`** — target request।
- **`totalRequests`** — কতগুলো request পাঠাব।
- **`concurrency`** — যেকোনো মুহূর্তে কতগুলো parallel।
- **`timeoutMs`** — প্রতিটা individual request-এর timeout।
- **`runSignal?: AbortSignal`** — optional cancellation signal। Cancel route এটা trigger করবে।

```ts
export interface RequestResult {
  index: number      // কোন নম্বর request ছিল (0..total-1)
  status: number | null   // HTTP status, বা error হলে null
  responseTime: number    // ms-এ
}
```

প্রতিটা individual request-এর result।

```ts
export interface BenchmarkResults {
  totalRequests: number
  successCount: number
  failureCount: number
  totalDuration: number
  requestsPerSecond: number
  avgResponseTime: number
  p50: number
  p90: number
  p99: number
  statusCodeBreakdown: Record<string, number>
  timeSeries: { index: number; responseTime: number; status: number | null }[]
}
```

Final aggregated result যা client পায়:
- **`statusCodeBreakdown`** — `{ "200": 95, "500": 3, "error": 2 }` — pie chart-এর জন্য।
- **`timeSeries`** — প্রতিটা request individually, line chart-এর জন্য।

### Section B — `percentile` function

```ts
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}
```

3.1-এ explain করেছি। **মূল assumption: input array ইতিমধ্যেই sorted** (ছোট থেকে বড়)। তুমি যদি unsorted array দাও, output ভুল হবে।

কেন function-এর ভেতরে sort না? কারণ আমরা একই array থেকে P50, P90, P99 তিনটা compute করি — একবার sort করলেই হয়, প্রতিবার না।

### Section C — `executeOne` function (একটা request)

```ts
async function executeOne(config: BenchmarkConfig, index: number): Promise<RequestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  const start = performance.now()

  try {
    const res = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.body && config.method !== 'GET' && config.method !== 'HEAD' ? config.body : undefined,
      signal: controller.signal,
    })
    await res.text() // consume body so timing reflects full response
    return { index, status: res.status, responseTime: Math.round(performance.now() - start) }
  } catch {
    return { index, status: null, responseTime: Math.round(performance.now() - start) }
  } finally {
    clearTimeout(timeout)
  }
}
```

Part 1-এর `/api/requests/execute`-এর simpler cousin। তিনটা পার্থক্য:

1. **Per-request timeout।** প্রতিটা individual fetch-এর জন্য আলাদা `AbortController`। একটা request hang করলেও পুরো benchmark thrash হবে না।

2. **`await res.text()` body consume করে।** কেন? কারণ যদি body না পড়ি, fetch headers পেলেই resolve হয়ে যায় — true response time-এ body download include হয় না। Real-world performance বুঝতে body সহ মাপতে হবে।

3. **Error হলে exception throw হয় না।** Catch block একটা valid `RequestResult` return করে যার `status: null`। কেন? কারণ benchmark-এ "10টা request fail" — সেটা একটা **stat**, পুরো run abort করার কারণ না।

`performance.now()` Node-এ high-resolution timestamp দেয় (millisecond এর চেয়েও precise)।

### Section D — `runBenchmark` (heart)

```ts
export async function runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResults> {
  const results: RequestResult[] = []
  let nextIndex = 0
  const total = config.totalRequests
  const benchmarkStart = performance.now()

  async function worker() {
    while (true) {
      if (config.runSignal?.aborted) break
      const idx = nextIndex++
      if (idx >= total) break
      results.push(await executeOne(config, idx))
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(config.concurrency, total) }, () => worker()),
  )
  // ... compute stats
}
```

এটাই **worker pool pattern**। একটু সময় নিয়ে বুঝি।

#### Shared counter idea

ভাবো একটা কাজের stack — 100টা card, প্রতিটায় একটা index লেখা (0 থেকে 99)। 5 জন worker দাঁড়িয়ে আছে। প্রতিজন stack থেকে একটা card নেয়, কাজ করে, আবার stack-এ আসে।

Code-এ:
- **`nextIndex`** = stack-এর top। শুরুতে 0।
- **`worker()`** = একজন worker-এর behavior। Loop-এ `idx = nextIndex++` (atomic-ish — JavaScript single-threaded, তাই data race নেই)।
- **`idx >= total`** → stack empty, exit।

#### কেন `Promise.all(Array.from(...))`?

```ts
await Promise.all(
  Array.from({ length: Math.min(config.concurrency, total) }, () => worker()),
)
```

- **`Math.min(concurrency, total)`** — যদি user 100 concurrency দেয় কিন্তু only 5 request, 5টা worker spawn করি (বেশি বানিয়ে লাভ নেই)।
- **`Array.from({ length: N }, () => worker())`** — N বার `worker()` call করে N টা Promise তৈরি করে।
- **`Promise.all(promises)`** — সব worker শেষ না হওয়া পর্যন্ত wait করে।

প্রতিটা `worker()` async function — শুরু করার সাথে সাথে এটা Promise return করে আর backgrund-এ চলতে থাকে। তাই 5টা worker truly parallel চলে (Node-এর event loop-এ)।

#### `Promise.all` vs naive `Promise.all`

Naive approach হতো:
```ts
// খারাপ
const promises = Array.from({ length: total }, (_, i) => executeOne(config, i))
await Promise.all(promises)
```

এতে কী problem? **`total` সংখ্যক request একসাথে fire হবে।** Concurrency কে control করা যাবে না।

আমাদের approach-এ **exactly `concurrency` টা worker** চলে, যেকোনো মুহূর্তে। Total request যত বড়ই হোক, parallelism bound।

#### Cancellation in the loop

```ts
while (true) {
  if (config.runSignal?.aborted) break
  // ...
}
```

প্রতিটা iteration-এ check করে — যদি cancel signal trigger হয়, worker exit করে। `Promise.all` সব worker শেষ হওয়ার পর resolve হয়, partial results সহ return করে।

### Section E — Stats computation (run শেষ হওয়ার পর)

```ts
const totalDuration = Math.round(performance.now() - benchmarkStart)
const times = results.map((r) => r.responseTime).sort((a, b) => a - b)
const successCount = results.filter((r) => r.status !== null && r.status < 500).length
```

- **`totalDuration`** — পুরো run কতক্ষণ লেগেছে (cancellation-এ partial)।
- **`times`** — শুধু response time, sorted ascending। **এই sorted array থেকেই percentile compute হবে।**
- **`successCount`** — status যদি `null` না হয় (manage হয়েছে) **এবং** 500-এর নিচে হয়। 4xx (404, 401)-কেও success ধরি — server responded, infrastructure failure না।

```ts
const statusBreakdown: Record<string, number> = {}
for (const r of results) {
  const key = r.status === null ? 'error' : String(r.status)
  statusBreakdown[key] = (statusBreakdown[key] || 0) + 1
}
```

Status code histogram। Pie chart-এ data এই থেকে আসে। Null status-কে "error" label দিই।

`(statusBreakdown[key] || 0) + 1` — যদি key ইতিমধ্যে থাকে, count নাও; না থাকলে 0 দিয়ে শুরু করো।

```ts
return {
  totalRequests: results.length,
  successCount,
  failureCount: results.length - successCount,
  totalDuration,
  requestsPerSecond: totalDuration > 0 ? Number(((results.length / totalDuration) * 1000).toFixed(2)) : 0,
  avgResponseTime: times.length > 0 ? Math.round(sum / times.length) : 0,
  p50: percentile(times, 50),
  p90: percentile(times, 90),
  p99: percentile(times, 99),
  statusCodeBreakdown: statusBreakdown,
  timeSeries: results.sort((a, b) => a.index - b.index).map((r) => ({ ... })),
}
```

Final result object।

- **`requestsPerSecond`** = `results.length / totalDuration × 1000`। 100 requests in 2000ms = 50 RPS।
- **`avgResponseTime`** — শুধু comparison-এর জন্য রাখি, কিন্তু আগে দেখিয়েছি average বিশ্বাসযোগ্য না।
- **`timeSeries`** — line chart-এর জন্য। `results.sort((a, b) => a.index - b.index)` — execution order-এ sort (worker pool out-of-order করে রাখে)।

---

## 3.7 File 2 — `server/src/index.ts` (route handlers)

### `/api/benchmarks/run` route

```ts
const activeRuns = new Map<string, AbortController>()

app.post('/api/benchmarks/run', async (req, res) => {
  const { runId, method, url, headers, body, totalRequests, concurrency } = req.body

  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }
  try { new URL(url) } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  const total = Math.min(Math.max(Number(totalRequests) || 1, 1), 500)
  const conc = Math.min(Math.max(Number(concurrency) || 1, 1), 50)

  const controller = new AbortController()
  if (runId) activeRuns.set(runId, controller)

  try {
    const results = await runBenchmark({
      method, url, headers: headers || {}, body,
      totalRequests: total,
      concurrency: conc,
      timeoutMs: 30000,
      runSignal: controller.signal,
    })
    res.json({ ...results, cancelled: controller.signal.aborted })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: `Benchmark failed: ${message}` })
  } finally {
    if (runId) activeRuns.delete(runId)
  }
})
```

#### `activeRuns` — in-memory registry

```ts
const activeRuns = new Map<string, AbortController>()
```

Module-level `Map`। Currently running benchmarks-এর `AbortController` track করে। Key হলো client-supplied `runId` (UUID)।

কেন `Map`? কারণ cancel route-এ আমাদের specific run-কে খুঁজে abort করতে হবে।

#### Input clamping

```ts
const total = Math.min(Math.max(Number(totalRequests) || 1, 1), 500)
const conc = Math.min(Math.max(Number(concurrency) || 1, 1), 50)
```

Defensive — user (বা malicious client) যদি `totalRequests: 1000000` পাঠায়, server crash না করুক। `Math.max(_, 1)` মানে minimum 1, `Math.min(_, 500)` মানে maximum 500।

`Number(x) || 1` — যদি `x` undefined বা NaN হয়, 1 default।

#### Registration

```ts
const controller = new AbortController()
if (runId) activeRuns.set(runId, controller)
```

নতুন `AbortController` বানাই, registry-তে store করি। `runId` যদি না দেয়, registry skip — তখন cancel possible না।

#### Run + cleanup

```ts
try {
  const results = await runBenchmark({
    ...
    runSignal: controller.signal,
  })
  res.json({ ...results, cancelled: controller.signal.aborted })
} catch (err: unknown) {
  // 500 response
} finally {
  if (runId) activeRuns.delete(runId)
}
```

- `runSignal: controller.signal` — engine-কে pass করি যাতে cancel signal শুনতে পারে।
- `controller.signal.aborted` — run চলাকালীন abort হয়েছিল কিনা সেটা response-এ যোগ করি।
- `finally` registry cleanup। Memory leak avoid করার জন্য জরুরি।

### `/api/benchmarks/cancel` route

```ts
app.post('/api/benchmarks/cancel', (req, res) => {
  const controller = activeRuns.get(req.body?.runId)
  if (!controller) {
    res.status(404).json({ error: 'No active run with that id' })
    return
  }
  controller.abort()
  res.json({ cancelled: true })
})
```

সহজ। Map থেকে controller খুঁজে, `.abort()` call করে।

Worker pool-এর `if (config.runSignal?.aborted) break` ফোঁটায় ফোঁটায় react করে — যে worker গুলো বর্তমানে একটা fetch-এ wait করছে তারা সেটা শেষ করে, পরের iteration-এ exit করে। তাই cancel **graceful** — পুরোপুরি instant না।

---

## 3.8 File 3 — `client/src/components/BenchmarkModal.tsx`

### Imports

```tsx
import { useState, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useRequestStore } from '../store/useRequestStore'
```

**Recharts** — declarative React chart library। SVG-based, customizable, lightweight। আমরা দুটো chart use করি: LineChart আর PieChart।

### Component setup

```tsx
export default function BenchmarkModal({ onClose }: { onClose: () => void }) {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)!

  const [totalRequests, setTotalRequests] = useState(50)
  const [concurrency, setConcurrency] = useState(5)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<BenchmarkResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runIdRef = useRef<string | null>(null)
  ...
}
```

- **Active tab** — Part 1-এর pattern।
- **Local state**: total, concurrency, running flag, results, error।
- **`useRef`** for `runIdRef` — কেন `useState` না? কারণ runId change হলে re-render-এর দরকার নেই। Ref ভ্যালু রাখে কিন্তু re-render trigger করে না।

### `run` function

```tsx
const run = async () => {
  setRunning(true); setResults(null); setError(null)
  const runId = crypto.randomUUID()
  runIdRef.current = runId

  try {
    const res = await fetch('/api/benchmarks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId,
        method: tab.method,
        url: tab.url,
        headers: buildHeaders(),
        body: tab.body,
        totalRequests, concurrency,
      }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else setResults(data)
  } catch {
    setError('Failed to reach backend')
  } finally {
    setRunning(false)
    runIdRef.current = null
  }
}
```

1. **Reset state** — old results/error clear।
2. **Generate `runId`** — fresh UUID, ref-এ save।
3. **POST** to `/api/benchmarks/run` with config।
4. **`await res.json()`** — server এই call **পুরো benchmark শেষ হওয়া পর্যন্ত** block করে। কয়েক second-ও লাগতে পারে।
5. **Set state** — error বা results।
6. **Finally** — running flag false, ref clear।

### `cancel` function

```tsx
const cancel = async () => {
  if (!runIdRef.current) return
  await fetch('/api/benchmarks/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId: runIdRef.current }),
  }).catch(() => {})
}
```

Active runId থাকলে cancel POST পাঠাও। `.catch(() => {})` errors swallow করে (cancel কাজ না করলেও কিছু breaking না)।

### Results rendering — stat cards

```tsx
<div className="grid grid-cols-4 gap-3">
  <Stat label="Requests/sec" value={results.requestsPerSecond} highlight="text-blue-400" />
  <Stat label="Avg" value={results.avgResponseTime} unit="ms" />
  <Stat label="Success" value={results.successCount} highlight="text-green-400" />
  <Stat label="Failed" value={results.failureCount} highlight={results.failureCount > 0 ? 'text-red-400' : 'text-gray-400'} />
</div>
<div className="grid grid-cols-3 gap-3">
  <Stat label="P50" value={results.p50} unit="ms" />
  <Stat label="P90" value={results.p90} unit="ms" />
  <Stat label="P99" value={results.p99} unit="ms" />
</div>
```

দুটো grid:
- 4 columns: RPS, Avg, Success, Failed।
- 3 columns: P50, P90, P99 — আমাদের star metrics।

`Stat` একটা ছোট reusable component — label + value + optional unit + optional color।

### Line chart (response time per request)

```tsx
<ResponsiveContainer width="100%" height={180}>
  <LineChart data={results.timeSeries.map((s) => ({ index: s.index + 1, ms: s.responseTime }))}>
    <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
    <XAxis dataKey="index" stroke="#9ca3af" tick={{ fontSize: 11 }} />
    <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} unit="ms" />
    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', fontSize: 12 }} />
    <Line type="monotone" dataKey="ms" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
  </LineChart>
</ResponsiveContainer>
```

- **`ResponsiveContainer`** — chart parent-এর width নিয়ে adapts।
- **`data`** — array of `{ index, ms }` objects।
- **`<XAxis dataKey="index">`** — x-axis = request number।
- **`<YAxis unit="ms">`** — y-axis = response time।
- **`<Line dataKey="ms">`** — y values এই key থেকে।
- **`dot={false}`** — প্রতিটা point-এ dot হাইড (500 dot ugly হবে)।
- **`isAnimationActive={false}`** — animation off (instant render)।

এই chart দেখায় time-এর সাথে response time variability কেমন। Spike মানে slow requests।

### Pie chart (status codes)

```tsx
const pieData = results
  ? Object.entries(results.statusCodeBreakdown).map(([code, count]) => ({
      name: code, value: count, fill: statusColor(code),
    }))
  : []
```

`statusCodeBreakdown: { "200": 95, "500": 3, "error": 2 }` → `[{name: "200", value: 95, fill: "#22c55e"}, ...]`।

```tsx
<PieChart>
  <Tooltip ... />
  <Legend ... />
  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} isAnimationActive={false}>
    {pieData.map((e) => <Cell key={e.name} fill={e.fill} />)}
  </Pie>
</PieChart>
```

- **`<Pie>`** — slices automatically calculate from `value`।
- **`<Cell>`** — প্রতিটা slice-এর color manually।
- **`cx="50%" cy="50%"`** — center।

User দেখতে পায়: কতগুলো 200, 4xx, 5xx, error।

---

## 3.9 End-to-end trace — Send to Display

User একটা request craft করে। Bench click করে। Total: 100, Concurrency: 10। Run চাপে।

| # | কোথায় | কী হচ্ছে |
|---|---|---|
| 1 | BenchmarkModal | `setRunning(true)`, fresh `runId` generate, ref-এ save |
| 2 | Browser | POST `/api/benchmarks/run` with `{runId, method, url, ..., totalRequests:100, concurrency:10}` |
| 3 | Vite | Proxy to `localhost:3001` |
| 4 | Express | `req.body` destructure, URL validate, inputs clamp (100, 10) |
| 5 | Express | New `AbortController`, `activeRuns.set(runId, controller)` |
| 6 | runBenchmark | `nextIndex = 0`, `benchmarkStart = performance.now()` |
| 7 | runBenchmark | `Math.min(10, 100) = 10` workers spawn through `Promise.all` |
| 8 | Worker 1 | `idx = 0`, `executeOne(config, 0)` — fetch request 1 |
| 9 | Worker 2 | `idx = 1`, fetch request 2 (parallel) |
| 10 | ... | Workers 3-10 similarly |
| 11 | Worker 1 | request 1 done — `idx = 10`, fetch request 11 |
| 12 | ... | Continues until `idx >= 100` |
| 13 | Workers | সব exit, `Promise.all` resolves |
| 14 | runBenchmark | `times.sort()` (ascending) |
| 15 | runBenchmark | `percentile(times, 50/90/99)`, status histogram, RPS calculation |
| 16 | runBenchmark | Return `BenchmarkResults` |
| 17 | Express | `res.json({...results, cancelled: false})` |
| 18 | Express | `finally`: `activeRuns.delete(runId)` |
| 19 | BenchmarkModal | `await res.json()` resolves, `setResults(data)` |
| 20 | BenchmarkModal | Re-render — stat cards + line chart + pie chart appear |

মোট সময়: depends — slow target হলে minutes, fast target হলে seconds।

### Cancellation trace

ধরো step 12-এ user **Cancel** চাপে।

| # | কোথায় | কী হচ্ছে |
|---|---|---|
| 1 | BenchmarkModal | `cancel()` runs |
| 2 | Browser | POST `/api/benchmarks/cancel` with `{runId}` |
| 3 | Express | `activeRuns.get(runId)` → controller |
| 4 | Express | `controller.abort()` |
| 5 | Express | Reply `{cancelled: true}` |
| 6 | runBenchmark workers | পরের iteration-এ `runSignal.aborted === true` → exit |
| 7 | Worker | যদি বর্তমানে fetch-এ wait করছিল — সেটা শেষ করে exit |
| 8 | `Promise.all` | সব worker exit হলে resolve |
| 9 | runBenchmark | Compute stats on partial results (e.g. 50 of 100 complete) |
| 10 | Express | `res.json({...partial, cancelled: true})` |
| 11 | BenchmarkModal | Partial results render হয় |

User partial chart দেখে — যা যা complete হয়েছিল।

---

## 3.10 মজার trade-offs

### কেন in-memory `activeRuns`, Redis না?

আমাদের single Express instance। Multiple instances হলে (load balancer-এর পেছনে), একটা instance-এর registry অন্য instance-এ দেখা যেত না। Redis দরকার হতো। Single instance-এর জন্য `Map` enough।

### কেন `Number(((... / total) * 1000).toFixed(2))`?

```ts
requestsPerSecond: totalDuration > 0 ? Number(((results.length / totalDuration) * 1000).toFixed(2)) : 0,
```

`.toFixed(2)` decimal precision (2 digits) — but returns string। `Number(...)` আবার number-এ convert করে। JSON-এ pretty rendering-এর জন্য।

### Sort করা slow নয়?

`O(n log n)` for n=500 — কয়েক microsecond। Negligible compared to network time।

### কেন warmup নেই?

Real benchmarking tools (wrk, k6) "warmup phase" রাখে — first few requests discard করে। কারণ TLS handshake, DNS, connection pool — প্রথম request slow হয়। আমরা simplicity-এর জন্য skip করেছি। চাইলে add করা যাবে।

### কেন distribution histogram নেই?

Recharts-এ histogram complex। Pie chart + line chart enough information দেয়। চাইলে add করা যাবে।

---

## 3.11 Pitfalls

- **Client `fetch` কে benchmark-এর সাথে confuse করো না।** Browser-এ benchmark চালালে browser নিজেই throttle করে — 50 parallel fetch করতে দেয় না। আমাদের benchmark server-side, তাই unrestricted।

- **`body && method !== 'GET' && method !== 'HEAD'`** — GET/HEAD-এ body পাঠানো HTTP spec violation। `node-fetch`/`undici` strict — body include করলে throw করতে পারে।

- **Cancellation graceful, instant না।** Worker যদি fetch-এ wait করে, সেটা শেষ হবে। Worst case = 30s timeout।

- **`runId` client-supplied।** Server এটা trust করে। Malicious client একই `runId` দিয়ে অন্য কারো run cancel করতে পারে (theoretically)। Multi-tenant production-এ user-scoped IDs দরকার।

- **`Map` cleanup।** `finally` block crucial — না হলে `activeRuns` infinitely grow করবে।

- **Percentile precision low for small n।** 10 requests থাকলে P99 = 10th item (worst case)। Statistically meaningful percentile-এর জন্য 100+ samples চাই। আমাদের min 1 allow, কিন্তু interview-এ এই caveat বলতে পারো।

---

## 3.12 DevTools exercises

1. **Slow API দিয়ে chaos দেখো।** URL: `https://httpbin.org/delay/2` (2 second sleep)। Total 20, Concurrency 5। `total / concurrency × 2s ≈ 8 second` লাগবে। Line chart দেখাবে সব request ~2000ms।

2. **Cancellation timing test।** Total 100, slow target। 5 second পর Cancel চাপো। Partial results দেখো — কতগুলো complete হয়েছিল।

3. **High concurrency।** Concurrency 50, Total 50। সব 50টা parallel — total duration ≈ 1টা request-এর time। 

4. **Low concurrency।** Concurrency 1, Total 10। Sequential — total duration ≈ 10 × single response time।

5. **Average vs P99 deceit।** একটা real API-তে 100 request মারো। দেখো avg আর P99 কত। যদি API consistent হয়, gap কম। Inconsistent হলে P99 অনেক বেশি।

6. **Failure injection।** URL: `https://httpbin.org/status/500`। 50 request করো। Success 0, Failed 50, status breakdown 100% red 500 slice।

7. **Status mix।** URL: `https://httpbin.org/status/200,400,500` — random status return করে। Pie chart varied দেখাবে।

---

## 3.13 Checklist — এই Part-এ যা জানা উচিত

- [ ] P50/P90/P99 মানে কী, average থেকে আলাদা কেন।
- [ ] Percentile calculation formula (`ceil(p/100 × len) - 1`)।
- [ ] **Worker pool pattern** — shared counter + N workers।
- [ ] Naive `Promise.all(allRequests)` কেন bad (unbounded concurrency)।
- [ ] `AbortController` দিয়ে cancellation কীভাবে কাজ করে (server-side registry)।
- [ ] কেন body consume (`await res.text()`) — timing accuracy।
- [ ] `Math.min/max` দিয়ে input clamping defensively।
- [ ] কেন `useRef` for `runId` (no re-render trigger)।
- [ ] Recharts-এর `LineChart` আর `PieChart` minimum config।
- [ ] `Map<string, AbortController>` registry আর `finally` cleanup।
- [ ] Cancellation graceful, instant না।
- [ ] Single-instance limit (multi-instance হলে Redis লাগবে)।

Interview-এ এটাই বলবে: **"Worker pool with shared counter, sort + percentile (`ceil(p × n) - 1`), AbortController registry indexed by client-supplied runId for graceful cancel."**

Ready হলে **"part 4"** বলো — **Visual Flow Editor** — React Flow, topological sort, template chaining।
