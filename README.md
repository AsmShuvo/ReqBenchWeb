<p align="center">
  <img src="https://raw.githubusercontent.com/AsmShuvo/ReqBenchWeb/main/client/public/images/logo.png" alt="ReqBench" width="100%" />
</p>

# ReqBench

A browser-based HTTP client with **zero install**, **local-first collections**, **concurrent benchmarking (P50/P90/P99)**, a **visual request-flow editor**, and **Groq LLM integration** for AI-assisted request repair, response explanation, and natural-language → HTTP conversion. **Optional JWT auth + cloud sync** via Neon Postgres.

---

## Features

- **HTTP request builder** — choose a method, type a URL, add headers and a JSON body, send, and view the status, time, size, headers, and response body.
- **Multi-tab interface** — work on several requests at once; each tab keeps its own request and response.
- **Local-first collections** — save requests into named collections and reload them in one click. Everything lives in `localStorage` by default — works fully offline, no account required.
- **Concurrent benchmarking** — point at a request, set total count and concurrency, and get P50/P90/P99 latency, requests-per-second, a status-code breakdown, and a live response-time chart. Runs are cancellable mid-flight.
- **Visual flow editor** — drag Request and Delay nodes onto a canvas, connect them with edges, and pipe one node's output into the next using `{{nodeLabel.body.field}}` templates. Useful for chained scenarios like "create a resource → use its ID in the next call".
- **AI assist (Groq)** — three LLM-powered helpers: fix a failing request, explain a response in plain English, and generate a request from a natural-language description.
- **Optional auth + cloud sync** — sign up with email/password (bcrypt-hashed, JWT sessions); collections sync to your own Neon Postgres database for cross-device access.

---

## Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS 4, Zustand, Recharts, React Flow
**Backend:** Express 5, TypeScript, Prisma + Neon Postgres
**AI:** Groq API (`llama-3.3-70b-versatile`)

---

## Installation

### Prerequisites

- Node.js 18+
- npm

### 1. Backend

```bash
cd server
npm install
cp .env.example .env       # fill in DATABASE_URL, JWT_SECRET, GROQ_API
npx prisma generate
npm run dev                # runs on http://localhost:3001
```

### 2. Frontend (new terminal)

```bash
cd client
npm install
cp .env.example .env
npm run dev                # runs on http://localhost:5173
```

Open <http://localhost:5173> in your browser.

> Basic HTTP requests work with **no** env config. Auth/sync needs `DATABASE_URL` + `JWT_SECRET`. AI needs `GROQ_API`.

### Environment variables

`server/.env`:
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=at-least-16-random-characters
GROQ_API=gsk_your_groq_key
```

`client/.env`:
```
VITE_SERVER_URL=http://localhost:3001
```

### Optional — database setup (for auth + cloud sync)

1. Create a free project at <https://neon.tech>.
2. Copy the connection string into `DATABASE_URL` in `server/.env`.
3. From `server/`, push the schema to Neon:
   ```bash
   npm run db:push
   ```
   This creates the tables matching `prisma/schema.prisma`. Run it once before signing up for the first time. If you later see errors like `column User.passwordHash does not exist`, your DB is out of sync — run `npm run db:push` again.

### Optional — Groq (for AI features)

1. Get a free API key at <https://console.groq.com>.
2. Set `GROQ_API` in `server/.env` and restart the backend.

---

## Project layout

```
ReqBenchWeb/
├── client/                  Vite + React frontend
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── components/      RequestBuilder, ResponseViewer, BenchmarkModal,
│       │                    AiModal, CollectionsPanel, AuthModal, Navbar,
│       │                    flow/{FlowPage, RequestNode, DelayNode}
│       ├── store/           useRequestStore, useCollectionStore,
│       │                    useAuthStore, useFlowStore  (Zustand)
│       └── lib/             aiClient, syncManager, flow/{executor, flowTypes}
└── server/                  Express backend
    ├── src/
    │   ├── index.ts         All routes (proxy, benchmark, AI, auth, sync)
    │   └── lib/             auth, benchmark, groq, prisma, sync
    └── prisma/schema.prisma
```

See **[details.md](./details.md)** for the full explanation, file by file.

---

## API routes

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/requests/execute` | Proxies one HTTP request (bypasses browser CORS) |
| `POST` | `/api/benchmarks/run` | Runs N concurrent requests, returns P50/P90/P99 + time series |
| `POST` | `/api/benchmarks/cancel` | Aborts an in-flight benchmark run |
| `GET` | `/api/ai/status` | Reports whether Groq is configured |
| `POST` | `/api/ai/fix-request` | LLM repair of a failing request |
| `POST` | `/api/ai/explain-response` | Plain-English explanation of a response |
| `POST` | `/api/ai/nl-to-request` | Natural language → structured HTTP request |
| `POST` | `/api/auth/signup` | Email + password, returns JWT |
| `POST` | `/api/auth/login` | Returns JWT |
| `GET` | `/api/auth/me` | Current user (auth required) |
| `GET` | `/api/sync/state` | Pull collections snapshot (auth required) |
| `POST` | `/api/sync/push` | Push collections snapshot (auth required) |

---

## License

Personal project.
