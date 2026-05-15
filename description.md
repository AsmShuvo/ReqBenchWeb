# ReqBench — Project Description (Interview Guide)

> How to talk about this project in an interview. No code — just clear, confident explanations. Read top to bottom; each section is something an interviewer might drill into.

---

## 1. The 30-second pitch

> "I built **ReqBench** — a browser-based API testing tool, basically a lightweight Postman alternative. You type an HTTP request, send it, see the response. But on top of that I added three things Postman either charges for or doesn't do well: **concurrent benchmarking** with proper percentile latency, a **visual flow editor** for chaining requests, and **AI assistance** through the Groq LLM API. It's local-first — your data lives in your browser by default — with optional JWT auth and cloud sync if you want it across devices."

That's the whole thing in one breath. If they want more, you go deeper.

---

## 2. Why I built it — the problem

The interviewer will ask "why does this exist?" Here's the answer:

Postman is the industry-standard API tool, but it's developed real problems:

1. **It's heavy.** It's an Electron desktop app — 300+ MB, ships an entire Chrome browser, eats RAM at idle. You have to install and update it.
2. **It forces a cloud account.** Recent versions push you to sign in to Postman's cloud even just to save a request. Your private API data lives on their servers — a compliance problem for a lot of companies.
3. **No real benchmarking.** Postman's "Collection Runner" can loop a request, but there's no concurrency control, no percentile latency, no live charts. If you want to load-test, you need a separate tool like k6 or Apache Bench.
4. **Chaining requests means writing scripts.** To pass a token from a login response into the next request, you write JavaScript pre-request scripts — opaque, hard to review, hard to share.
5. **AI features are paywalled.**
6. **It's closed source** — you can't fix or extend it.

So my goal was: a **transparent, lightweight, free** tool that does the 80% of Postman people actually use, plus benchmarking, flow chaining, and AI — and that I fully control.

I'm honest about the trade-off too: Postman still wins on protocol coverage (WebSocket, gRPC), team collaboration, and years of polish. ReqBench is a focused personal/small-team tool, not an enterprise replacement.

---

## 3. The architecture — high level

> "It's a two-part app: a React frontend and an Express backend, with two optional external services — Neon Postgres and the Groq API."

**Why a backend at all, if it's 'browser-based'?**

This is the key architectural insight, and interviewers love it:

> "Browsers block cross-origin requests — CORS. If my page is on localhost and I try to fetch `api.github.com`, the browser hides the response unless GitHub explicitly allows my origin, which it won't. So a pure-browser HTTP client is impossible. My fix: the browser sends the request details to **my own** Express server — same origin, no CORS issue — and the server makes the real call. Server-to-server has no CORS restrictions. The backend is essentially a **proxy**."

