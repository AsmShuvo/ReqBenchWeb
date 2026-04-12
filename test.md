# ReqBench — Usage Guide & Examples

A walkthrough of every major feature with concrete examples you can follow end-to-end.

> Prerequisites: backend running on `:3001` and client on `:5173` (see [README.md](./README.md)).

---

## 1. Sending Your First Request

1. Open <http://localhost:5173>.
2. In the **Request Builder**, set:
   - Method: `GET`
   - URL: `https://jsonplaceholder.typicode.com/todos/1`
3. Click **Send**.
4. The response panel shows status `200`, headers, body, and response time.

**Try a POST with a JSON body:**
```
Method: POST
URL:    https://jsonplaceholder.typicode.com/posts
Headers: Content-Type: application/json
Body:   {"title": "hello", "body": "world", "userId": 1}
```
Expected: `201 Created` with the echoed payload plus an `id`.

---

## 2. Tabs and History

- Click **+** on the tab bar to open a new request tab.
- Every successful send is appended to the **History** panel (last 50).
- Click a history item to reload it into the current tab.

---

## 3. Environment Variables

1. Open **Environments** (navbar).
2. Create environment `Dev` with variables:
   - `baseUrl` = `https://jsonplaceholder.typicode.com`
   - `token` = `abc123` (mark as secret)
3. Select `Dev` as the active environment.
4. In the request URL, type:
   ```
   {{baseUrl}}/users/1
   ```
5. Add header `Authorization: Bearer {{token}}` and send.

Variables resolve just before the request fires.

---

## 4. Collections & Saved Requests

1. After crafting a request, click **Save**.
2. Create collection `JSONPlaceholder` → folder `Users` → name `Get User by ID`.
3. Open **Collections** panel to browse and reload saved requests.

---

## 5. Import Existing Requests

Open **Import** and paste one of the following:

**cURL:**
```bash
curl -X POST https://httpbin.org/post \
  -H "Content-Type: application/json" \
  -d '{"hello":"world"}'
```

**Postman collection:** paste full Postman v2.1 JSON export.

**OpenAPI:** paste an OpenAPI 3.x JSON or YAML spec — each path becomes a saved request.

---

## 6. Benchmarking

1. Open a request (e.g., `GET https://jsonplaceholder.typicode.com/todos/1`).
2. Click **Benchmark**.
3. Configure:
   - Total requests: `100`
   - Concurrency: `10`
   - Warmup: `5`
   - Delay: `0 ms`
4. Click **Run**. Watch the live charts populate.

**Expected output:**
- Average response time (~100–300 ms typical for public APIs)
- p95 / p99 latency
- Requests per second (RPS)
- Status code distribution (pie chart)
- Time-series line chart of latency

Click **Cancel** mid-run to abort. Results are saved to the benchmark history.

---

## 7. Code Generation

1. With a populated request, click **Code**.
2. Pick a language: **cURL / fetch / axios / Python requests**.
3. Copy the output. Variables are resolved into literal values.

**Example output (fetch):**
```js
fetch("https://jsonplaceholder.typicode.com/posts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "hello", body: "world", userId: 1 })
});
```

---

## 8. Compare / Diff

1. Send the same request twice (or two different ones).
2. Click **Compare** and choose two responses from history.
3. Output:
   - **JSON diff** — tree view with added/removed/changed keys highlighted
   - **Text diff** — line-by-line LCS diff (green added, red removed)

Useful for regression checking after changing a backend.

---

## 9. Visual Flow Builder

1. Switch view to **Flow** (navbar).
2. Drag a **Request** node onto the canvas. Configure:
   - URL: `https://jsonplaceholder.typicode.com/users/1`
3. Drag a second **Request** node. Configure:
   - URL: `https://jsonplaceholder.typicode.com/posts?userId={{node1.body.id}}`
4. Connect node1 → node2 by dragging from the output handle.
5. Optional: insert a **Delay** node (500 ms) between them.
6. Click **Run**. Watch each node flash green on success.

Template refs support deep paths: `{{nodeId.body.address.city}}`.

---

## 10. AI Assist (requires `GROQ_API`)

Open the **AI** modal and pick a mode:

### Fix Request
Paste a failing request. Example — a 401 with no auth header:
```
GET https://api.github.com/user
```
AI suggests adding `Authorization: Bearer <token>`.

### Explain Response
Feeds request + response to the model and returns a plain-English summary.

### Generate Tests
Produces Vitest/Jest-style assertions:
```js
expect(response.status).toBe(200);
expect(response.data).toHaveProperty("id", 1);
```

### Natural Language → Request
Type: *"Get the first 5 posts from JSONPlaceholder"* → model returns a structured request you can load into the builder.

> The client caps usage at 25 calls/day. Reset by clearing `reqbench-ai-limit` in DevTools → Local Storage.

---

## 11. Auth & Cloud Sync (requires `DB_URL` + `JWT_SECRET`)

1. Click **Sign in** in the navbar → **Create account**.
2. Enter email + password (min 8 chars).
3. On successful sign-in:
   - JWT stored in `localStorage` as `reqbench-auth`
   - Collections, history, and environments auto-sync every ~3 seconds after changes
4. Sign in on another device to pull the same data.

**Manual API verification:**
```bash
# Signup
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","password":"supersecret","name":"Me"}'

# Fetch current user (use token from response above)
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <token>"
```

---

## 12. Health Checks

```bash
curl http://localhost:3001/api/health
# → {"status":"ok"}

curl http://localhost:3001/api/health/db
# → {"status":"ok","database":"connected"}   (if DB_URL is set)

curl http://localhost:3001/api/ai/status
# → {"configured":true}                      (if GROQ_API is set)
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ECONNREFUSED` in client | Backend not running | `cd server && npm run dev` |
| `408 Request Timeout` | Target API slow (>30s) | Retry; execute route has a hard 30s cap |
| AI modal says "not configured" | `GROQ_API` missing | Set in `server/.env`, restart backend |
| Sync fails silently | Token expired / invalid | Sign out and back in |
| Benchmark stuck on "running" | Worker did not report completion | Click **Cancel** and retry with lower concurrency |
| Prisma error on startup | Migrations not applied | `npx prisma migrate dev` in `server/` |

---

## Quick Smoke Test (End-to-End)

Run through these in order to verify a fresh install:

1. [ ] `GET` against `https://jsonplaceholder.typicode.com/todos/1` returns 200
2. [ ] Save it into a collection
3. [ ] Run a 20-request benchmark on it
4. [ ] Generate a cURL snippet
5. [ ] Send another request, then compare the two responses
6. [ ] Build a 2-node flow that chains one response into the next
7. [ ] (Optional) Sign up, refresh, confirm data persists
8. [ ] (Optional) Use AI "Explain Response" on any response

If all eight pass, the app is fully operational.
