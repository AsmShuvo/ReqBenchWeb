# Visual Request-Flow Editor — Quick Notes

## কী এটা (What it is)

**Visual Request-Flow Editor** হলো একটা **drag-and-drop canvas** যেখানে তুমি একাধিক HTTP request-কে একটার পর একটা চালাতে পার, আর আগের request-এর output পরের request-এ pipe করতে পার।

ভাবো — Postman-এ login API call করে token পেলে, সেই token নিয়ে next API-তে header দিতে হয়। Manual করতে হয়। আমাদের Flow Editor-এ:

1. Login node বানাও।
2. Profile node বানাও — header-এ লিখো `Authorization: Bearer {{login.body.token}}`।
3. দুটোকে একটা edge দিয়ে connect করো।
4. **Run Flow** click করো।

System নিজে from login-এ token নিয়ে profile-এ inject করে দেয়।

### তিনটা component:

- **Request node** — method, URL, body। অন্য node-এর output reference করতে পারে।
- **Delay node** — N millisecond wait করে।
- **Edges** — কোন node-এর পর কোন node চলবে সেটা বলে।

---

## কেন (Why)

Postman-এ chained requests করতে হলে **JavaScript pre-request scripts** লিখতে হয়:

```js
pm.environment.set("token", pm.response.json().token);
```

এটা:
- নতুন developer-দের জন্য confusing।
- Code review করা কঠিন।
- Share করা কঠিন।
- Visible flow নেই — কে কাকে call করছে বোঝা যায় না।

**Flow Editor সমাধান:**
- Pipeline data-as-graph, কোনো hidden script না।
- Visual — কোন request কোথায় যাচ্ছে দেখা যায়।
- Templates simple (`{{nodeLabel.body.field}}`)।
- Share করতে শুধু JSON export — কোনো script execution risk নেই।

Real-world use case:
- **Authentication flows:** Login → Use token in subsequent calls।
- **Data pipelines:** GET items → POST each item somewhere else।
- **Multi-step setup:** Create user → Create resource for that user → Verify।

---

## কীভাবে কাজ করে (How)

তিনটা core piece:

### 1. **React Flow** — canvas library

`@xyflow/react` library use করি। এটা node + edge drag-drop, zoom, pan সব handle করে। আমরা শুধু node types দিই (`RequestNode`, `DelayNode`)। React Flow তাদের render করে।

### 2. **Topological Sort** — execution order

User যদি node গুলোকে random order-এ canvas-এ রাখে (right-to-left, scattered) তবু আমরা edges দেখে ঠিক order বের করি।

```ts
function topoSort(nodes, edges): FlowNode[] {
  // in-degree count করি
  // যাদের in-degree = 0, queue-এ যোগ করি
  // queue থেকে নিয়ে, তার outgoing edges process করি
  // cycle থাকলে output.length < nodes.length হবে
}
```

এটা classic **Kahn's algorithm**। Edge `A → B` মানে "A আগে চলবে, তারপর B"।

Cycle থাকলে throw করি (`A → B → A` মানে infinite loop)।

### 3. **Template Substitution** — node-to-node data piping

Template syntax: `{{nodeLabel.body.path.to.field}}`

```ts
const TEMPLATE_RE = /\{\{([^{}]+?)\}\}/g

function resolveTemplate(input, outputs) {
  return input.replace(TEMPLATE_RE, (match, expr) => {
    const [label, ...path] = expr.trim().split('.')
    const out = outputs.get(label)
    const val = walkPath(out, path)
    return formatValue(val)
  })
}
```

প্রতিটা node finish হলে তার output `outputs` Map-এ store হয় — **label দিয়ে keyed**, ID না। তাই template-এ human-readable name use করা যায়।

`walkPath` dot-separated path follow করে nested object-এ:
```
{{login.body.token}}
  → outputs.get("login").body.token
```

### Execution loop

```ts
const outputs = new Map<string, NodeOutput>()

for (const node of topoSortedNodes) {
  callbacks.onNodeStart(node.id)        // UI-তে blue (running)
  try {
    const output = await executeNode(node, outputs)
    outputs.set(node.data.label, output) // label দিয়ে save
    callbacks.onNodeSuccess(node.id, output) // UI-তে green
  } catch (err) {
    callbacks.onNodeError(node.id, err.message) // UI-তে red
    throw err  // flow halt
  }
}
```

