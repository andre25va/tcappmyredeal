# TC Command — CHANGELOG

## [2026-03-23] — Sent History + Signature Fix + Docs
- Added Sent History modal to deal-log (all emails visible with preview)
- Replaced hardcoded `Andrea Vargas` signature in all 9 email templates with `{{tcTeamSignature}}`
- Fixed missing StatsBar.tsx + DealTable.tsx components from repo
- Fixed `window.tasklet` TypeScript build error
- Added maintenance playbook and build plan to `/docs`
- Established `develop` branch — all future work goes here first

## [2026-03-22] — Agent Company Name Fix
- GuidedDealWizard now saves `company` field for buyerAgent/sellerAgent
- Backfill migration applied: existing deals patched with company from contacts table

## [Previous releases]
- See git log for full history
