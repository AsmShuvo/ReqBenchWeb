# ReqBench — Step-by-Step Learning Guide

> You vibe-coded this. Now we're going to learn it together, one feature at a time. Each chapter explains **one** feature: why it exists, every file involved, every important line of code, and what actually happens when the user clicks a button.
>
> **How to use this guide:** Read one chapter. Open the files it mentions. Read those files yourself. Come back. Ask for the next chapter when you're ready.

---

## Curriculum (the order we'll go)

We're going from the most basic to the most advanced. Each builds on the previous one.

| # | Feature | What you'll learn |
|---|---|---|
| **1** | **Sending a basic HTTP request** ← *this chapter* | Frontend ↔ backend wiring, Vite proxy, Express, Zustand stores, fetch, AbortController |
| 2 | Adding params, headers, body, and auth | Form state, KeyValuePair UI, building URLs and headers |
| 3 | Multi-tab interface | Tab management, per-tab state |
| 4 | Persisting state across reloads | Zustand `persist` middleware, localStorage |
| 5 | Request history | The Repository pattern |
| 6 | Environment variables (`{{baseUrl}}`) | Regex substitution, multi-store coordination |
| 7 | Collections, folders, saving requests | Nested data, modals |
| 8 | Code generation (cURL / fetch / axios / Python) | Pure-function generators, registry pattern |
| 9 | Compare / diff two responses | JSON tree diff, LCS line diff |
| 10 | Importers (cURL, Postman, OpenAPI) | Parsers, tokenizers, a tiny YAML reader |
| 11 | Benchmarking | Worker pools, percentiles, server-side cancellation |
| 12 | Visual flow builder | Graph execution, topological sort, template chaining |
| 13 | AI assist (Groq) | LLM calls, JSON-mode prompts, client-side rate limiting |
| 14 | Auth (signup/login/JWT) | bcrypt, JWT, Express middleware |
| 15 | Cloud sync (Neon Postgres) | Prisma, snapshot-based sync, merge strategies |

---

# Chapter 1 — Sending a Basic HTTP Request

This is the heart of the entire app. **Everything else is built on top of this.** If you understand this chapter, you understand 60% of ReqBench.

## 1.1 What this feature does (user-facing)

The user types a URL like `https://jsonplaceholder.typicode.com/todos/1`, picks `GET`, clicks **Send**, and a moment later sees:

```
Status: 200 OK     Time: 142 ms     Size: 83 B
{
  "userId": 1,
  "id": 1,
  "title": "delectus aut autem",
  "completed": false
}
```

That's it. The entire app is "this, but better." Tabs, history, env vars, collections — all UI sugar around this one operation.

## 1.2 Why is this not trivial? (The hidden problem)

You might think: "Just call `fetch(url)` in the browser. Why do we need a backend at all?"

The answer is **CORS** — Cross-Origin Resource Sharing. Browsers refuse to let JavaScript read responses from a server that doesn't explicitly allow it. So if your page is at `localhost:5173` and you try to `fetch('https://api.github.com/users/anyone')`, you'll get back **nothing readable** — the browser blocks it.

GitHub (and most public APIs) don't trust your laptop, so they don't add a CORS header for `localhost`. Postman and ReqBench solve this the same way: **they send the request from a real server, not from the browser**. Servers don't have CORS restrictions (CORS is a browser-only rule).

So the architecture is:

```
[Browser]                  [Our Express Server]              [Target URL]
   │                                │                              │
   │  "Hey server, please fetch     │                              │
   │   https://api.github.com       │                              │
   │   and tell me what you get"    │                              │
   ├───────────────────────────────►│                              │
   │                                │   "GET https://api.github."  │
   │                                ├─────────────────────────────►│
   │                                │                              │
   │                                │       200 + body             │
   │                                │◄─────────────────────────────┤
   │   "Here's what GitHub said"    │                              │
   │◄───────────────────────────────┤                              │
```

