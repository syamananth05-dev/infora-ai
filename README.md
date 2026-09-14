# Synapse — Personal AI Intelligence Platform

A model-agnostic, multi-tenant personal AI platform: **Vite + React + TypeScript** frontend, **Netlify Functions** serverless backend, **Supabase** (Postgres + RLS + Storage + Auth), and **OpenRouter** as the single LLM gateway (chat + embeddings-ready).

Phase 1 features (all real, no mocks):

- Email/password + Google OAuth authentication (Supabase Auth, PKCE)
- Multi-tenant data isolation via Postgres Row Level Security
- Streaming chat via OpenRouter (SSE), rendered as Markdown with syntax highlighting
- Model selection from the live OpenRouter model list (cost, context, vision/reasoning badges)
- Conversation history with data grouping, pin, rename, archive, delete, export
- **Branching**: fork any conversation at any message (tree-structured messages)
- Regenerate responses, stop generation mid-stream
- File attachments: image analysis (vision models) + private file storage per user
- Projects with per-project syste instructions injected into chats
- Usage tracking (tokens, estimated cost, latency) per user and per model
- Admin panel (aggregated usage only — never message content)
- Command palette (Cmd/Ctrl+K), dark/light themes, responsive mobile layout

Later phases (not fake-implemented): memory/knowledge base (Phase 2), web research + citations + model comparison (Phase 2), agents/tools/approvals/workflows (Phase 3), deep research + MCP + coding workspace (Phase 4).

---

## 1. Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) account (Free tier works for testing; Pro recommended for real use — free projects pause after 7 days of inactivity)
- An [OpenRouter](https://openrouter.ai) account and API key
- A [Netlify](https://netlify.com) account
- A GitHub account (to host the repo)

## 2. Supabase setup

1. Create a new project (remember the database password).
2. Open **SQL Editor** → paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
   This creates: tables (`profiles`, `projects`, `conversations`, `messages`, `api_usage`), RLS policies, the `user-files` storage bucket + policies, and usage RPCs.
3. (Optional, for Google login) **Authentication → Providers → Google**: enable it and follow the instructions to create a Google OAuth client. Set the redirect URL shown in the Supabase UI. Also add `http://localhost:8888/auth` and your deployed URL under **Authentication → URL Configuration → Redirect URLs**.
4. Note down from **Settings → API
*:
   - Project URL → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server-side only**)

## 3. Netlify deployment

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import an existing project** → pick the repo. Build settings are auto-detected from `netlify.toml` (build: `npm run build`, publish: `dist`, functions: `netlify/functions`).
3. **Site settings → Environment variables** — add:

   | Variable | Value | Scope |
   |---|---|---|
   | `OPENROUTER_API_KEY` | your OpenRouter key | server onl= }
   | `SUPABASE_URL` | `https://<ref>.supabase.co` | server |
   | `SUPABASE_ANON_KEY` | anon public key | server |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key | server onl= }
   | `VITE_SUPABASE_URL` | same as `SUPABASE_URL` | build |
   | `VITE_SUPABASE_ANON_KEY` | same as `SUPABASE_ANON_KEY` | build |
   | `OPENROUTER_DEFAULT_MODEL` (optional) | e.g. `openai/gpt-4o-mini` | server |
   | `APP_URL` (optional) | your site URL | server |

4. Deploy. Sign up, pick a model, and chat.

The OpenRouter key is **only** read inside the Netlify Functions (`netlify/functions/_lib/openrouter.ts`). It is never bundled into the client, never returned by any API response, and the browser only ever holds your Supabase anon key and the user's own JWT.

## 4. Local development

```bash
cp .env.example .env      # fill in your Supabase values
npm install
npx netlify dev           # serves frontend + functions with env from netlify.toml/.env
```

`npm run check` type-checks the frontend and functions. `npm run build` produces `dist/ .

## 5. Making yourself an admin

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Then the **Admin** link appears in Settings, showing aggregate usage across all users (never message content).

## 6. Project structure

```
netlify/functions/    serverless API (chat SSE stream, models, shared libs)
  _lib/               auth, Supabase clients, OpenRouter gateway (key lives here)
supabase/migrations/  SQL schema + RLS + storage policies + RPCs
src/                  React SPA
  routes/             landing, auth, dashboard, chat, projects, settings, admin
  components/         sidebar, command palette, chat components
  lib/                supabase client, SSE stream consumer, stores, types
```

## 7. Security model

- Every `/api/*` call verifies the caller's Supabase JWT server-side before touching OpenRouter.
- All user-scoped tables have RLS: `user_id = auth.uid()`. Even a buggy query cannot read another user's rows.
- The storage bucket is private; each user can only read/write their own folder.
- Uploads are validated (25 MB cap, ≤4 images per message as data URLs).
- Per-user rate limit: 30 chat requests per minute (enforced in `chat.ts` + `api_usage`).
- Markdown is rendered with `react-markdown` (no raw HTML injection).

## 8. Cost awareness

Every chat turn records tokens and an estimated cost (from live OpenRouter pricing) into `api_usage`, visible in **Settings → Usage** and (aggregated) in Admin. Set a credit limit in your OpenRouter dashboard to hard-cap spend.
