-- ============================================================
-- Filmdappa CRM — Secure Authorization & Strict RLS Migration
-- Run this script in the Supabase SQL Editor:
--   https://app.supabase.com → Project (hzxbafhukbnopygzsvyc) → SQL Editor
--
-- Security Properties:
--   1. Principle of Least Privilege: Grants only specific table operations
--      to authenticated users; no broad default privileges.
--   2. Non-Recursive Security Definer Functions: Authorization lookups on
--      authorized_users run in security-definer context with fixed search_path,
--      preventing RLS recursion.
--   3. Strict Row Access: Ordinary authenticated users can ONLY read their
--      own authorized_users row. Only active owners can manage users.
--   4. Privilege Escalation Prevention: Non-owners cannot modify role or
--      is_active fields.
--   5. Active-Only CRM Access: All CRM tables (clients, expenses, staff, etc.)
--      permit access ONLY when the caller's JWT email matches an active
--      account in public.authorized_users (no USING (true)).
--   6. Data & Account Preservation: Uses ON CONFLICT to ensure the owner
--      account (lakshansudhakar680@gmail.com) exists with role='owner' and
--      is_active=true without touching existing data.
-- ============================================================

-- ── 1. Helper Functions (Non-Recursive, Security Definer) ────────────────────

create or replace function public.is_active_crm_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_active = true
  );
$$;

comment on function public.is_active_crm_user() is
  'Returns true if the authenticated caller has an active record in authorized_users.';

create or replace function public.is_crm_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and role = 'owner'
      and is_active = true
  );
$$;

comment on function public.is_crm_owner() is
  'Returns true if the authenticated caller is an active owner in authorized_users.';

-- Grant execution to authenticated users
grant execute on function public.is_active_crm_user() to authenticated;
grant execute on function public.is_crm_owner() to authenticated;

-- ── 2. Explicit Table Grants (Least Privilege) ──────────────────────────────
grant usage on schema public to anon, authenticated;

-- Authorized users table: authenticated can select their own profile; owners modify
grant select, insert, update, delete on public.authorized_users to authenticated;

-- CRM business data tables: authenticated role receives table-level permissions,
-- with Row Level Security (RLS) strictly gating which rows can be accessed.
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.client_payments to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.staff to authenticated;
grant select, insert, update, delete on public.staff_payments to authenticated;
grant select, insert, update, delete on public.deliverables to authenticated;
grant select, insert, update, delete on public.company_settings to authenticated;
grant select, insert on public.crm_audit_log to authenticated;

-- Auth audit & face verification
grant select, insert on public.auth_audit_log to authenticated, anon;
grant select, insert, update on public.face_verification_sessions to authenticated;

-- Sequence usage for UUIDs and serials
grant usage, select on all sequences in schema public to authenticated;

-- ── 3. Secure RLS Policies on public.authorized_users ────────────────────────
alter table public.authorized_users enable row level security;

-- Drop all old policies
drop policy if exists "No direct client access to authorized_users" on public.authorized_users;
drop policy if exists "Authenticated users can read authorized_users" on public.authorized_users;
drop policy if exists "Authenticated users can read own authorized_user profile" on public.authorized_users;
drop policy if exists "Users can read own authorized_user profile" on public.authorized_users;
drop policy if exists "Users can update own authorized_user profile" on public.authorized_users;
drop policy if exists "Owners can modify authorized_users" on public.authorized_users;
drop policy if exists "Owners can update authorized_users" on public.authorized_users;
drop policy if exists "Owners can insert authorized_users" on public.authorized_users;
drop policy if exists "Owners can delete authorized_users" on public.authorized_users;

-- SELECT: Users can read ONLY their own record matching JWT email; owners can view all
create policy "Users can read own authorized_user profile"
  on public.authorized_users
  for select
  to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_crm_owner()
  );

-- INSERT: Only active owners can invite or add authorized users
create policy "Owners can insert authorized_users"
  on public.authorized_users
  for insert
  to authenticated
  with check (public.is_crm_owner());

-- UPDATE: Only active owners can update authorized users (prevents self-elevation of role/status)
create policy "Owners can update authorized_users"
  on public.authorized_users
  for update
  to authenticated
  using (public.is_crm_owner())
  with check (public.is_crm_owner());

-- DELETE: Only active owners can remove authorized users
create policy "Owners can delete authorized_users"
  on public.authorized_users
  for delete
  to authenticated
  using (public.is_crm_owner());

-- ── 4. Ensure Owner Account Exists and Is Active ────────────────────────────
insert into public.authorized_users (email, role, full_name, is_active)
values ('lakshansudhakar680@gmail.com', 'owner', 'Lakshan Sudhakar', true)
on conflict (email) do update
  set role = 'owner',
      is_active = true,
      full_name = case
        when public.authorized_users.full_name is null or public.authorized_users.full_name = ''
        then 'Lakshan Sudhakar'
        else public.authorized_users.full_name
      end;

-- ── 5. Strict RLS Policies on CRM Business Data Tables ──────────────────────
-- Access is granted ONLY if the caller is an active authorized user.
-- No permissive "USING (true)" policies are used.

alter table public.clients enable row level security;
alter table public.client_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.staff enable row level security;
alter table public.staff_payments enable row level security;
alter table public.deliverables enable row level security;
alter table public.company_settings enable row level security;
alter table public.crm_audit_log enable row level security;

-- Drop older permissive policies
drop policy if exists "Authenticated users full access to clients" on public.clients;
drop policy if exists "Authenticated users full access to client_payments" on public.client_payments;
drop policy if exists "Authenticated users full access to expenses" on public.expenses;
drop policy if exists "Authenticated users full access to staff" on public.staff;
drop policy if exists "Authenticated users full access to staff_payments" on public.staff_payments;
drop policy if exists "Authenticated users full access to deliverables" on public.deliverables;
drop policy if exists "Authenticated users full access to company_settings" on public.company_settings;
drop policy if exists "Authenticated users full access to crm_audit_log" on public.crm_audit_log;

drop policy if exists "Active authorized users access clients" on public.clients;
drop policy if exists "Active authorized users access client_payments" on public.client_payments;
drop policy if exists "Active authorized users access expenses" on public.expenses;
drop policy if exists "Active authorized users access staff" on public.staff;
drop policy if exists "Active authorized users access staff_payments" on public.staff_payments;
drop policy if exists "Active authorized users access deliverables" on public.deliverables;
drop policy if exists "Active authorized users access company_settings" on public.company_settings;
drop policy if exists "Active authorized users access crm_audit_log" on public.crm_audit_log;

-- Strict Active Authorized User Policies
create policy "Active authorized users access clients"
  on public.clients for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

create policy "Active authorized users access client_payments"
  on public.client_payments for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

create policy "Active authorized users access expenses"
  on public.expenses for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

create policy "Active authorized users access staff"
  on public.staff for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

create policy "Active authorized users access staff_payments"
  on public.staff_payments for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

create policy "Active authorized users access deliverables"
  on public.deliverables for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

create policy "Active authorized users access company_settings"
  on public.company_settings for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

create policy "Active authorized users access crm_audit_log"
  on public.crm_audit_log for all to authenticated
  using (public.is_active_crm_user())
  with check (public.is_active_crm_user());

-- ── 6. Verification Queries (Run automatically at end of migration) ──────────
select
  'authorized_users' as check_table,
  count(*) as total_records,
  count(*) filter (where is_active = true) as active_records
from public.authorized_users;

select
  id,
  email,
  role,
  full_name,
  is_active
from public.authorized_users
where lower(email) = 'lakshansudhakar680@gmail.com';
