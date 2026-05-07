# The Empower Revenue Dashboard

The Empower team's live revenue surface — owners enter their numbers, the
dashboard rolls everything up, the team runs the weekly call from it.

**Quantum Accountability** is the first feature: it replaces David's hand-built
weekly table and powers the Monday revenue call. Other features (forecast
capture, accuracy leaderboard, source/branch breakdowns, the forecast tool)
sit alongside it as the dashboard grows.

**Stack:** Next.js 16 (App Router) + Supabase Postgres + Auth (magic link) +
Vercel Fluid Compute. Tailwind v4 for UI.

**Spec:** [empower-revenue-dashboard-spec.md](/Users/danielforce/Downloads/empower-revenue-dashboard-spec.md)
**Plan:** [users-danielforce-downloads-empower-rev-virtual-origami.md](/Users/danielforce/.claude/plans/users-danielforce-downloads-empower-rev-virtual-origami.md)

## First-time setup

1. Create a Supabase project at https://supabase.com (free tier is fine).
2. Copy `.env.local.example` to `.env.local` and fill in the URL + anon key
   from the project's **Settings → API** page.
3. Link the local Supabase CLI to the project:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```
4. Push migrations to create the schema, RLS, and seed data:
   ```bash
   npx supabase db push
   ```
5. Insert your first admin row in Supabase Studio (table editor → `public.users`):
   ```sql
   insert into public.users (id, email, name, role)
   values (
     '<your-auth.users-id>',
     'dan@empoweryourhome.com',
     'Dan Force',
     'admin'
   );
   ```
   The `id` must match an existing row in `auth.users` — sign in once via
   `/login` first to create the auth row, then copy that uuid.
6. Configure Supabase Auth → URL Configuration:
   - **Site URL**: `http://localhost:3000` (and the production URL once deployed)
   - **Redirect URLs**: `http://localhost:3000/login/confirm`,
     `https://empower-revenue.vercel.app/login/confirm`
7. Run dev:
   ```bash
   npm run dev
   ```

## Pages

- `/` — Quantum Accountability table (the meeting view)
- `/channel/[id]` — Channel detail (recent weeks, source/branch breakdown, notes)
- `/channel/[id]/edit` — Owner input form (auth-gated to channel owner / admin)
- `/upload` — Jobflo CSV/XLSX upload (writes to Total Sales channel)
- `/settings` — Admin-only allowlist + channel index
- `/login` — Magic link request

## Adding a user (Phase 1.5 — defer until late in build)

User invites are intentionally last. Seed `public.users` only with Dan's admin row
to start (so the dashboard isn't dead). Other users get added closer to go-live
once the data flow is verified end-to-end.

When ready, in Supabase Studio:

1. Have the user sign in once at `/login` (creates `auth.users` row but middleware
   bounces them with `?error=not_allowed`).
2. Copy their `auth.users.id` from the dashboard.
3. Insert into `public.users` with `role` and `channels[]`.
4. They can sign in again immediately.

## Phase 1 scope

Done in MVP: schema, RLS, magic-link auth, allowlist, owner forms, upload,
table view with MTD/QTD, footer totals.

Deferred: charts, freeze-for-meeting, forecast capture, accuracy leaderboard,
forecast-tool port, Inside Sales detail, exclusion logic, settings deep-edit,
email reminders, direct Jobflo integration. See plan for full deferral list.
