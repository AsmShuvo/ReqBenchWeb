# ReqBench — Code Walkthrough (বাংলায়)

প্রতিটি feature কিভাবে কাজ করে — file-by-file, code-by-code। তুমি vibe-coded করেছ, এখন বুঝতে যাচ্ছ। এই guide-এ আমরা একটা একটা feature ধরব। প্রথম feature থেকে শুরু।

---

## Feature List (কোন order-এ পড়বে)

| # | Feature | File count |
|---|---|---|
| **1** | **HTTP Request পাঠানো (Tabs সহ)** ← *এই chapter* | 7 files |
| 2 | Collections (Save / Load) | 3 files |
| 3 | Benchmark with P50/P90/P99 | 2 files |
| 4 | Visual Flow Editor | 5 files |
| 5 | AI Assist (Groq) | 3 files |
| 6 | JWT Auth + Cloud Sync | 5 files |

> পরের chapter চাইলে শুধু বলো **"chapter 2"**, **"chapter 3"** etc.

---

# Chapter 1 — HTTP Request পাঠানো (Tabs সহ)

এটাই পুরো app-এর হৃদয়। বাকি সব feature এর উপরে build করা।

## 1.1 এই feature কী করে?

User একটা URL টাইপ করে (যেমন `https://jsonplaceholder.typicode.com/todos/1`), method select করে (`GET`/`POST` etc.), **Send** button-এ click করে। কিছুক্ষণ পর response দেখায়:

```
Status: 200 OK     Time: 142 ms     Size: 83 B
{
  "userId": 1,
  "id": 1,
  "title": "delectus aut autem",
  "completed": false
}
```

User চাইলে **একাধিক tab** খুলতে পারে — প্রতিটা tab-এ আলাদা request, আলাদা response।

---

## 1.2 কেন এটা সহজ না? (Browser-এর সমস্যা)

তুমি ভাবতে পার: "Browser-এর JavaScript-এই `fetch(url)` call করলেই তো হয়। Backend লাগে কেন?"

উত্তর: **CORS** (Cross-Origin Resource Sharing)।

Browser-এর একটা security rule আছে — যদি তোমার page চলে `localhost:5173`-তে, আর তুমি `https://api.github.com` থেকে data fetch করতে চাও, GitHub-এর server বলতে হবে "হ্যাঁ, এই origin allowed।" GitHub সাধারণত `localhost`-কে allow করে না। তাই browser response **block করে দেয়** — তুমি কিছুই পাবে না।

**সমাধান:** Browser request পাঠাবে **আমাদের নিজের** Express server-এ (same origin, no CORS issue)। Express server (যার CORS rule নেই) target URL fetch করবে, response browser-এ পাঠাবে।

```
[Browser]                  [আমাদের Express server]            [Target URL]
   │                                │                              │
   │  "Server, এই URL-টা fetch     │                              │
   │   করে বলো কী response এল"     │                              │
   ├───────────────────────────────►│                              │
   │                                │   "GET https://api.github."  │
   │                                ├─────────────────────────────►│
   │                                │                              │
   │                                │       200 + body             │
   │                                │◄─────────────────────────────┤
   │   "এই নাও GitHub-এর response" │                              │
   │◄───────────────────────────────┤                              │
```

এই pattern-কে বলে **proxy** (মাঝামাঝি দালাল)। Browser শুধু আমাদের server-এর সাথে কথা বলে, আমাদের server পুরো internet-এর সাথে কথা বলে।

---

## 1.3 কোন কোন file লাগবে?

এই একটা feature-এর জন্য **৭টা file** কাজ করে:

