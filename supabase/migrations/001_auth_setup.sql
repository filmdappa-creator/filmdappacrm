-- ============================================================
-- Filmdappa CRM — Supabase Database Setup
-- Run this in the Supabase SQL Editor:
--   https://app.supabase.com → Your Project → SQL Editor
-- ============================================================

-- ── 1. Authorized users allow-list ──────────────────────────────────────────
-- This table acts as a second allow-list on top of Supabase Auth.
-- Only emails in this table AND in Supabase Auth can log in.

create table if not exists public.authorized_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  role        text not null default 'viewer' check (role in ('owner', 'finance_admin', 'viewer')),
  full_name   text not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.authorized_users is
  'Allow-list of CRM users. Only users in this table may access the app.';

-- ── 2. Auth audit log ────────────────────────────────────────────────────────

create table if not exists public.auth_audit_log (
  id          uuid primary key default gen_random_uuid(),
  event       text not null,
  email       text,
  user_id     uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.auth_audit_log is
  'Security event log. Never stores OTP values or biometric data.';

-- ── 3. Face verification sessions ───────────────────────────────────────────

create table if not exists public.face_verification_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  session_token         text not null,
  consent_acknowledged  boolean not null default false,
  face_detected         boolean not null default false,
  verified_at           timestamptz,
  created_at            timestamptz not null default now()
);

comment on table public.face_verification_sessions is
  'Records presence-check sessions. Stores only consent flag and detection result, not images.';

-- ── 4. Row Level Security ────────────────────────────────────────────────────

-- authorized_users: only the service role (Edge Functions / admin) can read/write
alter table public.authorized_users enable row level security;

create policy "No direct client access to authorized_users"
  on public.authorized_users
  for all
  to authenticated
  using (false);  -- Block all authenticated client reads; use Edge Function for lookup

-- auth_audit_log: append-only from clients; admins can read via service role
alter table public.auth_audit_log enable row level security;

create policy "Authenticated users can insert audit events"
  on public.auth_audit_log
  for insert
  to authenticated, anon
  with check (true);

create policy "No client reads of audit log"
  on public.auth_audit_log
  for select
  to authenticated
  using (false);

-- face_verification_sessions: users can only see their own rows
alter table public.face_verification_sessions enable row level security;

create policy "Users can insert their own face sessions"
  on public.face_verification_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read their own face sessions"
  on public.face_verification_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ── 5. Pre-register your first authorized user ───────────────────────────────
-- IMPORTANT: Before inserting here, first create the user in Supabase Auth:
--   Supabase Dashboard → Authentication → Users → Invite user
-- Then insert their email here:

-- insert into public.authorized_users (email, role, full_name)
-- values ('faizal@filmdappa.com', 'owner', 'Faizal Dappa');

-- ── 6. Supabase Auth settings to apply manually ─────────────────────────────
-- Go to: Authentication → Settings
--   • Enable "Email" provider                       ✓
--   • Disable "Confirm email" (OTP handles this)    set to false
--   • Set OTP expiry: 300 seconds (5 minutes)
--   • Disable "Enable signups" (only invited users) ✓
--   • Set "Site URL" to your production domain
--   • Add http://localhost:8443 to "Redirect URLs"
