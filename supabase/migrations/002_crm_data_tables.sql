-- ============================================================
-- Filmdappa CRM — Production Database Tables & Policies
-- Run this script in the Supabase SQL Editor:
--   https://app.supabase.com → Your Project → SQL Editor
-- ============================================================

-- ── 1. Clients Table ──────────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business text not null,
  phone text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  videos integer not null default 0 check (videos >= 0),
  posters integer not null default 0 check (posters >= 0),
  start_date date not null,
  end_date date not null,
  status text not null default 'Active' check (status in ('Active', 'Ending soon', 'Inactive')),
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clients is 'Filmdappa client accounts, package agreements and billing periods.';

-- ── 2. Client Payments Table ─────────────────────────────────────────────────
create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null,
  payment_method text not null check (payment_method in ('Bank transfer', 'UPI', 'Cash', 'Card')),
  reference text not null default '',
  notes text default '',
  created_at timestamptz not null default now()
);

comment on table public.client_payments is 'Actual payments received from clients.';

-- ── 3. Expenses Table ────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null,
  description text not null,
  recipient text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null default '—',
  amount numeric not null check (amount >= 0),
  status text not null default 'Paid' check (status in ('Paid', 'Pending')),
  payment_method text not null default 'Bank transfer',
  receipt_reference text not null default '',
  notes text default '',
  created_at timestamptz not null default now()
);

comment on table public.expenses is 'Filmdappa operating and production expense ledger.';

-- ── 4. Staff Table ───────────────────────────────────────────────────────────
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  role text not null check (role in ('Editor', 'Cameraman', 'Poster Designer', 'Other')),
  salary numeric not null default 0 check (salary >= 0),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff is 'Filmdappa team members, roles and compensation structures.';

-- ── 5. Staff Payments Table ──────────────────────────────────────────────────
create table if not exists public.staff_payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  staff_name text not null default '',
  payment_date date not null,
  amount numeric not null check (amount > 0),
  payment_type text not null default 'Salary' check (payment_type in ('Salary', 'Project Payment', 'Advance', 'Other')),
  related_client text not null default 'Company operations',
  work_description text not null default '',
  payment_method text not null default 'Bank transfer',
  reference text not null default '',
  status text not null default 'Paid' check (status in ('Paid', 'Pending')),
  created_at timestamptz not null default now()
);

comment on table public.staff_payments is 'Payments made to staff members.';

-- ── 6. Deliverables / Work Items Table ───────────────────────────────────────
create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  type text not null check (type in ('Video', 'Poster')),
  assigned_staff text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed')),
  completion_date date,
  month text not null, -- e.g. '2026-10'
  created_at timestamptz not null default now()
);

comment on table public.deliverables is 'Client monthly deliverables tracking.';

-- ── 7. Company Settings Table ────────────────────────────────────────────────
create table if not exists public.company_settings (
  id text primary key default 'default',
  company_name text not null default 'Filmdappa Media Company',
  business_email text not null default 'accounts@filmdappa.com',
  phone_number text not null default '+91 98765 00000',
  currency text not null default 'INR — Indian Rupee',
  updated_at timestamptz not null default now()
);

comment on table public.company_settings is 'Workspace company profile and settings.';

-- Insert default settings row if not exists
insert into public.company_settings (id, company_name, business_email, phone_number, currency)
values ('default', 'Filmdappa Media Company', 'accounts@filmdappa.com', '+91 98765 00000', 'INR — Indian Rupee')
on conflict (id) do nothing;

-- ── 8. CRM Audit Log Table ───────────────────────────────────────────────────
create table if not exists public.crm_audit_log (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  description text not null,
  amount text not null default '—',
  actor text not null,
  created_at timestamptz not null default now()
);

comment on table public.crm_audit_log is 'Audit trail of CRM business actions and records.';

-- ── 9. Indexes for Query Performance ─────────────────────────────────────────
create index if not exists idx_client_payments_date on public.client_payments(payment_date);
create index if not exists idx_client_payments_client on public.client_payments(client_id);
create index if not exists idx_expenses_date on public.expenses(date);
create index if not exists idx_expenses_client on public.expenses(client_id);
create index if not exists idx_staff_payments_date on public.staff_payments(payment_date);
create index if not exists idx_staff_payments_staff on public.staff_payments(staff_id);
create index if not exists idx_deliverables_client on public.deliverables(client_id);
create index if not exists idx_deliverables_month on public.deliverables(month);
create index if not exists idx_crm_audit_log_created on public.crm_audit_log(created_at desc);

-- ── 10. Row Level Security (RLS) Policies ────────────────────────────────────
-- Enforces that ONLY active authorized CRM users can access and modify business data.
-- No unrestricted public (anon) access is granted.

-- Helper function: check if authenticated caller has an active record in authorized_users
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

grant execute on function public.is_active_crm_user() to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.client_payments to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.staff to authenticated;
grant select, insert, update, delete on public.staff_payments to authenticated;
grant select, insert, update, delete on public.deliverables to authenticated;
grant select, insert, update, delete on public.company_settings to authenticated;
grant select, insert on public.crm_audit_log to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.clients enable row level security;
alter table public.client_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.staff enable row level security;
alter table public.staff_payments enable row level security;
alter table public.deliverables enable row level security;
alter table public.company_settings enable row level security;
alter table public.crm_audit_log enable row level security;

-- Drop older policies
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

-- Ensure notes columns exist if tables were created previously
alter table if exists public.clients add column if not exists notes text default '';
alter table if exists public.expenses add column if not exists notes text default '';

