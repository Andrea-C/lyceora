# Lyceora

Adaptive bilingual math-learning platform. **M1** is the "Recupero Matematica — Scuola Media" path for a 13-year-old, built on the [os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) knowledge graph with an AI teacher and assessor over the AG-UI protocol.

> **Resuming development?** Start with [`docs/lyceora-development-report.md`](docs/lyceora-development-report.md) — full build history, the map of all spec/design/plan documents, decisions that supersede them, current verified state, and the outstanding-work checklist.

## Local Development

### Prerequisites
- Node.js >= 22
- pnpm >= 10

### Quickstart

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start the local database server** (in one terminal):
   ```bash
   pnpm --filter @lyceora/db db:dev
   ```
   This starts a PGlite-over-TCP socket server on port 5502. Wait for the "ready" log message.

3. **Apply schema migrations** (in another terminal):
   ```bash
   pnpm --filter @lyceora/db db:migrate
   ```

4. **Set up environment** (`apps/web/.env.local`):
   ```bash
   # Copy .env.example and fill in values. For keyless development:
   LYCEORA_FAKE_MODELS=1
   ```
   See `.env.example` for all variables. Minimal `.env.local`:
   ```
   DATABASE_URL=postgres://postgres:postgres@localhost:5502/postgres
   BETTER_AUTH_SECRET=dev-secret-32-chars-or-longer
   BETTER_AUTH_URL=http://localhost:3000
   LYCEORA_FAKE_MODELS=1
   ```

5. **Start the app:**
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Testing

- **Unit tests:** `pnpm test`
- **E2E tests (with fake models):** `pnpm --filter web test:e2e`
- **Evaluation metrics (requires real API key):** Set `ANTHROPIC_API_KEY` and run test scripts in `packages/agents/evals/`.

## Architecture

- **`packages/taxonomy`** — Knowledge graph: math topics, prerequisites, learning objectives.
- **`packages/engine`** — Mastery estimation, diagnostic routing, lesson composition.
- **`packages/db`** — Postgres schema (Drizzle ORM), migrations, PGlite dev server.
- **`packages/agents`** — AI teacher/assessor agents, grading logic, AG-UI protocol.
- **`apps/web`** — Next.js app: signup, child profiles, lessons, teacher chat, parent dashboard. Bilingual (Italian/English).

## Deployment

### Prerequisites
- Neon Postgres account (create project in `eu-central-1` region).
- Vercel account.

### Steps

1. **Create Neon project** and note the `DATABASE_URL`.

2. **Create Vercel project** from this repository:
   - Root directory: `apps/web`
   - Vercel auto-detects the pnpm monorepo.

3. **Apply migrations** against production database (set `DATABASE_URL` for the shell you're using, then run the migration):

   bash / macOS / Linux:
   ```bash
   export DATABASE_URL=<your-neon-url>
   pnpm --filter @lyceora/db db:migrate
   ```

   PowerShell (Windows):
   ```powershell
   $env:DATABASE_URL = "<your-neon-url>"
   pnpm --filter @lyceora/db db:migrate
   ```

4. **Set environment variables** in Vercel:
   - `DATABASE_URL` — Neon connection string.
   - `BETTER_AUTH_SECRET` — Generate 32+ random characters (e.g., `openssl rand -base64 32`).
   - `BETTER_AUTH_URL` — Your Vercel domain (e.g., `https://lyceora.vercel.app`).
   - `ANTHROPIC_API_KEY` — Your Anthropic API key.
   - (Optional) `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` for provider variety.

5. **Smoke-test the deployment** (both locales):
   - Signup with a child profile.
   - Run diagnostic (≤20 questions).
   - Verify teacher chat streams tokens in Network tab (`RUN_STARTED`...`RUN_FINISHED`).
   - Check lesson page: videos render, exercises grade, XP increments.
   - Verify parent page shows the child.
   - Confirm footer shows ODbL attribution.

## Attribution

This project incorporates data from the [os-taxonomy](https://github.com/withmarbleapp/os-taxonomy) project (Marble), licensed under:
- **Database structure (topics, prerequisites):** Open Database License 1.0 (ODbL 1.0)
- **Content (topic names, descriptions):** Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)

See `packages/taxonomy/data/os-taxonomy/PROVENANCE.md` for per-source curriculum-standards licensing details and required attributions for embedded third-party standards (UK National Curriculum, Common Core, etc.).

## License

App code license is TBD by the owner.
