# TC Command — Build Plan
> Last updated: March 2026 | Status: Active

---

## Guiding Principles
- **Safety first:** No more direct-to-main pushes, no more production DB patches without staging tests
- **Ship working features, not rewrites:** New modules get proper architecture; existing working code is left alone
- **AI-assisted development:** Every push by Tasklet follows the pre-push checklist before going to GitHub

---

## Phase 0 — Build Safety Rails
> **Goal:** Stop production surprises before they happen
> **Timeline:** Week 1 (Complete ASAP)

| # | Task | Owner | Notes |
|---|------|-------|-------|
| 0.1 | Create `develop` branch in GitHub | Tasklet | All feature work goes here first |
| 0.2 | Protect `main` branch — require PR to merge | Andre | GitHub repo settings |
| 0.3 | Create staging Supabase project | Tasklet + Andre | Free tier, separate credentials |
| 0.4 | Add staging env vars to Vercel and Railway | Andre | Tasklet provides list of vars needed |
| 0.5 | Add `docs/CHANGELOG.md` to repo | Tasklet | Track every production deploy |
| 0.6 | Add release checklist to repo (`docs/release-checklist.md`) | Tasklet | The checklist from the playbook |
| 0.7 | Add `docs/maintenance-playbook.md` to repo | Tasklet | This document |

**Success criteria:** Next feature push goes through `develop` → PR → preview test → `main`. Zero direct pushes.

---

## Phase 1 — Email System Hardening
> **Goal:** Email system works correctly every time, no bad data reaches clients
> **Timeline:** Week 1–2

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Fix buyer/seller name merge tags resolving from deal data | 🔴 Todo | `[Buyer Name]` still shows as unresolved |
| 1.2 | Fix seller agent / attorney name merge tags | 🔴 Todo | Same issue as buyer/seller |
| 1.3 | Fix duplicate email logging in `email_send_log` | 🔴 Todo | Same email logged twice |
| 1.4 | Replace hardcoded signatures with `{{tcTeamSignature}}` | ✅ Done | All 9 templates updated |
| 1.5 | Add `email.merge_tag.unresolved` logging | 🔴 Todo | Log when any `{{tag}}` doesn't resolve — catch problems before client sees them |
| 1.6 | Audit all merge tags in templates vs. available data | 🔴 Todo | Confirm every tag in every template has a data source |

---

## Phase 2 — Request Center Integrity
> **Goal:** Request Center is reliable, stateful, and client-safe
> **Timeline:** Week 2–3

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Enforce state machine on request status changes | 🔴 Todo | No skipping states |
| 2.2 | Audit `request_events` logging — confirm all transitions are recorded | 🔴 Todo | |
| 2.3 | Add `created_by`, `reviewed_by` audit fields to requests | 🔴 Todo | Apply migration to staging first |
| 2.4 | Confirm inbound reply-to-request matching works correctly | 🔴 Todo | Smoke test with real email thread |
| 2.5 | Document reject → needs_follow_up flow | 🔴 Todo | Ensure rejected docs don't silently close |

---

## Phase 3 — Callback System Hardening
> **Goal:** Callback workflows are reliable and logged end-to-end
> **Timeline:** Week 3

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Enforce `open → acknowledged → completed` state path | 🔴 Todo | |
| 3.2 | Confirm `callback_attempts` logs all outcomes | 🔴 Todo | Include failed attempts |
| 3.3 | Twilio webhook signature validation | 🔴 Todo | Security requirement |
| 3.4 | Admin debug page for Twilio webhook logs | 🔴 Todo | Internal only, admin auth required |

---

## Phase 4 — Observability
> **Goal:** Know when something breaks before a client notices
> **Timeline:** Week 3–4

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Structured logging for all workflow events | 🔴 Todo | Replace ad-hoc console.log |
| 4.2 | Add Sentry for frontend + backend error tracking | 🔴 Todo | Frontend: Vercel, Backend: Railway |
| 4.3 | Internal admin/debug pages | 🔴 Todo | Request Events, Callback Attempts, Unmatched Items |
| 4.4 | Sent History in deal-log (email audit trail) | ✅ Done | All emails visible with preview |

---

## Phase 5 — Architecture Migration (Incremental)
> **Goal:** New modules use proper domain structure; existing code migrated when touched
> **Timeline:** Ongoing, starting Week 4

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | New modules start in `src/modules/{domain}/` pattern | 🔴 Ongoing | Deals, Requests, Docs, Comms |
| 5.2 | Extract deal service logic from components → `modules/deals/services/` | 🔴 Todo | Do when next major deal feature ships |
| 5.3 | Extract request service logic → `modules/requests/services/` | 🔴 Todo | Do alongside Phase 2 |
| 5.4 | Shared types move to `src/shared/types/` | 🔴 Todo | Incremental — don't break existing imports |
| 5.5 | Monorepo split (`apps/web` + `apps/api`) | ⏸ Parked | Revisit Q3 2026 when Railway backend grows |

---

## Phase 6 — Client Features (Product Roadmap)
> **Goal:** Expand what TC Command can do for agents and their clients
> **Timeline:** Starting Month 2+

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 6.1 | Document intake & review queue | High | Inbound docs matched to requests |
| 6.2 | Client portal (read-only deal status) | High | Agents share link with buyers/sellers |
| 6.3 | Billing module | Medium | Track TC fees per deal |
| 6.4 | Agent onboarding flow | Medium | Guided setup for new agent-clients |
| 6.5 | Automated workflow rules (triggers) | Medium | Auto-send emails on milestone events |
| 6.6 | MLS integration | Low | Pull deal data from MLS |

---

## Current Active Bugs

| ID | Severity | Module | Issue |
|----|----------|--------|-------|
| BUG-001 | P2 | Emails | `[Buyer Name]` / `[Seller Name]` not resolving in templates |
| BUG-002 | P2 | Emails | `[Seller Agent Name]` / `[Attorney Name]` not resolving |
| BUG-003 | P2 | Emails | Duplicate entries in `email_send_log` |

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Mar 2026 | No direct pushes to main | Two broken Vercel builds from direct pushes |
| Mar 2026 | Monorepo split parked until Q3 | High disruption risk for active prod app |
| Mar 2026 | Skip E2E tests for now | Too time-intensive; start with smoke test checklist |
| Mar 2026 | Skip Sentry until Phase 4 | Supabase logs sufficient short-term |
| Mar 2026 | Skip feature flags for now | Premature at current scale |
| Mar 2026 | Hardcoded signatures → `{{tcTeamSignature}}` | All 9 templates updated via DB migration |

---

*Maintained by Tasklet — update this document with every major decision or completed phase.*