The backend also hosts the benchmark engine (heavy work doesn't belong in a browser tab), the AI calls (keeps the API key off the client), and the auth + sync logic (database connection stays server-side).

**Data flow in one line:** Browser → Vite dev-proxy → Express → the real target URL → back.

---

## 4. The features, one by one

### 4.1 The HTTP request workbench

> "The core. You pick a method, type a URL, add headers and a JSON body, hit Send. The response shows up with status, time, and size. It supports multiple tabs — each tab keeps its own request and its own response, so you can work on several APIs at once."

State is managed with **Zustand** — a small global store. The request builder writes to it, the response viewer reads from it; they never talk to each other directly. Single source of truth. Everything is mirrored to `localStorage` so a refresh doesn't lose your work.

### 4.2 Local-first collections

> "You can save a request into a named collection and reload it later in one click. It's a simple two-level structure — a collection is just a named list of saved requests. No folders, deliberately, to keep it simple."

**"Local-first"** is the philosophy: your data lives in your browser by default — works offline, no account needed. Cloud sync is opt-in, and even then it's a *mirror* of localStorage, not the source of truth. This is the opposite of Postman, where your data is theirs by default.

### 4.3 Concurrent benchmarking with P50/P90/P99

This is the feature I'd spend the most interview time on, because it shows real engineering thinking.

> "You point it at a request, set the total number of requests and a concurrency level, and the server fires them and reports latency percentiles plus a live chart."

**Why percentiles, not average?** Because average lies. If 99 requests take 100ms and one takes 5 seconds, the average is ~149ms — which hides the fact that a real user waited 5 seconds. Percentiles tell the truth:
- **P50** is the median — the typical experience.
- **P90** — 10% of users had it worse than this.
- **P99** — the worst case for real users; only 1% were slower.

Every serious company monitors P99, not average. That's the industry standard.

**Why concurrency matters:** Real users don't queue politely — 100 people might hit the same endpoint in the same second. Testing sequentially tells you nothing about how the API behaves under load. Concurrency lets you simulate that.

**How I implemented it — the worker pool pattern:** I spawn N "workers" that pull from a shared counter. Each worker grabs the next request index, runs it, comes back for more, until the counter's exhausted. So at any moment exactly N requests are in flight. The naive alternative — firing all 500 requests at once with `Promise.all` — gives you no concurrency control and can get your IP banned or hit OS connection limits.

**Cancellation:** the user can stop a run mid-way. I keep a registry of active runs keyed by an ID; the cancel endpoint looks up that run and aborts it. Workers check the abort signal each iteration and exit gracefully, returning partial results.

### 4.4 Visual flow editor

> "A drag-and-drop canvas where you chain requests. You drop Request and Delay nodes, connect them with arrows, and pipe one request's output into the next using a template syntax like `{{login.body.token}}`."

**The problem it solves:** in Postman, chaining requires writing JavaScript. Here it's pure visual data — reviewable, shareable as JSON, readable by non-developers.

**How it works — three pieces:**
1. **React Flow** handles the canvas — drag, zoom, the node and edge rendering.
2. **Topological sort** decides execution order. The user can scatter nodes anywhere on the canvas; I look at the edges — the arrows — and compute a valid order. If there's a cycle, I detect it and refuse to run.
3. **Template substitution** does the data piping. Each node's output is stored in a map keyed by the node's label. Before running a node, I scan its URL and body for `{{...}}` references, look up the referenced node's output, and walk into the JSON to pull the value.

It runs nodes sequentially because later nodes depend on earlier outputs. If a node fails, the flow stops — fail-fast.

**The honest limitation:** there's no branching (no "if status is 200, go this way") and no loops. For an interview project that scope is fine; production would need at least conditionals.

### 4.5 AI assistance via Groq

> "Three AI-powered features, all backed by the Groq API, which hosts open-source LLMs and has a generous free tier."

- **Fix a failing request** — feed it a request that returned an error, it suggests a corrected version.
- **Explain a response** — plain-English summary of what came back.
- **Natural language to HTTP** — you describe what you want, it generates a structured request.

**The implementation pattern:** for each feature I write a tight system prompt that demands a specific JSON shape, and I ask the model for JSON-mode output. Because LLMs sometimes wrap JSON in markdown fences or extra prose, I have a defensive parser that strips the cruft and extracts the JSON object. If parsing fails, I return a clear error rather than crash.

The Groq API key stays on the server — the browser never sees it.

### 4.6 JWT auth and cloud sync (optional)

> "If you want your collections across devices, you can sign up with email and password. Passwords are hashed with bcrypt, you get a JWT with a 30-day expiry, and your collections sync to a Neon Postgres database through Prisma."

**The sync strategy** is deliberately simple: on a change, I push a full snapshot of the collections to the server, which replaces the user's data inside a database transaction. It's not the most efficient approach for huge datasets, but for a personal tool it's simple, safe, and idempotent — a half-finished push can't corrupt anything.

**Auth middleware:** protected routes check for a valid `Bearer` token, verify it, and attach the user to the request. Login and signup return the same generic error on failure so attackers can't tell which emails are registered.

The whole auth/sync layer is **optional** — the app works identically without it. That's intentional: local-first means the cloud is a bonus, not a requirement.

---

## 5. The tech stack — and why each choice

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React 19 + TypeScript | Industry standard, type safety catches bugs early |
| Build tool | Vite | Fast dev server, and its built-in proxy solves my CORS problem cleanly |
| State management | Zustand | Lightweight, no boilerplate, has a `persist` middleware that mirrors to localStorage for free |
| Styling | TailwindCSS 4 | Fast to build with, no separate CSS files to manage |
| Charts | Recharts | Declarative, React-native, enough for the benchmark visuals |
| Flow canvas | React Flow | Purpose-built for node-edge editors — I'd never build drag-and-drop graph UI from scratch |
| Backend | Express 5 + TypeScript | Minimal, well-understood, fast enough as a proxy |
| ORM | Prisma | Type-safe database access, schema-as-code, easy migrations |
| Database | Neon Postgres | Serverless Postgres, generous free tier, HTTP-based driver that suits short-lived requests |
| AI | Groq API | Free tier, OpenAI-compatible API so no SDK needed, fast inference |

The theme across all of it: **lightweight, free-tier-friendly, minimal dependencies.** That matches the project's whole reason for existing.

---

## 6. Hard problems and decisions I made

Interviewers love this section. Have two or three ready.

**Problem 1 — CORS.** Already covered. The proxy backend is the answer. The lesson: a "browser-based" tool can't actually be browser-only.

**Problem 2 — Concurrency control.** The temptation is `Promise.all` over every request. But that's unbounded — it can overwhelm the target and your own machine. The worker-pool-with-shared-counter pattern keeps exactly N requests in flight regardless of total volume.

**Problem 3 — Honest metrics.** I deliberately chose percentiles over averages because averages hide outliers. Showing P50/P90/P99 is a small thing that signals you understand performance measurement.

**Problem 4 — Keeping scope sane.** I cut a lot — folders inside collections, environment variables, request import/export, code generation, response diffing. The requirement was: Postman-style client + benchmark + flow + AI + optional auth/sync. I kept exactly that. Knowing what *not* to build is a real skill, and I'd frame it that way.

**Problem 5 — Cross-store coordination.** The Save modal reads from the request store and writes to the collection store. The flow editor reads its own store but executes through a separate executor module. I kept each store owning one concept, with components as the glue — so adding cloud sync later didn't require touching component code.

---

## 7. What I'd do differently / next

Always have a forward-looking answer:

- **Move flow execution to the server.** Right now a long flow runs in the browser tab — the server-side version wouldn't freeze the UI and could run async via a job queue.
- **Add branching to the flow editor.** A Condition node that evaluates a simple expression and picks which edge to follow. That's the biggest functional gap.
- **Server-side rate limiting on the AI and proxy routes.** Right now the proxy is unauthenticated — fine for local use, not for a public deploy.
- **Smarter sync.** The full-snapshot replace is simple but doesn't scale. A real diff-based sync or per-entity updates would be the next step.
- **More protocols.** WebSocket support would broaden the use case a lot.

---

## 8. Quick-fire Q&A — likely interviewer questions

**Q: Why not just use Postman?**
> Covered in section 2 — heavy, forces a cloud account, no real benchmarking, scripting for chaining, paywalled AI, closed source.

**Q: Why does a browser app need a backend?**
> CORS. Browsers block cross-origin reads. The backend proxies the request server-to-server where CORS doesn't apply.

**Q: Why percentiles instead of average response time?**
> Average hides outliers. P99 tells you the worst real-user experience. It's what the whole industry monitors.

**Q: How do you control concurrency?**
> Worker pool — N workers sharing a counter, so exactly N requests are in flight at any time. Bounded, unlike a naive `Promise.all`.

**Q: How does the flow editor know what order to run nodes in?**
> Topological sort on the edge graph. Cycle detection if it can't produce a valid order.

**Q: How does data flow between flow nodes?**
> Templates like `{{nodeLabel.body.field}}`. Each node's output goes into a map keyed by label; the next node's templates are resolved against that map before it runs.

**Q: How do you handle the LLM returning malformed JSON?**
> Tight system prompts asking for JSON-mode output, plus a defensive parser that strips code fences and extracts the JSON object. Clear error if it still fails.

**Q: Where's the data stored?**
> localStorage by default — local-first. Optional sync to your own Neon Postgres if you sign in.

**Q: Is it secure?**
> Passwords are bcrypt-hashed, sessions are JWTs. For a public deploy I'd add rate limiting and auth on the proxy route — right now those are open, which is fine for local use but I'd call that out as a known limitation.

**Q: What was the hardest part?**
> Honestly, the concurrency model for benchmarking — getting bounded parallelism with clean cancellation. And resisting scope creep.

---

## 9. The one-paragraph summary to memorize

> "ReqBench is a browser-based Postman alternative. A React frontend talks to an Express backend that acts as a proxy — which is necessary because browsers block cross-origin requests. On top of the basic request/response workbench, it adds concurrent benchmarking with P50/P90/P99 percentiles using a worker-pool pattern, a visual flow editor that chains requests via topological sort and template substitution, and three Groq-powered AI features. Data is local-first in the browser with optional JWT auth and Postgres sync. The whole stack — React, Zustand, Tailwind, Express, Prisma, Neon, Groq — was chosen to be lightweight and free-tier-friendly, which is the entire point of the project."