| File | কাজ |
|---|---|
| `client/vite.config.ts` | Vite-কে বলে `/api/*` request গুলো backend-এ পাঠাতে |
| `client/src/main.tsx` | React boot করে |
| `client/src/App.tsx` | Layout — কোথায় কী থাকবে |
| `client/src/store/useRequestStore.ts` | **মূল brain** — state রাখে আর `send()` function দেয় |
| `client/src/components/TabBar.tsx` | উপরের tab গুলো |
| `client/src/components/RequestBuilder.tsx` | URL bar + Send button (বাঁ দিক) |
| `client/src/components/ResponseViewer.tsx` | Response দেখানো (ডান দিক) |
| `server/src/index.ts` | Backend-এর `/api/requests/execute` route |

Data flow-এর order-এ একটা একটা করে দেখব।

---

## 1.4 File 1: `client/vite.config.ts` — Proxy setup

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
        '/api': env.VITE_SERVER_URL,   // ← এই লাইনটাই magic
      },
    },
  }
})
```

**কী হচ্ছে এখানে?**

- React app চলে `localhost:5173`-এ।
- Browser যখন `/api/requests/execute`-এ POST করে, Vite মাঝখানে interrupt করে।
- Vite request-টা `http://localhost:3001/api/requests/execute`-এ forward করে দেয় (যেখানে Express চলছে)।
- Browser-এর code-এ কোথাও `http://localhost:3001` লিখতে হয় না — Vite handle করে।

`VITE_SERVER_URL` value আসে `client/.env` file থেকে:
```
VITE_SERVER_URL=http://localhost:3001
```

> **নতুন শব্দ — Proxy:** মাঝখানে দাঁড়িয়ে থাকা middleman। Browser মনে করে সে `localhost:5173`-এর সাথেই কথা বলছে, কিন্তু আসলে Vite পেছনে চুপিচুপি `localhost:3001`-এ forward করছে।

---

## 1.5 File 2: `client/src/main.tsx` — React boot

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

`index.html` file-এ একটা `<div id="root">` আছে। এই code সেটার ভেতরে `<App />` component render করে দেয়। `StrictMode` শুধু development-এ helper — bug detect করতে সাহায্য করে।

কিছু complex না — Vite project-এর standard entry point।

---

## 1.6 File 3: `client/src/App.tsx` — Layout

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

**গুরুত্বপূর্ণ অংশ:**

- **Layout:** উপরে `Navbar`, তারপর `TabBar`, তারপর screen-টা দুই ভাগ — বাঁ দিকে `RequestBuilder`, ডান দিকে `ResponseViewer`।
- **`view` state:** `'request'` হলে এই split view, `'flow'` হলে FlowPage দেখায় (Chapter 4)।
- **`useEffect`:** App load হওয়ার সাথে সাথে sync setup হয় (login করা থাকলে cloud data pull করে)। এটা Chapter 6-এ explain করব।
- **Props দিয়ে কেউ কারো সাথে data শেয়ার করে না।** Tabs / response — সবকিছু **Zustand store**-এ থাকে। সব component সেখান থেকেই পড়ে।

> **নতুন শব্দ — Zustand:** ছোট state management library। ভাবো "global object" যেটাতে অনেক component-একসাথে read/write করতে পারে। কোনো একটা component value change করলে যে component গুলো ওই value পড়ছিল, সব auto re-render হয়।

---

## 1.7 File 4: `client/src/store/useRequestStore.ts` — মূল brain

এটাই সবচেয়ে important file। ভেঙে ভেঙে দেখি।

### 1.7.1 Type definitions (একটা tab দেখতে কেমন?)

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface KeyValuePair {
  key: string
  value: string
  enabled: boolean    // checkbox: header use হবে কি না
}

export interface ResponseData {
  status: number              // 200, 404 etc.
  statusText: string          // "OK", "Not Found"
  headers: Record<string, string>
  body: string                // raw response body as text
  responseTime: number        // milliseconds
  size: number                // bytes
}

