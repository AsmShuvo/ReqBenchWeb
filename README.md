<p align="center">
  <img src="./client/public/images/logo.png" alt="ReqBench" width="100%" />
</p>

# ReqBench

A modern, local-first API testing workbench — build requests, run benchmarks, visualize flows, and ship faster with AI assistance. Think "Postman meets k6 meets n8n" in a single lightweight app.

> All data lives in your browser by default. Optional cloud sync via Neon Postgres and AI features via Groq — both on free tiers.

[![Try It](https://img.shields.io/badge/📖_Usage_Guide-test.md-blue?style=for-the-badge)](./test.md)

---

## Features

### Request Workbench
- Full HTTP request builder (GET/POST/PUT/PATCH/DELETE) with params, headers, body, and Bearer/Basic auth
- Multi-tab interface with per-tab response history
- Environment variables with `{{variable}}` substitution and secret flagging
- Collections and folders for organizing saved requests

### Benchmarking
- Server-side worker pool with configurable concurrency (1–50) and warmup
- Real-time charts: time-series latency, percentiles (p90/p95/p99), status code distribution
- History of the last 20 benchmark runs

### Response Tools
- Structural JSON diff and LCS line-by-line text diff between any two responses
- Code generation in cURL, `fetch`, `axios`, and Python `requests`

### Import / Export
- Parse cURL commands, Postman v2.1 collections, and OpenAPI 3.x specs (JSON or YAML)

### Visual Flow Builder
- Chain requests using React Flow nodes: Request, Delay, Condition
- Template refs (`{{node.body.field}}`) pipe output between steps
- Per-node runtime state and error surfacing

### AI Assist (Groq)
- Fix failing requests, explain responses, generate test code, convert natural language to requests
- Client-side daily cap (25 calls) to stay within the free tier

### Auth & Cloud Sync (Optional)
- Email/password sign-in with JWT (30-day TTL)
- Push / merge local snapshots to Neon Postgres for cross-device access

---

## Tech Stack

### Frontend
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white)
![React Flow](https://img.shields.io/badge/React_Flow-FF0072?style=for-the-badge&logo=react&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-FF6B6B?style=for-the-badge&logo=chartdotjs&logoColor=white)

### Backend
![Node.js](https://img.shields.io/badge/Node.js_18+-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)

### Services
![PostgreSQL](https://img.shields.io/badge/Neon_Postgres-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Groq](https://img.shields.io/badge/Groq_AI-F55036?style=for-the-badge&logo=meta&logoColor=white)

---

## Architecture

![Architecture](./client/public/images/architecture.png)

### Component Layout

```
ReqBenchWeb/
├── client/                      # Vite + React frontend
│   └── src/
│       ├── components/          # RequestBuilder, BenchmarkModal, FlowPage, ...
│       ├── lib/                 # codegen, diff, flow executor, importers
│       └── store/               # Zustand: request, auth, flow, env, history
└── server/                      # Express backend
    ├── src/
    │   ├── index.ts             # Routes (requests, benchmarks, AI, auth, sync)
    │   └── lib/                 # auth, benchmark, groq, prisma, sync
    └── prisma/schema.prisma     # User, Collection, Environment, BenchmarkRun
```

---

## Installation

### Prerequisites
- Node.js 18+
- npm

### 1. Clone
```bash
git clone <repo-url> ReqBenchWeb
cd ReqBenchWeb
```

### 2. Backend
```bash
cd server
npm install
cp .env.example .env
npx prisma generate
npm run dev
```
Backend runs at <http://localhost:3001>.

### 3. Frontend (new terminal)
```bash
cd client
npm install
cp .env.example .env
npm run dev
```
Frontend runs at <http://localhost:5173>.

Plain HTTP requests work with no `.env`; auth, sync, and AI will surface helpful errors if unconfigured.

### Environment Variables

**`server/.env`**
```env
DB_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=<random-16-chars-or-more>
GROQ_API=gsk_your_key
GROQ_MODEL=llama-3.3-70b-versatile
```

**`client/.env`**
```env
VITE_SERVER_URL=http://localhost:3001
```

### Database Setup (Optional — for auth/sync)
1. Sign up at <https://neon.tech> (free, no card).
2. Copy the pooled connection string into `server/.env` as `DB_URL`.
3. Run migrations:
   ```bash
   cd server
   npx prisma migrate dev
   ```
4. Verify: `curl http://localhost:3001/api/health/db` → `{"status":"ok"}`

### Groq Setup (Optional — for AI)
1. Sign up at <https://console.groq.com>, create an API key.
2. Set `GROQ_API` in `server/.env` and restart the backend.
3. Verify: `curl http://localhost:3001/api/ai/status` → `{"configured":true}`

---

## How to Use

Full walkthroughs, examples, and a smoke-test checklist are in **[test.md](./test.md)** — start there after your first `npm run dev`.

---

## Scripts

**Backend (`server/`)**
| Command | Description |
|---|---|
| `npm run dev` | Watch-mode server on port 3001 |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |

**Frontend (`client/`)**
| Command | Description |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Type-check + production build |
| `npm run lint` | Run ESLint |

---

## Deployment

Typical free-tier topology:

```
Browser → Vercel (static client) ──/api/*──▶ Render (Express) → Neon + Groq
```

- **Frontend:** Vercel / Netlify / Cloudflare Pages — root `client/`, build `npm run build`, output `dist/`. Add an `/api/*` rewrite to your backend URL.
- **Backend:** Render / Railway / Fly.io — root `server/`, build `npm install && npx prisma generate`, start `npx tsx src/index.ts`.
- **Database:** Run `npx prisma migrate deploy` against the prod `DB_URL` once before deploy.

---

## Security Notes

- `POST /api/requests/execute` is an **unauthenticated HTTP proxy**. Do not expose it publicly without rate-limiting or auth.
- `/api/ai/*` is gated only by a client-side daily cap. Add server-side auth before public deploy.
- JWTs live in `localStorage` (`reqbench-auth`) with a 30-day TTL. Rotating `JWT_SECRET` invalidates all sessions.

---

## License

Personal project. No license chosen yet.
