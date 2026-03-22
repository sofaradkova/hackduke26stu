# Runbook

## Deployment

The app is a static Vite SPA deployed to Vercel.

### Deploy to Vercel

```bash
npm run build          # verify build passes locally first
vercel --prod          # or push to main — Vercel auto-deploys on push
```

The production URL is `https://hackduke26stu.vercel.app/` (also used by the iOS whiteboard companion app).

### Required Vercel Environment Variables

Set these in the Vercel project dashboard under **Settings → Environment Variables**:

| Variable | Required |
|----------|----------|
| `VITE_SUPABASE_URL` | Yes |
| `VITE_SUPABASE_ANON_KEY` | Yes |
| `VITE_SUPABASE_SCREENSHOT_BUCKET` | No (default: `screenshots`) |
| `VITE_AI_PROVIDER` | No (default: `local`) |
| `VITE_OPENAI_API_KEY` | Only if `VITE_AI_PROVIDER=openai` |
| `VITE_OPENAI_MODEL` | No (default: `gpt-4o`) |

## Supabase Setup

1. Create a Supabase project
2. Create a storage bucket named `screenshots` (or your configured bucket name)
3. Create the `student_snapshots` table:

```sql
create table student_snapshots (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  student_name text,
  taken_at timestamptz not null,
  image_path text,
  ai_caption text,
  created_at timestamptz default now()
);
```

4. Set bucket RLS to allow insert from anon key, or configure RLS policies as needed.

## Common Issues

### App loads but screenshots are not saved

- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly
- Check the browser console for "Supabase upload failed" errors
- Verify the storage bucket exists and the anon key has insert permission

### AI captions not appearing (local mode)

- Verify the MLX server is running: `curl http://127.0.0.1:8081/v1/models`
- Check `VITE_MLX_BASE_URL` and `VITE_MLX_MODEL_ID` match your server config
- Enable `VITE_DEBUG=true` and check the in-app debug overlay

### AI captions not appearing (OpenAI mode)

- Confirm `VITE_AI_PROVIDER=openai` and `VITE_OPENAI_API_KEY` is set
- Check the browser network tab for 401/429 responses from `api.openai.com`
- Note: the API key is exposed in the browser bundle — use a backend proxy for production

### iOS whiteboard app cannot connect

- Confirm the Vercel deployment is live at `https://hackduke26stu.vercel.app/`
- The URL is hardcoded in `whiteboardapp/whiteboarddmain/Whiteboard/ContentView.swift` line 9

## Rollback

Vercel keeps deployment history. To roll back:

```bash
vercel rollback        # reverts to the previous production deployment
```

Or pin a specific deployment in the Vercel dashboard.