- Sequential execution (parallel না — কারণ next node আগের output-এ depend করতে পারে)।
- Each node-এর state (idle/running/success/error) UI-তে color-coded।
- কেউ fail করলে flow পুরো stop হয়।

### Request node execution

```ts
async function executeRequest(data, outputs) {
  const url = resolveTemplate(data.url, outputs)
  const body = resolveTemplate(data.body, outputs)
  
  // Reach Backend proxy (Part 1-এর মতো)
  const res = await fetch('/api/requests/execute', {...})
  const json = await res.json()
  
  // Body JSON হলে parse করি — important!
  // কারণ পরের node template walk করার জন্য object দরকার
  let parsedBody = json.body
  try { parsedBody = JSON.parse(json.body) } catch {}
  
  return { status: json.status, body: parsedBody, ... }
}
```

**Key detail:** body কে JSON parse করে রাখি, raw string না। কারণ `{{login.body.token}}` template walk করতে হলে `body` একটা object হতে হবে।

### Delay node

```ts
async function executeDelay(data) {
  const ms = Math.max(0, Math.min(data.ms, 60000))
  await new Promise((r) => setTimeout(r, ms))
  return { delayedMs: ms }
}
```

সহজ। User যা দিয়েছে সেটাকে clamp করি (0 থেকে 60s), wait করি।

Use case: rate-limited API-তে throttling, async job-এর জন্য wait।

---

## File map

| File | কাজ |
|---|---|
| `client/src/store/useFlowStore.ts` | Nodes, edges, runtime state (idle/running/success/error) |
| `client/src/lib/flow/executor.ts` | `runFlow`, `topoSort`, `resolveTemplate` |
| `client/src/components/flow/FlowPage.tsx` | React Flow canvas + Run button |
| `client/src/components/flow/RequestNode.tsx` | Custom request node UI |
| `client/src/components/flow/DelayNode.tsx` | Custom delay node UI |

---

## Concrete example — Login → Profile

```
[login node]                              [profile node]
  method: POST                              method: GET
  url: api.com/login                        url: api.com/me
  body: {"user":"a","pass":"b"}             body: 
                                            (header: Authorization: Bearer {{login.body.token}})
  
       └────────────[edge]──────────────────┘
```

**Execution:**

1. `topoSort` returns `[login, profile]`।
2. `login` runs → response `{ token: "abc123" }` → `outputs.set("login", { body: { token: "abc123" } })`।
3. `profile` runs:
   - URL: `api.com/me` (no template)।
   - Header template: `Bearer {{login.body.token}}` resolves to `Bearer abc123`।
   - Fetches with that header → returns user profile।
4. Both nodes show green। Done।

---

# Interview Questions (with short answers)

### Q1: Why a visual flow editor instead of Postman-style scripts?

> "Scripts are opaque — invisible to reviewers, hard to debug, security risk to share. A visual flow is pure data (nodes + edges + templates), reviewable, shareable as JSON, and a non-developer can read it. Trade-off: less powerful than arbitrary JavaScript, but enough for the chaining use case."

### Q2: How do you decide which node runs first?

> "Topological sort on the directed graph. Kahn's algorithm — start with all nodes whose in-degree is zero, process them, decrement their neighbors' in-degree. If the sorted list is shorter than total nodes, there's a cycle — we throw. This gives a valid execution order regardless of how the user positioned nodes on the canvas."

### Q3: How do you pipe data from one node to another?

> "Templates: `{{nodeLabel.body.field}}`. Each node's output is stored in a `Map<label, NodeOutput>` keyed by its human-readable label. Before executing a node, we run regex `/\{\{([^{}]+?)\}\}/g` over its URL and body, look up the referenced label in the map, dot-walk into the JSON. If anything's unresolved, throw — the user sees exactly which template didn't resolve."

### Q4: Why keyed by label, not by node ID?

> "User experience. Labels are human-readable (`login`, `getUser`) — IDs are UUIDs. Writing `{{f47ac10b-58cc-...-body-token}}` would be unusable. Label collision is the user's responsibility; we don't dedupe."

### Q5: Why sequential, not parallel?

> "Because later nodes depend on earlier nodes' outputs via templates. Parallelizing would break that dependency. For independent branches, theoretically we could run them in parallel (we'd compute the DAG's levels), but for this app's scale it's not worth the complexity."

### Q6: What happens if a node fails?

> "We call `onNodeError`, set the node's runtime state to `error`, and throw to halt the rest of the flow. Subsequent nodes never run. The user sees the failing node in red with the error message inline. This is fail-fast behavior — if login fails, no point trying to fetch the profile."

