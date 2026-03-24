# TC Command — Technical Maintenance Playbook

> Stack: Vercel (frontend) · Railway (backend/Twilio) · Supabase (DB/Auth) · GitHub · Twilio

---

## 1. Architecture Principles

One product, multiple workflow-heavy modules: deals, requests, communications, callbacks, documents, client accounts, billing, integrations.

**Non-negotiables:**
- Organize by domain (deals, requests, documents, communications, callbacks, billing, client accounts)
- Business logic lives in service layers — not in React components or route handlers
- One source of truth per concept (Request Center owns request status; email inbox does not)
- Keep configuration externalized: templates, status maps, routing rules in config/metadata, not buried in code
- Deterministic workflow logic first; AI only where genuine ambiguity exists

**Architecture posture:**
- Vercel — app UI and preview deployments
- Railway — always-on webhook and Twilio call workflows
- Supabase — Postgres, Auth, Storage, Realtime
- GitHub — source control, PRs, issue tracking, release discipline

---

## 2. Repository & Folder Structure

**Current structure (where we are today):**
```
src/
  App.tsx              # main app router
  app/                 # Next.js app dir (deal-log, email tools, etc.)
  components/          # shared UI components
  config/              # config files
  contexts/            # React contexts
  hooks/               # reusable hooks
  lib/                 # utilities and clients
  types.ts             # shared types
  utils/               # helper functions
```

