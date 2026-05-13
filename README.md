<p align="center">
  <img src="https://raw.githubusercontent.com/AsmShuvo/ReqBenchWeb/main/client/public/images/logo.png" alt="ReqBench" width="100%" />
</p>

# ReqBench

A browser-based Postman-style HTTP client with **zero install**, **local-first collections**, **concurrent benchmarking (P50/P90/P99)**, a **visual request-flow editor**, and **Groq LLM integration** for AI-assisted request repair, response explanation, and natural-language → HTTP conversion. **Optional JWT auth + cloud sync** via Neon Postgres.

---

## Features

- **HTTP request builder** — method, URL, headers, JSON body, response viewer
- **Multi-tab interface** — work on several requests at once, each tab keeps its own response
- **Local-first collections** — save requests and load them back in one click; everything lives in `localStorage` by default
- **Concurrent benchmarking** — run N parallel requests, see P50/P90/P99 latency and a live response-time chart
- **Visual flow editor** — chain Request and Delay nodes; pipe outputs into later nodes with `{{nodeLabel.body.field}}` templates
- **AI assist (Groq)** — Generate a request from natural language
- **Optional auth + cloud sync** — sign up with email/password, JWT in localStorage, collections sync to Neon Postgres

---

## Stack

**Frontend:** React 19, TypeScript, Vite, TailwindCSS 4, Zustand, Recharts, React Flow
**Backend:** Express 5, TypeScript, Prisma + Neon Postgres
**AI:** Groq API (`llama-3.3-70b-versatile`)

---

## Install

```bash
# Backend
cd server
npm install
cp .env.example .env       # fill in DATABASE_URL, JWT_SECRET, GROQ_API
npx prisma generate
npm run dev                # http://localhost:3001

# Frontend (new terminal)
cd client
npm install
cp .env.example .env
npm run dev                # http://localhost:5173
```

Basic HTTP requests work with no env config. Auth/sync needs `DATABASE_URL` and `JWT_SECRET`. AI needs `GROQ_API`.

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

### Optional: database setup

1. Create a free Neon project at <https://neon.tech>.
2. Copy the connection string to `DATABASE_URL` in `server/.env`.
3. From `server/`, push the schema to Neon:
   ```bash
   npm run db:push
   ```
   This drops any old tables and creates fresh ones matching `prisma/schema.prisma`. Run it once before signing up the first time. If you ever see errors like `column User.passwordHash does not exist`, your DB is out of sync — run `npm run db:push` again.

### Optional: Groq

1. Get a free key at <https://console.groq.com>.
2. Set `GROQ_API` in `server/.env` and restart.

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
| `POST` | `/api/ai/nl-to-request` | English → structured HTTP request |
| `POST` | `/api/auth/signup` | Email + password, returns JWT |
| `POST` | `/api/auth/login` | Returns JWT |
| `GET` | `/api/auth/me` | Current user (auth required) |
| `GET` | `/api/sync/state` | Pull collections snapshot (auth required) |
| `POST` | `/api/sync/push` | Push collections snapshot (auth required) |

---

## License

Personal project.