### Q7: How do you detect cycles?

> "After topo sort, if `sorted.length < nodes.length`, some nodes weren't processable — that means they were stuck in a cycle. We throw `Flow contains a cycle`. We could detect earlier, but post-sort check is cheaper than a DFS up front."

### Q8: Why is the response body parsed as JSON before storing?

> "So templates can walk into it. `{{login.body.token}}` requires `body` to be an actual object, not a string. We try `JSON.parse`; if it fails (HTML, plain text), we keep the raw string. The user can still reference `{{login.status}}` regardless."

### Q9: How is node state (idle/running/success/error) tracked?

> "Separate from the node's own data — runtime state lives in `useFlowStore.runtime` keyed by node ID. The executor accepts callbacks (`onNodeStart`, `onNodeSuccess`, `onNodeError`); each callback updates the runtime via Zustand. RequestNode/DelayNode read from runtime and show colored borders. This separates 'what the user defined' from 'what happened in the last run.'"

### Q10: What persists across reloads?

> "Only `nodes` and `edges` — via Zustand's `persist` with `partialize`. Runtime state and `running` flag are stripped on save, because they're meaningless after a refresh. Reopening the browser shows the flow you drew, but no node colors."

### Q11: What are the limitations?

> "Three big ones. (1) No branching — there's no Condition node that picks an edge based on output. (2) No loops — can't iterate a list and call an API per item. (3) No parallel execution — slow flows are unnecessarily sequential. For an interview project, this scope is fine; in production you'd add at least conditions and parallel branches."

### Q12: How would you scale this?

> "Move execution to the server so the browser doesn't freeze on long flows. Persist flow definitions to the database (already have the schema pattern from Part 6). Add a job queue (BullMQ/Redis) so flows can run async. Add branching via a Condition node that evaluates a simple expression and chooses which edge to follow."

---

# Execution Order — Run Flow click করলে কী হয়

User "Run Flow" button-এ click করার পর code কোন order-এ চলে — file by file, function by function।

### Step 1 — User click

**`FlowPage.tsx → handleRun()`** — Run Flow button-এর click handler। নতুন run শুরু করে।

### Step 2 — Reset state

**`FlowPage.tsx → setRunError(null), setFailedNodeId(null), resetRuntime()`** — পুরোনো error, failed node মুছে। সব node-এর runtime state idle-এ ফিরিয়ে দেয়।

### Step 3 — Running flag on

**`useFlowStore.ts → setRunning(true)`** — store-এ running=true করে। Run Flow button "Running..." দেখায়।

### Step 4 — Nodes prepare

**`FlowPage.tsx → execNodes mapping`** — store-এর nodes-কে executor-এর expected shape-এ convert করে (id, type, data)।

### Step 5 — Executor call

**`executor.ts → runFlow(nodes, edges, callbacks)`** — main entry। সব node order-এ চালানোর responsibility এটার।

### Step 6 — Topological sort

**`executor.ts → topoSort(nodes, edges)`** — Kahn's algorithm দিয়ে edges দেখে node-এর order বের করে। Cycle থাকলে throw করে।

### Step 7 — Outputs map তৈরি

**`executor.ts → new Map<string, NodeOutput>()`** — node label-এ keyed একটা empty Map। প্রতিটা node-এর output এতে store হবে।

### Step 8 — Loop শুরু (প্রতিটা node-এর জন্য)

**`executor.ts → for (const node of ordered)`** — sorted order-এ এক এক করে node process করে।

### Step 9 — Node "running" mark

**`FlowPage.tsx → onNodeStart callback → setNodeState(id, 'running')`** — `useFlowStore.ts → setNodeState` এ পৌঁছায়। UI-তে node-এর border blue হয়।

### Step 10A — যদি Request node:

**`executor.ts → executeRequest(data, outputs)`** — request node চালায়।

  - **`executor.ts → resolveTemplate(data.url, outputs)`** — URL-এর `{{...}}` templates resolve করে।
  - **`executor.ts → resolveTemplate(data.body, outputs)`** — body-এর templates resolve করে।
  - **`executor.ts → walkPath(out, path)`** — dot-separated path দিয়ে nested object-এ value খুঁজে।
  - **`executor.ts → fetch('/api/requests/execute', {...})`** — backend-এ POST। (Part 1-এর route)।
  - **`server/src/index.ts → app.post('/api/requests/execute')`** — backend proxy target URL fetch করে, response ফেরায়।
  - **`executor.ts → JSON.parse(json.body)`** — response body কে object-এ convert করে (পরের template walk-এর জন্য)।
  - Return: `{ status, body: parsedBody, responseTime }`।