The browser only ever talks to **our** server (same origin, no CORS issue). Our server talks to anyone.

This pattern is called a **proxy**.

## 1.3 The data flow (zoomed in)

When you click **Send** with `GET https://jsonplaceholder.typicode.com/todos/1`:

1. The button's `onClick` calls a function on a Zustand store (`sendRequest`).
2. That function calls `fetch('/api/requests/execute', { method: 'POST', body: '{...}' })` — a POST to *our own* server with the request details inside.
3. The Vite dev server sees `/api/...` and forwards it to `http://localhost:3001` (our Express server).
4. Express receives it, pulls out `{method, url, headers, body}`, then does its own `fetch(url, ...)` to JSONPlaceholder.
5. Express waits for the response, reads the body, and replies to the browser with `{ status, statusText, headers, body, responseTime }`.
6. Back in the browser, the store saves that response into state.
7. React re-renders the `ResponseViewer` component, which now has data to show.

## 1.4 The cast of characters (files involved)

Just six files matter for this feature:

| File | Role |
|---|---|
| `client/vite.config.ts` | Tells the dev server to forward `/api/*` to the backend |
| `client/src/main.tsx` | Boots React |
| `client/src/App.tsx` | The layout — places the URL bar on the left, the response on the right |
| `client/src/store/useRequestStore.ts` | The brain — holds state + has the `sendRequest` function |
| `client/src/components/RequestBuilder.tsx` | The URL bar + Send button (left half) |
| `client/src/components/ResponseViewer.tsx` | The response display (right half) |
| `server/src/index.ts` | The Express server with the `/api/requests/execute` route |

We'll walk through each, in the order data flows.

---

## 1.5 File-by-file walkthrough

### 1.5.1 `client/vite.config.ts` — the dev-time proxy

```ts
// client/vite.config.ts
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
        '/api': env.VITE_SERVER_URL,  // ← THIS LINE
      },
    },
  }
})
```

**What's happening here:**

- `defineConfig` is Vite's standard config function.
- `loadEnv(mode, process.cwd(), '')` reads `.env` files from the project root. That's how `VITE_SERVER_URL` from `client/.env` becomes accessible. Your file contains:
  ```
  VITE_SERVER_URL=http://localhost:3001
  ```
- `server: { port: 5173 }` — the React app runs on port 5173.
- `proxy: { '/api': env.VITE_SERVER_URL }` — **this is the magic.** Any request the browser makes that starts with `/api` (like `/api/requests/execute`) gets silently rewritten by Vite to `http://localhost:3001/api/requests/execute`.

**Why this matters:** In the browser code you'll see `fetch('/api/requests/execute', ...)`. There's no `http://localhost:3001` in the browser code at all. Vite handles that. This means when you later deploy the app, you only have to change the proxy target — your React code doesn't move a single character.

> **Beginner term — "proxy":** a middleman. The browser thinks it's talking to `localhost:5173`. Vite intercepts the `/api/*` calls and forwards them to `localhost:3001`. The browser never knows.

---

### 1.5.2 `client/src/main.tsx` — the bootloader

