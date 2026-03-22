# Contributing

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
git clone https://github.com/sofaradkova/hackduke26stu.git
cd hackduke26stu
npm install
cp .env.example .env   # then edit .env with your values
```

## Available Scripts

<!-- AUTO-GENERATED from package.json scripts -->
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite development server with hot reload (default: http://localhost:5173) |
| `npm run build` | Production build — outputs to `dist/` |
| `npm run preview` | Serve the production build locally for inspection |
<!-- END AUTO-GENERATED -->

## Environment Variables

See [`.env.example`](../.env.example) for the full reference. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_SUPABASE_URL` | Yes (for storage) | — | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes (for storage) | — | Supabase anonymous key |
| `VITE_SUPABASE_SCREENSHOT_BUCKET` | No | `screenshots` | Storage bucket name |
| `VITE_AI_PROVIDER` | No | `local` | `local` or `openai` |
| `VITE_MLX_BASE_URL` | No | `http://127.0.0.1:8081` | Local MLX server URL |
| `VITE_MLX_MODEL_ID` | No | `mlx-community/Qwen3.5-0.8B-MLX-8bit` | Local model ID |
| `VITE_OPENAI_API_KEY` | Only if `openai` | — | OpenAI API key |
| `VITE_OPENAI_MODEL` | No | `gpt-4o` | OpenAI model ID |
| `VITE_DEBUG` | No | `false` | Show in-app debug log overlay |

## Running the Local AI Server

When `VITE_AI_PROVIDER=local`, the app expects an OpenAI-compatible HTTP server at `VITE_MLX_BASE_URL`. Start one with [MLX LM](https://github.com/ml-explore/mlx-examples/tree/main/llms/mlx_lm):

```bash
mlx_lm.server --model mlx-community/Qwen3.5-0.8B-MLX-8bit --port 8081
```

## Project Structure

```
src/
  App.jsx           — Main application component
  main.jsx          — React entry point
  supabaseClient.js — Supabase client initialisation
  theme.js          — MUI theme configuration
  index.css         — Global styles
scripts/
  testOpenAIModels.js — Manual script to benchmark vision models
whiteboardapp/      — Native iOS whiteboard companion app (Swift)
```

## Code Style

- Immutability preferred: create new objects rather than mutating in place
- Files should stay under 800 lines; extract into focused modules when approaching that limit
- Functions should stay under 50 lines
- All user-visible errors must display a user-friendly message; never silently swallow errors

## Pull Request Checklist

- [ ] `npm run build` passes with no errors
- [ ] No new secrets or API keys committed
- [ ] User-facing error paths show feedback to the user
- [ ] New env vars added to `.env.example`