### Step 10B — যদি Delay node:

**`executor.ts → executeDelay(data)`** — N millisecond `setTimeout` দিয়ে wait। Return: `{ delayedMs }`।

### Step 11 — Output save

**`executor.ts → outputs.set(node.data.label, output)`** — node-এর label-এ keyed হয়ে output Map-এ store। পরের node template-এ এটা reference করতে পারবে।

### Step 12 — Node "success" mark

**`FlowPage.tsx → onNodeSuccess callback → setNodeOutput(id, output) + setNodeState(id, 'success')`** — store update। UI-তে border green হয়, output preview দেখায়।

### Step 13 — Error হলে

**`FlowPage.tsx → onNodeError callback → setNodeState(id, 'error', message), setFailedNodeId(id)`** — error message সহ store update। UI-তে red border আর error text।

**`executor.ts → throw err`** — flow stop, পরের node গুলো আর চলবে না।

### Step 14 — Loop শেষ

**`executor.ts → runFlow returns`** — সব node শেষ (বা একটা fail হয়ে stopped)।

### Step 15 — Cleanup

**`FlowPage.tsx → setRunning(false)`** — `useFlowStore.ts → setRunning` এ যায়। UI button আবার "Run Flow" দেখায়।

### Step 16 — Re-render

**`RequestNode.tsx / DelayNode.tsx`** — প্রতিটা node তার runtime state read করে। Border color (idle/blue/green/red), status preview সব update।

---

### Visual summary

```
FlowPage.tsx (handleRun)
  ↓ resetRuntime → useFlowStore
  ↓ setRunning(true) → useFlowStore
  ↓
executor.ts (runFlow)
  ↓ topoSort → ordered nodes
  ↓ outputs Map create
  ↓ loop start:
       onNodeStart → FlowPage → useFlowStore (running)
       ├─ executeRequest:
       │    ├─ resolveTemplate (url, body)
       │    ├─ walkPath
       │    ├─ fetch /api/requests/execute → server/index.ts
       │    └─ JSON.parse body
       ├─ executeDelay:
       │    └─ setTimeout
       ↓ outputs.set(label, output)
       ↓ onNodeSuccess → FlowPage → useFlowStore (success + output)
       (error হলে onNodeError → useFlowStore (error))
  ↓ loop end
  ↓
FlowPage.tsx (setRunning(false))
  ↓
RequestNode/DelayNode re-render (border + preview)
```

এক বাক্যে: **FlowPage trigger → executor (topoSort + loop) → প্রতিটা node-এ either executeRequest/executeDelay → outputs Map update → callback দিয়ে useFlowStore update → UI re-render।**

---

# Concrete Flow Test — নিজে try করো

JSONPlaceholder (`https://jsonplaceholder.typicode.com`) একটা free fake API — কোনো auth লাগে না। এটাতে **POST** করলে fake API তোমার পাঠানো body-টা echo করে, সাথে একটা auto-generated `id` দেয়।

আমরা একটা realistic **POST → POST chained flow** test করব: **"একটা post তৈরি করো → সেই post-এ একটা comment যোগ করো"**। দ্বিতীয় request-এর comment-টা জানতে হবে কোন post-এ যোগ হবে — সেই post-এর `id` আসবে প্রথম request থেকে।

## Test setup

Navbar-এ **Flow** view-এ যাও। দুটো Request node বানাও।

### Node 1 — label: `createPost` (POST)

```
Label:  createPost
Method: POST
URL:    https://jsonplaceholder.typicode.com/posts
Body:   {"title": "Flow test", "body": "created from node 1", "userId": 1}
```

JSONPlaceholder যে response দেবে (তোমার body echo + নতুন `id`):
```json
{
  "title": "Flow test",
  "body": "created from node 1",
  "userId": 1,
  "id": 101
}
```

### Node 2 — label: `addComment` (POST)

```
Label:  addComment
Method: POST
URL:    https://jsonplaceholder.typicode.com/comments
Body:   {"postId": {{createPost.body.id}}, "name": "auto comment", "body": "chained from node 1"}
```

লক্ষ্য করো — এবার template **URL-এ না, JSON body-র ভেতরে**: `{{createPost.body.id}}`। মানে "`createPost` node-এর response body-র `id` field এখানে বসাও"। Run-এর সময় এটা `101` হয়ে যাবে, তাই আসল body যাবে `{"postId": 101, ...}`।