```ts
// client/src/main.tsx
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

Nothing special here — this is the standard React 19 entry point. It grabs the `<div id="root">` from `client/index.html` and renders the `App` component into it.

`<StrictMode>` is a development-only React feature that double-invokes effects/renders to help catch bugs. It does nothing in production.

---

### 1.5.3 `client/src/App.tsx` — the layout

```tsx
// client/src/App.tsx (relevant parts)
function App() {
  // ... several useState hooks for panels (we'll ignore them for now) ...

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <Navbar /* ... */ />
      {view === 'request' ? (
        <>
          <TabBar />
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="... md:w-1/2 ...">
              <RequestBuilder />          {/* ← LEFT HALF */}
            </div>
            <div className="... md:w-1/2 ...">
              <ResponseViewer />          {/* ← RIGHT HALF */}
            </div>
          </div>
        </>
      ) : (
        <FlowPage />
      )}
      {/* ... other modals ... */}
    </div>
  )
}
```

**The important bits:**

- The screen is split in half. `RequestBuilder` is on the left, `ResponseViewer` is on the right.
- They both read from the **same Zustand store** (`useRequestStore`). They don't pass props to each other. When `RequestBuilder` updates the store, `ResponseViewer` automatically re-renders because Zustand notifies all subscribers.
- This is the **single source of truth** pattern. There's one state object; many components read it.

> **Beginner term — Zustand:** a small state management library. Think of it as a "global object" that React components can read from and write to. Updates to it trigger re-renders in components that read from it.

---

### 1.5.4 `client/src/store/useRequestStore.ts` — the brain

This is the most important file for this feature. We'll look at it in three pieces.

#### Piece 1: What is a tab?

```ts
// client/src/store/useRequestStore.ts (line ~13)
export interface RequestTab {
  id: string
  name: string
  method: HttpMethod                 // 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  params: KeyValuePair[]             // — covered in Chapter 2
  headers: KeyValuePair[]            // — covered in Chapter 2
  body: string                       // — covered in Chapter 2
  authType: 'none' | 'bearer' | 'basic'  // — Chapter 2
  authToken: string                  // — Chapter 2
  loading: boolean                   // true while waiting for the response
  response: ResponseData | null      // the latest response (or nothing yet)
  responseHistory: ResponseSnapshot[]// — Chapter 9 (compare)
  error: string | null               // error message, if any
}
```

For Chapter 1, only these fields matter:
- `method` and `url` — what to send.
- `loading`, `response`, `error` — what state we're in (haven't sent yet / waiting / got a response / something broke).

The other fields exist but we'll fill them in later chapters.

#### Piece 2: The store and `sendRequest`

```ts
// client/src/store/useRequestStore.ts (line ~97)
export const useRequestStore = create<RequestStore>()(
  persist(
    (set, get) => ({
      tabs: [defaultTab],
      activeTabId: defaultTab.id,
      // ... addTab, removeTab, updateTab, etc. — Chapter 3 ...

      sendRequest: async (id) => {
        const tab = get().tabs.find((t) => t.id === id)
        if (!tab || !tab.url.trim()) return
        // ... env var resolution ... (Chapter 6) ...

        // (1) Flip the tab into "loading" state — the UI shows a spinner.
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, loading: true, response: null, error: null } : t,
          ),
        }))

        try {
          // (2) Build the final URL (Chapter 2 explains the helper) and headers.
          const fullUrl = buildUrl(resolvedUrl, resolvedParams)
          const headers = buildHeaders(resolvedHeaders, tab.authType, resolvedAuthToken)

          // (3) Send a POST to our OWN backend, asking it to execute the request.
          const res = await fetch('/api/requests/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: tab.method,
              url: fullUrl,
              headers,
              body: tab.method !== 'GET' && tab.method !== 'DELETE' ? resolvedBody : undefined,
            }),
          })

          // (4) Read the JSON the server sent back.
          const data = await res.json()

          if (data.error) {
            // The server told us something went wrong (bad URL, timeout, etc.)
            set((state) => ({
              tabs: state.tabs.map((t) =>
                t.id === id ? { ...t, loading: false, error: data.error } : t,
              ),
            }))
            // ... save to history ... (Chapter 5)
            return
          }

          // (5) Build the response object the UI will show.
          const responseData: ResponseData = {
            status: data.status,
            statusText: data.statusText,
            headers: data.headers,
            body: data.body,
            responseTime: data.responseTime,
            size: new Blob([data.body]).size,  // ← measure body size in bytes
          }

          // ... snapshot logic for Compare feature — Chapter 9 ...

          // (6) Save the response into the store. The ResponseViewer will re-render.
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === id ? { ...t, loading: false, response: responseData, /*...*/ } : t,
            ),
          }))

          // ... save to history ... (Chapter 5)
        } catch {
          // (7) Network error reaching OUR backend (server is down, etc.)
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.id === id ? { ...t, loading: false, error: 'Failed to reach backend server' } : t,
            ),
          }))
        }
      },
    }),
    // ... persist config — Chapter 4 ...
  ),
)
```

**Walking through it step by step:**

1. **Mark the tab as loading.** Setting `loading: true` causes the Send button to show a spinner and the ResponseViewer to display "loading". Setting `response: null` clears any previous response.
2. **Build the request.** For now ignore `buildUrl` and `buildHeaders` — they're for Chapter 2. With just a URL and no params/headers, `fullUrl === tab.url` and `headers === {}`.
3. **POST to our own server.** Notice the path is `/api/requests/execute`, *not* the target URL. We're asking our Express server to do the actual fetch.
   - `headers: { 'Content-Type': 'application/json' }` tells our server that the body is JSON.
   - `body: JSON.stringify(...)` packages the request details into a string.
   - For GET and DELETE we leave `body: undefined` because HTTP says those methods shouldn't have a body.
4. **Wait for the response and parse it as JSON.** `await res.json()` reads the response body and parses it.
5. **Wrap the result in a clean object.** `new Blob([data.body]).size` is a clever trick to count the byte size of a string — Blob is a built-in browser API, and `.size` gives you the byte count.
6. **Save it into the store.** Setting `loading: false` and `response: responseData` flips the UI. `ResponseViewer` will re-render automatically.
7. **Catch errors.** This `catch` block only fires if the browser couldn't even *reach* our server (e.g. server is offline). Errors from the *target URL* (timeouts, bad responses) come back in step 4 as `data.error`.

> **Beginner term — `async`/`await`:** a way to write code that has to wait for slow things (like network calls) without freezing the browser. `await fetch(...)` says "pause here until the network call finishes, then continue." The function must be marked `async` for `await` to work.

> **Beginner term — `set` and `get`:** Zustand gives the store two helpers. `set(updater)` replaces some state. `get()` reads the current state. Both are needed inside actions like `sendRequest`.

#### Piece 3: Why `set` looks so weird

You'll see this pattern over and over:

```ts
set((state) => ({
  tabs: state.tabs.map((t) =>
    t.id === id ? { ...t, loading: true } : t,
  ),
}))
```

This is **immutable update**. React (and Zustand) decides whether to re-render by comparing references. So instead of mutating the array (`state.tabs[0].loading = true`), we:

1. Build a new `tabs` array with `.map(...)`.
2. For the tab that matches, create a new object `{ ...t, loading: true }` (spread the old fields, then overwrite `loading`).
3. Pass the new state object to `set`.

Result: React sees a new `tabs` reference, knows something changed, and re-renders.

---

### 1.5.5 `client/src/components/RequestBuilder.tsx` — the URL bar

This file is ~300 lines because it also handles params, headers, body, auth, and several modal buttons. For Chapter 1 we only care about the URL bar and the Send button.

```tsx
// client/src/components/RequestBuilder.tsx (simplified)
export default function RequestBuilder() {
  const { tabs, activeTabId, updateTab, sendRequest } = useRequestStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-800">
        {/* Method dropdown */}
        <select
          value={tab.method}
          onChange={(e) => updateTab(tab.id, { method: e.target.value as HttpMethod })}
        >
          {['GET','POST','PUT','PATCH','DELETE'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* URL bar */}
        <input
          type="text"
          placeholder="Enter URL..."
          value={tab.url}
          onChange={(e) => updateTab(tab.id, { url: e.target.value })}
        />

        {/* Send button */}
        <button
          onClick={() => sendRequest(tab.id)}
          disabled={tab.loading}
        >
          {tab.loading ? <Spinner /> : 'Send'}
        </button>
      </div>
      {/* ... Params / Headers / Body / Auth tabs — Chapter 2 ... */}
    </div>
  )
}
```

**How the data flows in and out:**

- **Read:** `const { tabs, activeTabId, ... } = useRequestStore()` subscribes the component to the store. Whenever the store changes, this component re-renders.
- **Find the active tab:** `tab = tabs.find(...)`. For Chapter 1 there's only one tab, so it's just `tabs[0]`.
- **Display the current method/URL:** `<select value={tab.method}>` and `<input value={tab.url}>` are *controlled inputs* — what shows in the box is whatever's in the store.
- **Write on change:** When the user types, `onChange` fires `updateTab(tab.id, { url: e.target.value })`. That mutates the store. The component re-renders with the new value.
- **Send:** `onClick={() => sendRequest(tab.id)}` calls the action we just walked through.

There's also a Ctrl+Enter keyboard shortcut:

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (tab && !tab.loading) sendRequest(tab.id)
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [tab, sendRequest])
```