**Target structure (migrate new modules to this pattern, don't rewrite existing):**
```
src/
  modules/
    deals/
      components/      # UI scoped to deals
      services/        # deal business logic
      hooks/
      types.ts
    requests/
      components/
      services/
      hooks/
      types.ts
    communications/
    callbacks/
    documents/
  shared/
    components/        # globally reused UI
    utils/
    types/
  app/                 # Next.js pages/routes
supabase/
  migrations/          # ALL schema changes tracked here
docs/                  # runbooks, checklists, architecture notes
```

> **Rule:** Don't touch working existing code during restructure. All *new* modules get the proper pattern from day one. Migrate existing modules one at a time when they need significant changes.

---

## 3. Environment Strategy

Three environments: **local → staging → production**

| Layer | Local | Staging | Production |
|---|---|---|---|
| Vercel | localhost | PR preview URL | main branch |
| Railway | local server | staging service | prod service |
| Supabase | local or staging project | separate staging project | prod project |
| Twilio | test credentials | staging webhook endpoints | prod webhooks |

**Rules:**
- Never use production Supabase credentials for development or testing
- Never mix staging/prod Twilio webhooks or API keys
- Secrets only in platform-managed env vars — never in code
- `.env.local` for local dev; `.env.staging` for staging; production secrets via Vercel/Railway dashboard only

---

## 4. Deployment Flow

### Branch Strategy
```
main        ← production-only, protected
develop     ← integration branch, merges to main
feature/*   ← new features branch from develop
bugfix/*    ← bug fixes branch from develop (or main for P1)
```

**No direct pushes to main.** PRs only, reviewed and tested first.

### Feature Flow
1. Create GitHub issue
2. Create `feature/` branch from `develop`
3. Build and test locally
4. Open PR → Vercel generates preview URL
5. Smoke test preview URL
6. Merge to `develop`
7. Test on staging
8. PR from `develop` → `main` when ready to release
9. Monitor logs after deploy

### Bugfix Flow
1. Create bug ticket with severity (P1/P2/P3) and reproduction steps
2. Create `bugfix/` branch
3. Patch smallest responsible layer
4. Retest in staging
5. Deploy with release note

### AI-Assisted Development Protocol
Since Tasklet is the primary builder, these rules apply before every push:

- ✅ Run `npm run build` locally and confirm zero errors before pushing
- ✅ Verify every imported file is committed to the repo (not just the local agent filesystem)
- ✅ After any DB migration, confirm with a SELECT that it applied correctly
- ✅ Never claim something is deployed until Vercel shows a green build
- ✅ Check the release checklist before merging to main
- ✅ After any merge tag changes, update the deal-log merge tag reference panel in the same push

---

## 5. Database & Migration Discipline

- Track **every** schema change as a migration in `supabase/migrations/`
- Never patch production tables manually without creating a migration file
- Name migrations clearly: `add_company_to_deal_data`, `replace_hardcoded_signatures`
- Test migrations in staging Supabase first before applying to production
- Document allowed status transitions before shipping schema changes on workflow tables

**Core tables requiring extra discipline:**

| Table | Why it matters |
|---|---|
| `deals` | Central source of truth for all transaction data |
| `requests` / `request_events` / `request_documents` | Controls Request Center workflow |
| `callback_requests` / `callback_attempts` | Manages client callback state |
| `email_templates` | Used for all outbound client communications |
| `email_send_log` | Audit trail for all sent emails |
| `workflow_rules` / `workflow_executions` | Automation logic |
| `contacts` | Source of truth for agent/party data |

---

## 6. Testing Strategy

**What we actually do (pragmatic for current team size):**

1. **TypeScript build check** — `npm run build` must pass before every push. This is the minimum bar.
2. **Critical path smoke tests** — Manual checklist run before every production release (see Section 13).
3. **Staging environment tests** — Run the smoke tests against staging before merging to main.

**What we skip for now:**
- Unit tests (add when Request Center and Callback modules get their service layers)
- E2E with Playwright (add after architecture is more stable — estimated Q3 2026)
- Integration test suite (add incrementally with new modules)

**Smoke test scenarios:**
- Create a deal and verify all deal_data fields populate correctly
- Send an intro email and verify merge tags resolve (no `[Buyer Name]` placeholders)
- Create a request from a deal — confirm task + request + outbound message exist
- Receive an inbound reply with attachment — confirm it lands on the correct request
- Create callback request, start outbound callback, save call note to deal
- Verify email send log has no duplicate entries

---

## 7. Bug Triage

**Severity levels:**

| Level | Definition | Response |
|---|---|---|
| P1 Critical | Production down or data loss | Fix immediately, hotfix branch from main |
| P2 Major | Wrong data sent to clients, workflow broken | Fix in current sprint |
| P3 Minor | UI/UX issues, non-blocking bugs | Backlog, next sprint |

**Bug ticket template:**
```
Environment: [local / staging / production]
Module: [deals / requests / documents / callbacks / Twilio / emails / billing]
Severity: [P1 / P2 / P3]
Reproduction steps: [exact actions]
Expected: [what should happen]
Actual: [what happened]
Trace IDs: [deal ID, request ID, callback ID, Twilio SID, email thread ID as applicable]
```

**Debug order:** Reproduce first → isolate module → pull logs → patch smallest layer

---

## 8. Logging & Monitoring

**Structured logs — not random console.log output.**

Log every meaningful workflow action with: module, event name, entity ID, user ID, outcome.

**High-value events to log:**
- `request.created`, `request.email.sent`, `request.reply.matched`, `request.document.received`, `request.document.accepted`, `request.document.rejected`
- `callback.request.created`, `callback.attempt.started`, `callback.attempt.completed`, `callback.attempt.failed`
- `twilio.webhook.received`, `twilio.call.failed`, `twilio.sms.inbound.received`
- `email.sent`, `email.merge_tag.unresolved` (flag when merge tags don't resolve)
- `change_request.created`, `change_request.approved`, `change_request.applied`

**Monitoring (current):** Supabase logs + `email_send_log` + `activity_log` tables
**Monitoring (target):** Add Sentry for frontend/backend error tracking — scheduled for Week 3 of build plan

---

## 9. Workflow State Machines

No random status changes. Key workflows enforce allowed state transitions only.

**Request Center:**
`draft → sent → waiting → reply_received → document_received / under_review → accepted / rejected → completed / needs_follow_up`

**Callback requests:**
`open → acknowledged → completed` or `open → dismissed`

**Deal status:**
Document allowed status transitions before modifying deal state logic.

---

## 10. Feature Flags

Use feature flags for risky or staged rollouts. Keep them in `src/config/`.

**Planned flags:**
- `ENABLE_REQUEST_CENTER`
- `ENABLE_TWILIO_CALLBACKS`
- `ENABLE_INCOMING_DOC_QUEUE`
- `ENABLE_AI_MATCHING`
- `ENABLE_CLIENT_BILLING`

> Skip feature flags for now — add when multiple concurrent features need independent rollout control.

---

## 11. Security & Secrets

- Secrets only in platform-managed env vars (Vercel dashboard, Railway dashboard)
- Separate credentials for staging and production — never share
- Validate Twilio signatures on all Twilio webhook endpoints
- Protect internal debug/admin pages behind admin-only auth
- Use least privilege for service keys and integration tokens
- Rotate keys after any suspected exposure

---

## 12. Weekly & Monthly Maintenance Rhythm

**Weekly:**
- Review production errors and slow/failed workflows
- Review unmatched docs/emails and callback failures
- Clean merged branches
- Check support issues against known logs

**Monthly:**
- Audit secrets and environment settings
- Review DB indexes and slow queries
- Review Twilio and infrastructure spend
- Prune dead code, stale config, orphaned tables/fields
- Review and update this playbook if process has changed

---

## 13. Release Checklist

Run this before every merge to `main`:

```
PRE-MERGE
☐ Feature branch builds locally with zero errors (npm run build)
☐ All imported files are committed to the repo (not just local filesystem)
☐ DB migrations tested in staging Supabase first
☐ Any merge tag changes → deal-log reference panel updated in same push

STAGING SMOKE TESTS
☐ Deal creation — all fields save correctly
☐ Email send — all merge tags resolve, no [Placeholder] visible to client
☐ Request Center — create request, confirm task + outbound message exist
☐ Inbound reply matching — test reply lands on correct request
☐ Email send log — no duplicate entries
☐ Twilio webhook — confirm webhook receives and routes correctly (if Twilio changes)

POST-DEPLOY
☐ Vercel shows green build ✅
☐ Key workflows checked in production
☐ No new errors in Supabase logs
☐ Rollback plan documented if this was a risky release
```

---

## 14. CHANGELOG

Every push to `main` gets an entry in `/docs/CHANGELOG.md`:

```markdown
## [YYYY-MM-DD] — Brief title
- What changed
- Why it changed
- Any DB migrations applied
- Any breaking changes
```

This is the single source of truth for "what's actually deployed."

---

*Last updated: March 2026*
