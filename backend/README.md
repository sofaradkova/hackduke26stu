# HackDuke AI backend (screenshots → OpenAI)

MVP Fastify service for a **single-student problem session**:

1. **Initial solve** — first screenshot → OpenAI (default `gpt-4.1-nano`) → validated `sourceOfTruth` JSON.
2. **Progressive evaluation** — later screenshots → same model → `progressPercent`, `reason`, `category`, `confidenceScore`, `confusionHighlights`.

No student/teacher UI, no auth, no WebSockets. Sessions and evaluations live **in memory** (restart clears data). Uploads are stored under `STORAGE_DIR` (default `./uploads`).

## Requirements

- Node.js **20+**
- npm (or pnpm/yarn if you adjust commands)

## Setup

```bash
cp .env.example .env
# Optional: add OPENAI_API_KEY and set USE_MOCK_AI=false
npm install
npm run dev
```

- **`USE_MOCK_AI=true`** or **missing `OPENAI_API_KEY`** → deterministic mock solver/evaluator (good for demos and CI).
- With a real key, set `USE_MOCK_AI=false` and set `OPENAI_MODEL` (defaults to `gpt-4.1-nano`) to a vision-capable chat model your key can use.

Production-style run:

```bash
npm run build
npm start
```

Default URL: `http://localhost:3001` (override with `PORT`).

## Where React teammates should call this

Point the student (or teacher) app at the **same origin as this server** in dev, or proxy browser traffic so requests are **same-origin** (avoids CORS preflight on multipart). Typical patterns:

- **Vite** — `server.proxy` in `vite.config.ts` mapping `/api` and `/health` to `http://localhost:3001`.
- **Create React App** — `package.json` `"proxy": "http://localhost:3001"` (note: CRA proxy is limited; prefer Vite or manual proxy).
- **Any** — call from a **Next.js API route** or **server component** so the secret key stays server-side if you add a BFF later (this repo does not include a BFF).

From the browser, use `fetch` / `axios` with **`FormData`**: append the file as field name **`image`**, optional text fields **`studentId`**, **`classId`** on session create.

## API overview

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/health` | Liveness |
| `POST` | `/api/sessions` | Create session from initial screenshot |
| `GET` | `/api/sessions/:sessionId` | Full session + embedded evaluations |
| `POST` | `/api/sessions/:sessionId/screenshots` | Upload work-in-progress screenshot |
| `GET` | `/api/sessions/:sessionId/evaluations` | List evaluation records |

See [API_CONTRACT.md](./API_CONTRACT.md) for request/response shapes. For copy-paste **HTTP / `fetch` / `curl` templates**, use [REQUEST_TEMPLATES.md](./REQUEST_TEMPLATES.md).

## Example: `curl`

Replace `./problem.png` with a real image path.

### 1) Health

```bash
curl -sS -X POST http://localhost:3001/health
```

### 2) Create session (initial screenshot)

```bash
curl -sS -X POST http://localhost:3001/api/sessions \
  -F "image=@./problem.png" \
  -F "studentId=demo-student" \
  -F "classId=demo-class"
```

Save `sessionId` from the JSON response as `SID`.

### 3) Progressive screenshot

```bash
curl -sS -X POST "http://localhost:3001/api/sessions/$SID/screenshots" \
  -F "image=@./work-in-progress.png"
```

### 4) Fetch session

```bash
curl -sS "http://localhost:3001/api/sessions/$SID"
```

### 5) List evaluations only

```bash
curl -sS "http://localhost:3001/api/sessions/$SID/evaluations"
```

## Example flow (session → two evaluations)

1. **POST `/api/sessions`** with the blank problem sheet → response includes `sessionId` and `sourceOfTruth` (canonical steps + final answer metadata).
2. **POST `/api/sessions/:id/screenshots`** with a photo after the student writes the first line → JSON: `progressPercent`, `reason`, `category`, `confidenceScore`, `confusionHighlights`.
3. **POST** again with a later photo → fields update; **GET** `/api/sessions/:id` returns latest aggregates plus full `evaluations` history.

In **mock** mode, `progressPercent` trends upward on successive calls so UI demos show progression without billing.

## Project layout

```
src/
  routes/          # HTTP routes
  services/ai/     # OpenAI + mock + solver/evaluator
  services/storage/# Local file writes
  services/session/# In-memory store
  schemas/         # zod schemas (AI + API)
  types/           # Session types
  lib/             # env, server bootstrap
```

## Errors (common)

- **400** — missing `image` field or non-image MIME type.
- **404** — unknown `sessionId`.
- **502** — OpenAI failure or JSON that fails zod validation (details may include zod `flatten()` output).

## License

Hackathon / educational use — adjust as needed for your team.