### Connect করো

Node 1-এর ডান handle থেকে Node 2-এর বাঁ handle-এ একটা edge টানো। এটা বলে: **`createPost` আগে চলবে, তারপর `addComment`।**

### Run

**Run Flow** click করো।

- `createPost` node green হবে — response `{ id: 101, title: "Flow test", ... }`।
- `addComment` node green হবে — কারণ `{{createPost.body.id}}` resolve হয়ে `101` হয়েছে, তাই আসল POST body গেছে `{"postId": 101, ...}` — JSONPlaceholder সেটা echo করে `{ id: 501, postId: 101, ... }` ফেরত দেয়।

**এটাই chaining** — প্রথম request যে resource তৈরি করল, দ্বিতীয় request সেই resource-এর `id` ব্যবহার করল।

> এটা real-world-এর খুব common pattern: **parent তৈরি করো → child তৈরি করো।** Login → token দিয়ে next call, user create → সেই user-এর জন্য resource create — সব একই idea।

---

## এই test-এ code flow — কোথা থেকে শুরু, step by step

উপরের flow-তে **Run Flow** click করার পর ঠিক কী হয় — file → function → কী করে।

### ১. শুরু — button click

**`FlowPage.tsx → handleRun()`**
Run Flow button-এর `onClick`। সব এখান থেকে শুরু।

### ২. পুরোনো state পরিষ্কার

**`FlowPage.tsx → resetRuntime()` → `useFlowStore.ts → resetRuntime`**
`createPost` আর `addComment` দুটো node-এর runtime `idle`-এ ফিরে যায়। আগের run-এর green/red border মুছে যায়।

### ৩. Running flag

**`FlowPage.tsx → setRunning(true)` → `useFlowStore.ts → setRunning`**
Button "Running..." দেখায়।

### ৪. Nodes কে executor shape-এ convert

**`FlowPage.tsx → nodes.map(...)`**
Store-এর node গুলোকে `{ id, type, data }` shape-এ সাজায় (`execNodes`)।

### ৫. Executor call

**`FlowPage.tsx → runFlow(execNodes, edges, callbacks)` → `executor.ts → runFlow()`**
`callbacks` হলো তিনটা function: `onNodeStart`, `onNodeSuccess`, `onNodeError` — executor এগুলো call করে UI update করায়।

### ৬. Order বের করা

**`executor.ts → topoSort(nodes, edges)`**
Edge `createPost → addComment` দেখে বের করে: order হলো `[createPost, addComment]`। (canvas-এ যেভাবেই রাখো, edge দেখে ঠিক order পায়।)

### ৭. Outputs Map তৈরি

**`executor.ts → const outputs = new Map<string, NodeOutput>()`**
খালি Map। এখানে প্রতিটা node-এর result label দিয়ে keyed হয়ে জমবে।

### ৮. Loop — প্রথম node: `createPost`

**`executor.ts → for (const node of ordered)` — প্রথম iteration**

#### ৮ক. Node "running" mark

**`executor.ts → callbacks.onNodeStart(node.id)` → `FlowPage.tsx → setNodeState(id, 'running')` → `useFlowStore.ts`**
`createPost` node-এর border blue হয়।

#### ৮খ. Request execute

**`executor.ts → executeRequest(data, outputs)`**

- **`resolveTemplate(data.url, outputs)`** — URL `https://jsonplaceholder.typicode.com/posts`-এ কোনো `{{}}` নেই → unchanged।
- **`resolveTemplate(data.body, outputs)`** — body `{"title": "Flow test", ...}`-এ কোনো `{{}}` নেই → unchanged।
- **`fetch('/api/requests/execute', { method: 'POST', body: {...} })`** — backend proxy-তে পাঠায়। ভেতরের body-তে আসল target method `POST` আর url।
- **`server/src/index.ts → app.post('/api/requests/execute')`** — backend আসল `POST .../posts` fetch করে, response ফেরায়।
- **`executor.ts → JSON.parse(json.body)`** — response body string কে object-এ convert: `{ id: 101, title: "Flow test", ... }`।
- Return: `{ status: 201, body: { id: 101, ... }, responseTime: 130 }`।

#### ৮গ. Output save

**`executor.ts → outputs.set(node.data.label, output)`**
`outputs.set("createPost", { status: 201, body: { id: 101, ... } })`।
এখন Map-এ আছে: `{ "createPost" → { body: { id: 101, ... } } }`।