export interface RequestTab {
  id: string                   // unique ID per tab
  name: string                 // tab-এ যা দেখায়
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  body: string
  loading: boolean             // request চলছে কি না (spinner দেখাবে)
  response: ResponseData | null
  error: string | null
}
```

প্রতিটা tab-এর নিজস্ব data আছে — নিজের URL, নিজের response, নিজের loading state। তাই tab change করলে সেই tab-এর response দেখায়।

### 1.7.2 Store-এর shape

```ts
interface RequestState {
  tabs: RequestTab[]          // সব open tabs
  activeTabId: string         // এই মুহূর্তে কোনটা active

  addTab: () => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<RequestTab>) => void
  loadRequest: (r: {...}) => void
  send: (id: string) => Promise<void>
}
```

**State** = `tabs` array + কোন tab active।
**Actions** = state কে modify করার functions।

### 1.7.3 Helper functions

```ts
function createBlankTab(): RequestTab {
  return {
    id: crypto.randomUUID(),     // random unique ID
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
```

- **`createBlankTab`** — একটা নতুন খালি tab বানায়।
- **`deriveName`** — URL দেখে tab-এর জন্য একটা ছোট নাম বানায় (যেমন `api.github.com/user`)।
- **`buildHeaders`** — KeyValuePair array থেকে enabled গুলো নিয়ে `{Key: Value}` object বানায় (যেটা fetch-এ পাঠানো যায়)।

### 1.7.4 Store create করা

```ts
const initialTab = createBlankTab()

export const useRequestStore = create<RequestState>()(
  persist(
    (set, get) => ({
      tabs: [initialTab],
      activeTabId: initialTab.id,

      // ... actions here
    }),
    {
      name: 'reqbench-tabs',          // localStorage key
      partialize: (s) => ({
        // page reload হলে loading/error/response save করি না
        // শুধু form fields save করি
        tabs: s.tabs.map((t) => ({ ...t, loading: false, error: null, response: null })),
        activeTabId: s.activeTabId,
      }),
    },
  ),
)
```

- **`persist` middleware:** Zustand-এর built-in feature। যে data save করবে তা automatically `localStorage`-এ চলে যায়। Page reload করলেও tab গুলো থাকে।
- **`partialize`:** কোন কোন field save হবে সেটা control করে। আমরা `loading`, `error`, `response` save করি না কারণ ওগুলো request চলার সময়কার temporary state — reload-এর পর পুরোনো spinner দেখানোর মানে নেই।

### 1.7.5 Actions (state change করার function)

```ts
addTab: () => {
  const tab = createBlankTab()
  set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
},
```

নতুন tab বানিয়ে list-এ যোগ করো, সেটাকেই active বানাও।

```ts
removeTab: (id) =>
  set((s) => {
    if (s.tabs.length === 1) return s    // অন্তত একটা tab রাখতে হবে
    const idx = s.tabs.findIndex((t) => t.id === id)
    const filtered = s.tabs.filter((t) => t.id !== id)
    const activeTabId = s.activeTabId === id
      ? filtered[Math.min(idx, filtered.length - 1)].id
      : s.activeTabId
    return { tabs: filtered, activeTabId }
  }),
```

Tab delete হলে — যদি সেটাই active ছিল, তাহলে next tab-কে active বানাও।

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

কোনো একটা tab-এর field গুলো update করে। যদি URL change হয়, tab-এর name-ও update করে দেয়।

### 1.7.6 সবচেয়ে important: `send` function

```ts
send: async (id) => {
  const tab = get().tabs.find((t) => t.id === id)
  if (!tab || !tab.url.trim()) return

  // (1) Loading শুরু — UI spinner দেখাবে
  get().updateTab(id, { loading: true, response: null, error: null })

  try {
    // (2) আমাদের নিজের backend-এ POST করি
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

    // (3) Backend-এর কাছে error হলে দেখাও
    if (data.error) {
      get().updateTab(id, { loading: false, error: data.error })
      return
    }

    // (4) Success — response save করি
    get().updateTab(id, {
      loading: false,
      response: {
        status: data.status,
        statusText: data.statusText,
        headers: data.headers,
        body: data.body,
        responseTime: data.responseTime,
        size: new Blob([data.body]).size,    // byte size মাপি
      },
    })
  } catch {
    // (5) Network error (backend reach করা যাচ্ছে না)
    get().updateTab(id, { loading: false, error: 'Failed to reach backend server' })
  }
},
```

**Step-by-step ব্যাখ্যা:**

1. **Loading flag on করি।** এর ফলে UI-তে Send button-এ spinner ঘুরে।
2. **আমাদের নিজের backend-এ POST করি** `/api/requests/execute`-এ। লক্ষ্য করো — এখানে target URL-এ direct call করছি না, আমাদের server-কে বলছি "তুমি call করো"। GET / DELETE method-এ body পাঠাই না (HTTP-এর rule)।
3. **Backend যদি error দেয়** (যেমন invalid URL, timeout) — error message UI-তে দেখাই।
4. **Success হলে** — response data store করি। `new Blob([body]).size` দিয়ে byte size মাপি (এটা browser-এর built-in trick)।
5. **`catch` block** শুধু তখনই trigger হবে যদি আমাদের backend-ই reach করা না যায় (server বন্ধ, network down etc.)। Target API-র error backend-এ handle হয়, এখানে না।

> **নতুন শব্দ — `async`/`await`:** Network call slow। `await fetch(...)` মানে "এখানে wait করো যতক্ষণ না response আসে, তারপর continue করো"। Function-এ `async` keyword থাকতে হবে `await` use করার জন্য।

> **নতুন শব্দ — `set` / `get`:** Zustand-এর দুটো helper। `set(updater)` state update করে। `get()` current state পড়ে। দুটোই action-এর ভেতরে access করা যায়।

---

## 1.8 File 5: `client/src/components/TabBar.tsx` — Tab UI

```tsx
import { useRequestStore } from '../store/useRequestStore'

const methodColor: Record<string, string> = {
  GET: 'text-green-400', POST: 'text-yellow-400', PUT: 'text-blue-400',
  PATCH: 'text-purple-400', DELETE: 'text-red-400',
}

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, addTab, removeTab } = useRequestStore()

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`group h-full px-3 text-sm flex items-center gap-1.5 ... cursor-pointer ${
            activeTabId === tab.id
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <span className={`text-xs font-semibold ${methodColor[tab.method]}`}>
            {tab.method}
          </span>
          <span className="truncate max-w-36">{tab.name}</span>
          {tabs.length > 1 && (
            <span
              onClick={(e) => { e.stopPropagation(); removeTab(tab.id) }}
              className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-1"
            >
              ×
            </span>
          )}
        </div>
      ))}
      <button onClick={addTab} className="h-full px-3 text-gray-500 hover:text-white text-lg">
        +
      </button>
    </div>
  )
}
```

**গুরুত্বপূর্ণ বিষয়:**

- **`useRequestStore()`** — store-এ subscribe করে। Store change হলেই component re-render হয়।
- **`tabs.map(...)`** — প্রতিটা tab-এর জন্য একটা box রেন্ডার করে।
- **Active tab differently styled** — background dark, text white।
- **`stopPropagation()`** — close button click করলে parent div-এর `onClick` (যেটা tab activate করত) trigger হয় না।
- **`+` button** নতুন tab বানায়।

---

## 1.9 File 6: `client/src/components/RequestBuilder.tsx` — URL bar

Pure code-এর কিছু part দেখি (পুরো file-এ আরো ছোটখাটো জিনিস আছে যেমন Save button, Body tab — সেগুলো অন্য feature-এর):

### 1.9.1 Active tab কিভাবে পড়ি

```tsx
export default function RequestBuilder() {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const updateTab = useRequestStore((s) => s.updateTab)
  const send = useRequestStore((s) => s.send)
  const tab = tabs.find((t) => t.id === activeTabId)!
  // ...
}
```

Store থেকে শুধু যা দরকার সেগুলো নিই, তারপর `find` দিয়ে active tab-টা বের করি। `tab` এ এই মুহূর্তে যে tab user দেখছে তার সব data আছে।

### 1.9.2 URL bar UI

```tsx
<div className="flex items-center gap-2 p-3 border-b border-gray-800">
  {/* Method dropdown */}
  <select
    value={tab.method}
    onChange={(e) => updateTab(tab.id, { method: e.target.value as HttpMethod })}
    className={`bg-gray-800 ... ${methodColor[tab.method]}`}
  >
    {methods.map((m) => <option key={m} value={m}>{m}</option>)}
  </select>

  {/* URL input */}
  <input
    type="text"
    placeholder="Enter URL..."
    value={tab.url}
    onChange={(e) => updateTab(tab.id, { url: e.target.value })}
    className="flex-1 bg-gray-800 ..."
  />

  {/* Send button */}
  <button
    onClick={() => void send(tab.id)}
    disabled={tab.loading}
    className="bg-blue-600 hover:bg-blue-500 ..."
  >
    {tab.loading ? <Spinner /> : 'Send'}
  </button>
</div>
```

**গুরুত্বপূর্ণ pattern — Controlled input:**

- Input-এর `value` আসে store থেকে (`tab.url`)।
- User type করলে `onChange` fire হয় → `updateTab(tab.id, { url: e.target.value })` call হয় → store update হয় → component re-render হয় → input-এ নতুন value দেখায়।

Browser-এর DOM-এ data রাখি না। সব **single source of truth** — store।

### 1.9.3 Ctrl+Enter keyboard shortcut

```tsx
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

`useEffect`-এ keyboard listener attach করি। `return () => ...` cleanup function — component unmount হলে listener remove হয়। এটা না করলে memory leak হবে।

---

## 1.10 File 7: `client/src/components/ResponseViewer.tsx` — Response দেখানো

```tsx
export default function ResponseViewer() {
  const tabs = useRequestStore((s) => s.tabs)
  const activeTabId = useRequestStore((s) => s.activeTabId)
  const tab = tabs.find((t) => t.id === activeTabId)!
  const { response, error, loading } = tab
  // ...
}
```

RequestBuilder-এর মতোই active tab পড়ে। কিন্তু এখানে শুধু **read** করি — write করি না।

```tsx
{loading && <Spinner />}

{!loading && error && (
  <div className="text-red-400">{error}</div>
)}

{!loading && !error && !response && (
  <p className="text-gray-500">Send a request to see the response</p>
)}

{!loading && !error && response && (
  <pre className="text-sm text-gray-300 font-mono">
    {formatBody(response.body)}
  </pre>
)}
```

চারটা possible state:
1. **Loading** — spinner ঘুরছে।
2. **Error** — red box-এ error message।
3. **No response yet** — "Send a request to see..." message।
4. **Response আছে** — body দেখাও।

```tsx
function formatBody(body: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2) }
  catch { return body }
}
```

JSON হলে pretty-print করি (২ space indent), না হলে raw string দেখাই।

```tsx
function statusColor(status: number): string {
  if (status < 300) return 'text-green-400'    // 2xx success
  if (status < 400) return 'text-yellow-400'   // 3xx redirect
  return 'text-red-400'                         // 4xx/5xx error
}
```

Status code-এর color — সবুজ মানে ভালো, লাল মানে error।

---

## 1.11 File 8: `server/src/index.ts` — Backend route

```ts
app.post('/api/requests/execute', async (req, res) => {
  const { method, url, headers, body } = req.body

  // (A) Validate
  if (!url || !method) {
    res.status(400).json({ error: 'method and url are required' })
    return
  }
  try { new URL(url) } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  // (B) 30 second timeout setup
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const start = performance.now()

    // (C) Target URL-এ আসল request পাঠাই
    const response = await fetch(url, {
      method,
      headers: headers || {},
      body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
      signal: controller.signal,
    })
    const responseTime = Math.round(performance.now() - start)

    // (D) Response headers convert করি
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => { responseHeaders[key] = value })

    // (E) Body text হিসেবে পড়ি
    const responseBody = await response.text()

    // (F) Browser-কে সব ফেরত পাঠাই
    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      responseTime,
    })
  } catch (err) {
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

- **(A) Validate:** URL আর method আছে কিনা check। `new URL(url)` invalid URL হলে throw করে — সেটা catch করে 400 দিই।

- **(B) 30 second timeout:** কিছু API hang করে থাকতে পারে। `AbortController` দিয়ে modern browsers/Node-এ fetch cancel করা যায়। 30 second পর timer fire হলে fetch automatically abort হয়।

- **(C) আসল fetch:** এটাই সেই moment যখন আমাদের server target URL-এ call করে। `performance.now()` দিয়ে সময় মাপি — start time আর end time-এর difference = response time।

- **(D) Headers conversion:** `response.headers` একটা special `Headers` object, plain `{}` না। তাই `.forEach` দিয়ে regular object বানাই — যাতে JSON-এ serialize করা যায়।

- **(E) Body text হিসেবে পড়ি:** `.text()` যেকোনো content type-এর জন্য কাজ করে (JSON, HTML, XML, plain text)। JSON হলে browser-এই pretty-print করব।

- **(F) Response পাঠাই:** Browser যা চাইছিল সব এক object-এ।

- **Error handling:**
  - `AbortError` = timeout হয়েছিল → 408 ("Request Timeout") status।
  - অন্য error (DNS fail, connection refused) → 502 ("Bad Gateway")।

- **`finally`:** Success হোক বা fail, timer clear করা — না হলে memory leak।

> **নতুন শব্দ — `AbortController`:** চলমান কোনো fetch cancel করার আধুনিক way। তুমি একটা controller বানাও, তার `signal` fetch-এ দাও, তারপর যেকোনো সময় `.abort()` call করলে fetch থেমে যায়।

> **HTTP status codes ব্যবহৃত:**
> - `400` = client খারাপ data পাঠিয়েছে
> - `408` = অনেক বেশি সময় লেগেছে
> - `502` = upstream server (যে URL user দিয়েছিল) response দেয়নি

---

## 1.12 সম্পূর্ণ flow — Send button click করলে কী হয়

User টাইপ করে `https://jsonplaceholder.typicode.com/todos/1`, **Send** click করে। এই ১১টা step হয়:

| # | কোথায় | কী হচ্ছে |
|---|---|---|
| 1 | `RequestBuilder.tsx` | Button-এর `onClick` → `send(tab.id)` |
| 2 | `useRequestStore.ts` | `updateTab` করে tab-কে `loading: true` করি |
| 3 | `ResponseViewer.tsx` | Re-render হয়, spinner দেখায় |
| 4 | `useRequestStore.ts` | `fetch('/api/requests/execute', { method: 'POST', body: '{method,url,headers,body}' })` |
| 5 | Vite | `/api/...` দেখে `http://localhost:3001`-এ forward করে |
| 6 | `server/src/index.ts` | URL validate করে, 30s timer set করে |
| 7 | Express | `fetch('https://jsonplaceholder.typicode.com/todos/1', ...)` — target-এ আসল call |
| 8 | JSONPlaceholder | `200 OK` + JSON body return করে |
| 9 | Express | Time মাপে, headers convert করে, body read করে, browser-এ পাঠায় |
| 10 | `useRequestStore.ts` | Response পেয়ে byte size মাপে, tab-এ save করে |
| 11 | `ResponseViewer.tsx` | Re-render হয়, status + time + body দেখায় |

মোট সময়: সাধারণত ~150ms (target API-র উপর নির্ভর)।

---

## 1.13 মনে রাখার মতো কিছু কথা

- **Backend না চললে কিচ্ছু কাজ করবে না।** `server/` folder-এ `npm run dev` চালু আছে কিনা check করো। না থাকলে browser "Failed to reach backend server" দেখাবে।

- **Browser → Vite → Express → target URL** — চারটা ধাপ আছে। যেকোনো একটা break হলে error দেখায়।

- **Browser-এর Network tab-এ শুধু `/api/requests/execute` দেখবে।** Target URL-এর call দেখবে না — সেটা server-to-server, browser invisible।

- **Status >= 400 কে "error" বলে না এই app-এ।** 404 means "target বলেছে not found" — সেটাও একটা valid response। Error তখন যখন আমাদের নিজের server-ই reach করা যায়নি বা URL invalid ছিল।

- **`partialize` যা save করে আর যা করে না:** Reload-এর পর tab-গুলো থাকে কিন্তু response থাকে না — কারণ response cache করার মানে নেই। আবার Send চাপলে fresh data আসবে।

---

## 1.14 নিজে test করো (DevTools খুলে)

**Test 1 — Proxy দেখো:**
1. F12 চেপে Network tab খোলো।
2. একটা request পাঠাও।
3. দেখবে **শুধু** `/api/requests/execute` POST-টা দেখা যায়। JSONPlaceholder-এ যাওয়া আসল call invisible (server-to-server)।

**Test 2 — Backend বন্ধ করে দেখো:**
1. Server terminal-এ Ctrl+C চেপে stop করো।
2. Browser-এ Send click করো।
3. লাল box-এ "Failed to reach backend server" আসবে।
4. `npm run dev` দিয়ে আবার চালু করো।

**Test 3 — Invalid URL:**
1. URL bar-এ `not-a-real-url` লেখো।
2. Send করো।
3. `400 Invalid URL` error আসবে — backend-এর `new URL(url)` throw করেছে।

**Test 4 — Slow target:**
1. URL: `https://httpbin.org/delay/5` (এটা ৫ second wait করে তারপর response দেয়)।
2. Spinner ৫ second ঘুরবে।
3. Response time ~5000ms দেখাবে।
4. `https://httpbin.org/delay/35` চেষ্টা করো — 30 second পর timeout error আসবে।

**Test 5 — Tabs:**
1. Top-এ `+` button চাপো — নতুন tab আসবে।
2. দুই tab-এ ভিন্ন URL দাও।
3. দুটোতে Send করো।
4. Tab change করলে দেখবে প্রতিটার নিজের response আছে।

---

## 1.15 এই chapter পড়ার পর তুমি জানবে

- [ ] CORS কী এবং backend কেন লাগে।
- [ ] Vite proxy কী করে।
- [ ] Zustand store কিভাবে কাজ করে (state + actions, `set`/`get`)।
- [ ] Persist middleware কিভাবে localStorage-এ save করে।
- [ ] Tabs কিভাবে multi-state manage করে (একটা store-এ array of tabs)।
- [ ] Controlled input pattern।
- [ ] `async`/`await` কিভাবে network call wait করে।
- [ ] AbortController কী এবং কেন timeout-এর জন্য use হয়।
- [ ] "User-এর request fail হলো" আর "আমরা target-ই reach করতে পারলাম না" — দুটোর difference।

সব tick হলে — code পড়ে confident হও — তারপর **"chapter 2"** বলো।

---

## পরবর্তী Chapters (যখন তুমি ready)

| # | Feature | কী শিখবে |
|---|---|---|
| 2 | Collections (Save / Load) | Local-first persistence, modals |
| 3 | Concurrent Benchmark (P50/P90/P99) | Worker pool pattern, percentile math, server-side cancellation |
| 4 | Visual Flow Editor | Graph execution, topological sort, template chaining |
| 5 | AI Assist (Groq) | LLM call, JSON mode prompts |
| 6 | JWT Auth + Cloud Sync | bcrypt, JWT middleware, snapshot sync |

শুধু **"chapter X"** বলো।