`useEffect` runs after render. It attaches a global keyboard listener. The `return () => ...` is a *cleanup function* — when the component unmounts (or the effect re-runs because `tab` changed), React removes the old listener. Without that cleanup you'd leak listeners every render.

> **Beginner term — "controlled input":** an input whose displayed value is set by React state, not by the DOM. The opposite is "uncontrolled," where you only read the value when needed. Controlled is the norm in React.

---

### 1.5.6 `client/src/components/ResponseViewer.tsx` — showing the response

```tsx
// client/src/components/ResponseViewer.tsx (simplified)
export default function ResponseViewer() {
  const { tabs, activeTabId } = useRequestStore()
  const tab = tabs.find((t) => t.id === activeTabId)
  const response = tab?.response
  const error = tab?.error
  const loading = tab?.loading

  return (
    <div className="flex flex-col h-full">
      {/* Status / time / size bar */}
      <div className="flex items-center gap-4 p-3 border-b border-gray-800">
        {response ? (
          <>
            <span className={statusColor(response.status)}>
              {response.status} {response.statusText}
            </span>
            <span className="text-green-400">{response.responseTime} ms</span>
            <span>{formatSize(response.size)}</span>
          </>
        ) : (
          <span className="text-gray-400">---</span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3">
        {loading && <Spinner />}
        {!loading && error && <div className="text-red-400">{error}</div>}
        {!loading && !error && !response && (
          <p className="text-gray-500">Send a request to see the response</p>
        )}
        {!loading && !error && response && (
          <pre className="text-sm text-gray-300 font-mono">
            {formatBody(response.body)}
          </pre>
        )}
      </div>
    </div>
  )
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2)   // pretty-print JSON
  } catch {
    return body                                         // not JSON? show as-is
  }
}
```