#### ৮ঘ. Node "success" mark

**`executor.ts → callbacks.onNodeSuccess(node.id, output)` → `FlowPage.tsx → setNodeOutput + setNodeState('success')` → `useFlowStore.ts`**
`createPost` node green হয়, status preview দেখায়।

### ৯. Loop — দ্বিতীয় node: `addComment`

**`executor.ts → for loop` — দ্বিতীয় iteration**

#### ৯ক. "running" mark

`addComment` node border blue।

#### ৯খ. Request execute — **এখানেই chaining ঘটে**

**`executor.ts → executeRequest(data, outputs)`**

- **`resolveTemplate(data.url, outputs)`** — URL `.../comments`-এ template নেই → unchanged।
- **`resolveTemplate(data.body, outputs)`** — body-তে `{{createPost.body.id}}` আছে:
  - **`TEMPLATE_RE` regex** `{{createPost.body.id}}` match করে।
  - `expr = "createPost.body.id"` → `split('.')` → `label = "createPost"`, `path = ["body", "id"]`।
  - **`outputs.get("createPost")`** → `{ status: 201, body: { id: 101, ... } }` (step ৮গ-তে যেটা save হয়েছিল)।
  - **`walkPath(out, ["body", "id"])`** → `out.body.id` → `101`।
  - body হয়ে যায়: `{"postId": 101, "name": "auto comment", "body": "chained from node 1"}`।
- **`fetch('/api/requests/execute', ...)`** — resolved body সহ backend-এ।
- **`server/src/index.ts`** — আসল `POST .../comments` fetch।
- Response: `{ id: 501, postId: 101, name: "auto comment", ... }`।
- **`JSON.parse`** → object।
- Return: `{ status: 201, body: { id: 501, postId: 101, ... }, responseTime: 110 }`।

#### ৯গ. Output save

**`outputs.set("addComment", { ... })`** — Map এখন: `{ "createPost" → ..., "addComment" → ... }`।

#### ৯ঘ. "success" mark

`addComment` node green।

### ১০. Loop শেষ

**`executor.ts → runFlow returns`** — দুটো node-ই হয়ে গেছে।

### ১১. Cleanup

**`FlowPage.tsx → finally → setRunning(false)`**
Button আবার "Run Flow"।

### ১২. UI final render

**`RequestNode.tsx`** — দুটো node-ই তাদের runtime read করে, green border + status preview দেখায়।

---

## এই test-এর এক নজরে flow

```
Run Flow click
  │
FlowPage.handleRun
  ├─ resetRuntime, setRunning(true)        → useFlowStore
  └─ runFlow(execNodes, edges, callbacks)  → executor.ts
        │
        ├─ topoSort → [createPost, addComment]
        ├─ outputs = new Map()
        │
        ├─ NODE "createPost" (POST /posts):
        │    onNodeStart       → useFlowStore (running, blue)
        │    executeRequest
        │      resolveTemplate (url + body — no template, unchanged)
        │      fetch /api/requests/execute → server/index.ts → jsonplaceholder
        │      JSON.parse → { id: 101, title: "Flow test", ... }
        │    outputs.set("createPost", { body: { id: 101 } })
        │    onNodeSuccess     → useFlowStore (success, green)
        │
        └─ NODE "addComment" (POST /comments):
             onNodeStart       → useFlowStore (running, blue)
             executeRequest
               resolveTemplate(body: '{"postId": {{createPost.body.id}}, ...}')
                 → TEMPLATE_RE matches "createPost.body.id"
                 → outputs.get("createPost").body.id  =  101
                 → body becomes '{"postId": 101, ...}'
               fetch /api/requests/execute → server/index.ts → jsonplaceholder
               JSON.parse → { id: 501, postId: 101, ... }
             outputs.set("addComment", { body: {...} })
             onNodeSuccess     → useFlowStore (success, green)
  │
FlowPage finally → setRunning(false)
  │
RequestNode re-render (both green)
```

**মূল কথা:** `outputs` Map-টাই হলো chaining-এর "memory"। প্রথম node এতে লেখে (`outputs.set`), দ্বিতীয় node এখান থেকে পড়ে (`outputs.get` via `resolveTemplate`)। template URL-এ থাকুক বা JSON body-র ভেতরে — `resolveTemplate` দুটোই handle করে। এই একটা Map-ই পুরো pipe-এর কাজ করে।
