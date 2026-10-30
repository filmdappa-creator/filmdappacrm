-- ============================================================
-- Filmdappa CRM — Migration 004: Staff Salary Expense Integration
-- Run this in the Supabase SQL Editor if you wish to persist staff_id:
--   https://app.supabase.com → Your Project → SQL Editor
-- ============================================================

-- Add optional staff_id column to public.expenses table
alter table public.expenses
  add column if not exists staff_id uuid references public.staff(id) on delete set null;

-- Add index on staff_id for high-performance staff salary lookups
create index if not exists idx_expenses_staff_id on public.expenses(staff_id);

comment on column public.expenses.staff_id is 'Optional reference to the public.staff team member receiving this salary or reimbursement.';
