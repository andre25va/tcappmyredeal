# Row-Level Security (RLS) Policies

## Overview

This document describes the Row-Level Security model for the TC Command app's Supabase database. RLS is applied as **defense-in-depth** — the primary data access layer is the server-side Vercel API (which uses the `service_role` key and bypasses RLS). RLS protects against:

- Direct database access by unauthorized parties
- Future client-side queries
- Bugs in API routes that might accidentally expose cross-tenant data

## Authentication Model

- **Phone-based auth** with a custom JWT. `auth.uid()` maps to `profiles.id` (UUID).
- **Server-side Vercel API routes** use the `service_role` key — RLS is bypassed entirely (intentional).
- **RLS policies** apply to any direct Supabase client connections.

## Access Levels

| Role | Description | Access |
|------|-------------|--------|
| **Master Admin** | `profiles.is_master_admin = true` | Full access to all orgs, all data |
| **Team Admin** | `user_org_memberships.role_in_org = 'team_admin'` | Full access within their org(s), can manage memberships |
| **TC** (Transaction Coordinator) | `role_in_org = 'tc'` | Full access to deals/data within their org(s) |
| **Agent** | `role_in_org = 'agent'` | Access to their org's deals + explicitly shared deals (`deal_access`) |

## Helper Function: `get_accessible_org_ids`

```sql
CREATE OR REPLACE FUNCTION get_accessible_org_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  -- Master admin gets all org ids
  SELECT id FROM organizations
  WHERE EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND is_master_admin = true
  )
  UNION
  -- Regular users get orgs they have active memberships in
  SELECT org_id FROM user_org_memberships
  WHERE user_id = p_user_id AND status = 'active';
$$;
```

This `SECURITY DEFINER` function is used throughout the RLS policies to determine which organizations a user can access. It handles both master admins (all orgs) and regular users (their active org memberships).

## Table-by-Table Policy Summary

### `profiles`
- **SELECT**: Users see their own profile; master admins see all
- **UPDATE**: Users can update their own profile only
- **INSERT**: Blocked for client (service_role only)

### `organizations`
- **SELECT**: Users see orgs they have active memberships in; master admins see all
- **INSERT**: Master admins only
- **UPDATE**: Master admins only

### `contacts`
Shared directory — all authenticated users have full read/write access.
- **SELECT/INSERT/UPDATE**: Any authenticated user (`auth.uid() IS NOT NULL`)

### `user_org_memberships`
- **SELECT**: Own memberships, OR team_admin sees their org's memberships, OR master admin sees all
- **INSERT/UPDATE**: Team admins (for their org) or master admins

### `deal_access`
Grants explicit per-deal access to specific users regardless of org membership.
- **SELECT**: Own grants, OR deals in accessible orgs, OR master admin
- **INSERT/DELETE**: Team admins and TCs (for their org's deals), or master admins

### `deals`
The central org-scoped table with enhanced access rules:
- **SELECT**: Master admin OR org member OR explicit `deal_access` grant OR deal creator
- **INSERT**: Master admin or org member
- **UPDATE**: Same as SELECT — master admin, org member, deal_access grant, or creator

### Org-Scoped Child Tables

The following tables all follow the same pattern — access is scoped to the user's accessible org IDs:

| Table | SELECT | INSERT | UPDATE |
|-------|--------|--------|--------|
| `email_send_log` | org-scoped | org-scoped | — |
| `call_logs` | org-scoped | org-scoped | — |
| `call_notes` | org-scoped | org-scoped | — |
| `requests` | org-scoped | org-scoped | org-scoped |
| `comm_tasks` | org-scoped | org-scoped | org-scoped |
| `messages` | org-scoped | org-scoped | org-scoped |
| `notifications` | org-scoped | org-scoped | org-scoped |

"Org-scoped" means:
```sql
EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_master_admin = true)
OR org_id IN (SELECT get_accessible_org_ids(auth.uid()))
```

### Resource Tables (nullable `org_id`)

These tables support both global templates (`org_id IS NULL`) and org-specific templates.

**`checklist_templates` and `email_templates`:**
- **SELECT**: Global templates (org_id IS NULL) visible to all authenticated users; org templates scoped to membership; master admin sees all
- **INSERT/UPDATE**: Master admins can create/edit global or org templates; org members can create/edit only their org's templates

## Notes

- **DELETE** policies are not defined for most tables (soft-deletes or service_role handles deletions)
- **Server-side API** uses `service_role` key → completely bypasses RLS → no policy conflicts
- All policies use `SECURITY DEFINER` function `get_accessible_org_ids` to avoid N+1 policy evaluation
- `comm_tasks` policies use `DROP POLICY IF EXISTS` before creation (pre-existing policies may have existed)