**The reading pattern is identical** to the RequestBuilder: subscribe to the store, find the active tab, read its `response`/`error`/`loading`, render UI based on which one is set.

**Three visual states:**

1. `loading` → show a spinning circle.
2. `error` → show a red box with the error message.
3. `response` → show the status code, time, size, and body.

**`formatBody` is a nice touch.** Many APIs return JSON, so we try to `JSON.parse` the body and re-stringify it with `null, 2` for indentation. If parsing fails (HTML, plain text, etc.), we show the raw body.

**`statusColor` color-codes status codes:** green for 2xx, yellow for 3xx, red for 4xx/5xx. Tiny detail but very effective UX.

---

### 1.5.7 `server/src/index.ts` — the Express endpoint

Now we're on the backend. The relevant route is `POST /api/requests/execute`:

```ts
// server/src/index.ts (lines ~32–90)
app.post('/api/requests/execute', async (req, res) => {
  const { method, url, headers, body } = req.body

  // (A) Validate inputs
  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }

  try {
    new URL(url)   // throws if the URL is malformed
  } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  // (B) Set up a 30-second timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const start = performance.now()

    // (C) Build the options for the real fetch
    const fetchOptions: RequestInit = {
      method,
      headers: headers || {},
      signal: controller.signal,
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    // (D) Actually fetch the target URL
    const response = await fetch(url, fetchOptions)
    const responseTime = Math.round(performance.now() - start)

    // (E) Convert response headers (an iterable) into a plain object
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    // (F) Read the body as text (works for JSON, HTML, anything)
    const responseBody = await response.text()

    // (G) Send everything back to the browser
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

**Step-by-step:**

- **(A) Validate.** Without a URL or method we can't do anything, so respond with a `400 Bad Request`. `new URL(url)` is a built-in JavaScript constructor that throws if the string isn't a valid URL — a one-line validator.

- **(B) Timeout.** Public APIs can hang. `AbortController` is the modern way to cancel a `fetch`. We create one, set a 30-second timer that calls `controller.abort()`, and pass its `signal` to fetch. If the timer fires before fetch finishes, fetch throws an `AbortError` which we catch below.

- **(C) Build fetch options.** Copy method, headers, and the abort signal. Skip the body for GET/HEAD (HTTP doesn't allow bodies for those).

- **(D) Fetch.** This is the actual outgoing request to the target URL (JSONPlaceholder, GitHub, whatever). `performance.now()` is a high-resolution timestamp; we use it before and after to measure how long the request took.

- **(E) Header conversion.** `response.headers` is a `Headers` object (a built-in browser/Node thing). It's iterable but not a plain object, so we `.forEach` it into a regular `{ key: value }` map that can be JSON-serialized.

- **(F) Read the body as text.** `.text()` always works regardless of content type. If it's JSON, the browser will parse it on the other end (or we'll pretty-print it).

- **(G) Reply.** `res.json(...)` sends a JSON response back to the browser. The browser's `await res.json()` in the store gets exactly this object.

- **Error handling.** Two flavors:
  - `AbortError` → the 30-second timer fired. Reply with `408 Request Timeout`.
  - Anything else (DNS failure, connection refused, etc.) → `502 Bad Gateway`. The actual error message gets passed through so the user can see what happened.

- **`finally` block** → always clear the timer, even if everything worked, to avoid leaks.

> **Beginner term — `AbortController`:** a way to cancel an in-flight `fetch`. You create one, hand its `signal` to fetch, and call `.abort()` whenever you want to cancel.

> **Beginner term — HTTP status codes used here:** `400` = the client sent bad data. `408` = took too long. `502` = the upstream service (the URL the user gave us) didn't respond properly.

---

## 1.6 What happens when you click Send (the complete trace)

Putting it all together. The user types `https://jsonplaceholder.typicode.com/todos/1`, leaves method on `GET`, clicks **Send**.

