# Questions for Dan — May 6 readiness

> Last refreshed: while you were at lunch.
> Live site: https://empower-revenue.vercel.app
> Local dev: still running on http://localhost:3000

---

## ✅ What's done in MVP

- Schema, RLS, seed (7 channels, 6 branches, 10 sources, all Quantum allocations from your sheet's Milestone 1)
- Magic-link auth via Resend SMTP, you're signed in as admin (`drforce8@gmail.com`)
- Quantum Accountability table at `/` with Last Week / MTD / QTD per channel, gap chips, two reconciled footer totals (Solar+Battery vs All Products), week picker
- Channel detail at `/channel/[id]` with 8-week history, source/branch breakdowns, notes
- Owner input form at `/channel/[id]/edit` (auth-gated, dynamic to each channel's `metrics_schema`)
- Jobflo CSV/XLSX upload at `/upload` with column-alias detection ported from your forecast artifact
- Settings (admin-only) read-only allowlist + channel index
- **Realtime updates**: home page auto-refreshes the moment any owner submits, no reload needed
- **"Last entered" chips** per channel so David sees who's been recently active during the call
- **Submission status** chip ("X / 7 submitted") at top of the table
- Brand redesign with Empower logo, navy + cyan palette, light entrance animations, sticky glass header

## 🚧 Blocking decisions (need your call)

### 1. Domain verification for Resend

Right now you can only sign in with `drforce8@gmail.com` because Resend's free-tier "test sender" only delivers to your signup email. To let owners (David, Jon, Zach, Zant, Nick, Quade, Brad) sign in with their `@empoweryourhome.com` emails, we need to verify a domain in Resend.

**Options:**
- **A) Verify `empoweryourhome.com` root domain** — Resend gives you 3 DNS records (SPF, DKIM, DMARC); your IT/ops adds them at the registrar. ~10 min DNS work, propagates in minutes-to-hours. After that, sender becomes `noreply@empoweryourhome.com`.
- **B) Verify a subdomain like `mail.empoweryourhome.com`** — same 3 records but on a subdomain you might own outright; doesn't touch the main email config. Sender becomes `noreply@mail.empoweryourhome.com`.
- **C) Use a separate domain you control** — same flow, different domain.

Which path do you want? If A or B, who at Empower has DNS access?

### 2. Logo variant

I picked `Logo_Services_Dark Text.svg` from your Downloads — that's the "EMPOWER · SOLAR | HVAC | ELECTRICAL | ROOFING" version. Your original screenshot showed "EMPOWER HOME SERVICES." I have these other variants in Downloads ready to swap in:

- `Logo_Primary_Dark Text.svg` — likely just "EMPOWER" wordmark, no tagline
- `Logo_Primary_Stacked_Dark Text.svg` — stacked/square layout (icon above text)

Want me to swap to a different one?

### 3. Quantum allocations — sanity check

From your Quantum sheet's Milestone 1 (Jan-Jun 2026), I doubled monthly install targets for the 50% pull-through (deals = installs × 2) and divided by 4 weeks to get the seeded weekly targets:

| Channel | Weekly | Monthly |
|---|---:|---:|
| Total Sales (Solar+Battery) | 131 | 523 |
| Inside Sales | 7 | 26 |
| HVAC | 20 | 80 |
| Roof | 33 | 132 |
| Dealer | 71 | 282 |
| Internal | 37 | 148 |
| IP | 17 | 68 |

The 131 for Total Sales matched your spec example exactly. Are the rest right, or do you want to tweak any?

### 4. User invites — when?

You said wait until final phase. But for the May 6 call to actually work, owners need to enter Sunday/Monday numbers. That means we need them invited at least 24h before. Best moments:

- **Wed/Thu (Apr 29-30):** invite all owners now, give them time to test login and bookmark
- **Fri (May 1):** invite owners with a Friday-evening reminder
- **Sun (May 4):** day-before invite, risky if anyone has email issues

(All require domain verification first, see #1.)

I have the channel-owner mapping ready — I just need their emails:

| Channel | Owner | Email needed? |
|---|---|---|
| Total Sales | David Force | ✅ |
| Inside Sales | Jon Shields | ✅ |
| HVAC | Zach Vogl | ✅ |
| Roof | Zant Doty | ✅ |
| Dealer | Dan Force | (you're already in) |
| Internal | Nick Gifford / Quade Foster | ✅ for both |
| IP | Brad Morris | ✅ |

## 📋 Spec §9 open questions (Phase 2 — not blocking May 6)

These came from the original spec and don't affect Phase 1 / the May 6 call:

1. **Solar sub-categories** — Jon mentioned "three sub-types" he wants to break Solar into. Confirm what they are (PV / Battery / Both? New / Add-on / Service-upgrade?) when Phase 2 starts.
2. **Forecast lock policy** — Sunday 6pm? End of month? Editable with reason after lock?
3. **Excluded names** — you said exclude Todd & Statler from Inside Sales KPIs. Are there others? Schema has `excluded_from_kpi` column ready; we just don't use it in MVP rollups.
4. **Maintenance MRR rollup** — does $19.99 × subscribers contribute to All Products total, or tracked separately? Affects HVAC channel's footer contribution.

## 🎨 Design / UX questions

5. **"Freeze for meeting" toggle** — spec mentions this (lock state at meeting start so numbers don't shift mid-call). I deferred it. Do you want it for May 6, or skip?
6. **Multi-week trend charts on channel detail** — I left them out for MVP. The 8-week history table conveys the same info. Want sparklines/charts before May 6, or hold for Phase 2?
7. **Mobile-first or desktop-first for the call?** — does David run the call from laptop or phone? Drives whether I need to invest more in mobile table layout.

## 🧹 Brain corrections noted (your call whether to fix)

- **Cameron Smiley wiki page** in Brain says he owns "$250M-by-2028 revenue dashboard." You said that's bad intel — David Force owns it. Want me to fix the wiki page?
- Brain doesn't have wiki entries yet for: Jon Shields, Zach Vogl, Quade Foster, Brad Morris (just Dave Yates / Zant Doty / Nicholas Gifford / Cameron Smiley exist). Can be addressed by `auto-organize-knowledge` skill over time, no action needed now.

## 🤔 Things I noticed during build worth your input

8. **HVAC complexity** — channel has 7 metrics tracked (service, service_revenue, install, install_revenue, install_collected, maintenance_subs, maintenance_mrr). For May 6, will Zach actually fill all 7 or just install/service counts? If just counts, the form's currency fields will look unused; if you want all, we should make sure Zach knows.
9. **Dealer source attribution from Jobflo upload** — the upload currently writes only to the Total Sales channel (single bucket). Per-source attribution to the Dealer channel (so we can see Empower X vs Genesis vs Ion etc.) needs a rep → source mapping that I don't have. Do you want this for May 6, or can it wait? If wanted: send me a list of which reps belong to which source/dealer.
10. **Service-role key** — for some admin operations (e.g., bulk inserting users, regenerating session links if Resend ever has issues), having the Supabase service_role key in `.env.local` makes things smoother. Want to drop it in, or keep that air-gapped?

## 🧪 Smoke tests still pending

- [ ] Drop a real Jobflo customer-export file at `/upload` and confirm Total Sales row shows real numbers (not "—")
- [ ] You enter test numbers as one of the channel owners (e.g., "Dealer" since you own that one) and verify the table updates in real-time
- [ ] Verify the channel detail page shows source/branch breakdown correctly with real data

I can drive #2 (insert a test metric via SQL and you watch the home page update). #1 needs you to drop a file. Let me know when you're back.