| # | Where | What happens |
|---|---|---|
| 1 | RequestBuilder.tsx | `onClick` fires → `sendRequest(tab.id)` |
| 2 | useRequestStore.ts | `set` flips the tab to `{ loading: true, response: null, error: null }` |
| 3 | ResponseViewer.tsx | Re-renders, shows a spinner |
| 4 | useRequestStore.ts | `fetch('/api/requests/execute', { method: 'POST', body: '{"method":"GET","url":"https://...","headers":{}}' })` |
| 5 | Vite | Sees `/api/...`, forwards to `http://localhost:3001/api/requests/execute` |
| 6 | Express (index.ts) | Route handler runs. Validates URL. Starts the 30 s timer. |
| 7 | Express | `await fetch('https://jsonplaceholder.typicode.com/todos/1', { method: 'GET', headers: {}, signal })` |
| 8 | JSONPlaceholder | Returns `200 OK` with a JSON body |
| 9 | Express | Records the elapsed time, converts headers to a plain object, reads the body, sends `{status, statusText, headers, body, responseTime}` back |
| 10 | useRequestStore.ts | `await res.json()` parses the reply. Computes byte size. `set` updates the tab with `{ loading: false, response: {...} }` |
| 11 | ResponseViewer.tsx | Re-renders. Shows `200 OK · 142 ms · 83 B` and the pretty-printed JSON body |

Total: ~150 ms typically, depending on the target URL.

---

## 1.7 Things to know / gotchas

- **The backend MUST be running.** If `npm run dev` isn't going in the `server/` folder, every Send will fail with "Failed to reach backend server." That's the `catch` block in `sendRequest`.
- **Both halves read the same store.** RequestBuilder writes (`updateTab`, `sendRequest`); ResponseViewer reads (`tab.response`). They never talk to each other directly. The store is the only shared memory.
- **The 30-second timeout is enforced on the server, not the browser.** If the target API is slow, you'll get a `408` after 30 seconds, not a hung tab.
- **Status codes ≥ 400 are not errors here.** A `404 Not Found` from the target API is a *successful* response from our server's perspective — we got back what the target said. The `error` field is only used when our server couldn't reach the target at all (timeout, DNS, etc.) or when the user typed an invalid URL.
- **Body size is calculated in the browser, not the server.** `new Blob([data.body]).size` is a browser-only API. The server doesn't compute it.
- **There's a real bug in `.env` naming.** `server/.env.example` says `DB_URL` but `server/src/lib/prisma.ts` reads `process.env.DATABASE_URL`. This doesn't affect Chapter 1 (the execute route doesn't touch the DB), but it'll bite you in Chapter 15. Worth knowing now.

---

## 1.8 Try it yourself — small experiments

These will help cement the mental model. Open DevTools (F12) in the browser before doing them.

**Experiment 1 — see the proxy in action.**
1. Open the Network tab in DevTools.
2. Send a request to any URL.
3. You'll see *two* network calls:
   - One from your browser to `/api/requests/execute` (this is the one Vite proxies to your Express server).
   - You'll NOT see the call to JSONPlaceholder — that one happens server-to-server, invisible to the browser.

**Experiment 2 — stop the backend and Send.**
1. In your `server/` terminal, press Ctrl+C to stop the Express server.
2. Click Send in the browser.
3. You'll see the red "Failed to reach backend server" error.
4. Restart with `npm run dev` and try again.

**Experiment 3 — break the URL on purpose.**
1. Type `not-a-real-url` in the URL bar and Send.
2. You'll get `400 Invalid URL`. This comes from `new URL(url)` throwing in the Express handler.

**Experiment 4 — slow target.**
1. Send a request to `https://httpbin.org/delay/5` (waits 5 seconds before responding).
2. Watch the spinner spin, the response come back showing ~5000 ms.
3. Try `https://httpbin.org/delay/35` and you'll get the `408` timeout after 30 seconds.

---

## 1.9 What you should walk away knowing

After reading this chapter and the actual code:

- [ ] Why a backend is needed (CORS).
- [ ] What the Vite proxy does and why the browser code uses `/api/...`.
- [ ] How `useRequestStore` works: state + actions, `set`/`get`, immutable updates.
- [ ] How RequestBuilder and ResponseViewer share state through the store without talking to each other.
- [ ] What happens inside the `sendRequest` function, step by step.
- [ ] What the Express `/api/requests/execute` route does, and how AbortController gives us a timeout.
- [ ] The difference between "the user's request failed" (404 from target) and "we couldn't even reach the target" (timeout / network error).

When you've reviewed the code and feel solid on all of these, ask me for **Chapter 2 — Adding params, headers, body, and auth**.

---

# Chapters 2–15 (coming when you're ready)

Each will follow the same format as Chapter 1:
1. What it does (user-facing)
2. Why it's not trivial
3. Data flow diagram
4. Files involved
5. File-by-file walkthrough with code
6. Complete execution trace
7. Gotchas
8. Try-it-yourself experiments
9. Checklist of what you should know

Just say **"chapter 2"** (or whichever) when you're ready.
