# Filmdappa CRM — Supabase Setup Guide

This document covers every Supabase dashboard setting you must configure for the
login system to work end-to-end.

---

## 1. Project Details

| Setting | Value |
|---|---|
| Project URL | `https://YOUR_PROJECT_REF.supabase.co` |
| Region | As selected during project creation |

---

## 2. Add Your Publishable Key to `.env`

Open `.env` in the project root (it has been created for you). Replace the placeholder:

```env
VITE_SUPABASE_ANON_KEY=PASTE_YOUR_PUBLISHABLE_KEY_HERE
```

With your actual key from:
**Dashboard → Settings → API → Project API keys → "anon public"**

The key starts with `sb_publishable_` (new format) or `eyJ...` (legacy JWT format) — both work.

After editing `.env`, restart the dev server:
```
npm run dev
```

---

## 3. Run the SQL Migrations

Go to **Supabase Dashboard → SQL Editor**:

### Step 3.1 — Authentication & Security Setup
Run the contents of:
```
supabase/migrations/001_auth_setup.sql
```
This creates:
- `authorized_users` table (allow-list)
- `auth_audit_log` table (security events)
- `face_verification_sessions` table (presence check records)
- Row Level Security policies on all three tables

### Step 3.2 — Business Data Tables & RLS Policies
Run the contents of:
```
supabase/migrations/002_crm_data_tables.sql
```
This creates:
- `clients` table (client agreements, packages, deliverables count)
- `client_payments` table (payment ledger, transaction reference)
- `expenses` table (operating and project expenses ledger)
- `staff` table (team profiles, compensation structure)
- `staff_payments` table (staff payments ledger)
- `deliverables` table (videos, posters, and completion tracking)
- `company_settings` table (workspace company profile)
- `crm_audit_log` table (business actions audit trail)
- Indexes on transaction dates and relationships
- Strict Authenticated-Only Row Level Security policies on all business tables

---

## 4. Configure Authentication Settings

Go to **Dashboard → Authentication → Settings**:

| Setting | Value | Why |
|---|---|---|
| **Enable Email provider** | ✅ On | Required for OTP |
| **Enable signups** | ❌ Off | Only invited users can log in |
| **Confirm email** | ❌ Off | OTP handles verification |
| **OTP expiry** | `300` seconds | 5-minute window |
| **Site URL** | `http://localhost:8443` (dev) | Used in email redirect links |
| **Redirect URLs** | Add `http://localhost:8443` | Allow local dev redirects |

For production, change Site URL to your real domain.

---

## 5. Register Authorized Users

**Only users you explicitly invite can log in.** There is no public sign-up.

### Step A — Invite via Dashboard
Go to **Authentication → Users → Invite user**, enter the email (e.g. `faizal@filmdappa.com`).

Supabase will send them an invite email. They do **not** need to set a password — login uses OTP only.

### Step B — Add to allow-list table
After inviting, run in **SQL Editor**:

```sql
INSERT INTO public.authorized_users (email, role, full_name)
VALUES ('faizal@filmdappa.com', 'owner', 'Faizal Dappa');
```

Repeat for each team member:
```sql
INSERT INTO public.authorized_users (email, role, full_name)
VALUES ('nisha@filmdappa.com', 'finance_admin', 'Nisha K.');
```

---

## 6. Email Delivery

Supabase's built-in SMTP sends ~3 emails/hour in free tier, which is enough for a small team.

### For production (higher volume):
Go to **Dashboard → Settings → Auth → SMTP Settings** and configure a provider:
- **Resend** (recommended, free tier available): resend.com
- **SendGrid**: sendgrid.com
- **Postmark**: postmarkapp.com

Fill in the SMTP fields with your provider's credentials. These stay in Supabase's dashboard — never in frontend code.

---

## 7. Row Level Security (RLS) Policies

The SQL migrations apply strict Row Level Security policies:

| Table | Policy | Who Can Access |
|---|---|---|
| `authorized_users` | No client access | Service role only |
| `auth_audit_log` | INSERT only | Authenticated & anon; no client SELECT |
| `face_verification_sessions` | INSERT & SELECT own | Authenticated users for their own rows |
| `clients` | SELECT, INSERT, UPDATE, DELETE | Authenticated users only |
| `client_payments` | SELECT, INSERT, DELETE | Authenticated users only |
| `expenses` | SELECT, INSERT, UPDATE, DELETE | Authenticated users only |
| `staff` | SELECT, INSERT, UPDATE, DELETE | Authenticated users only |
| `staff_payments` | SELECT, INSERT, DELETE | Authenticated users only |
| `deliverables` | SELECT, INSERT, UPDATE, DELETE | Authenticated users only |
| `company_settings` | SELECT, INSERT, UPDATE | Authenticated users only |
| `crm_audit_log` | SELECT, INSERT | Authenticated users only |

No unrestricted public (anon) access is granted to business data.

---

## 8. Face Verification — Honest Status

The current face verification step is a **presence check only**:
- ✅ Requests camera permission with explicit user consent
- ✅ Uses native browser FaceDetector API where available (Chrome)
- ✅ Records consent + detection result in `face_verification_sessions`
- ❌ Does NOT perform 1-to-1 identity matching against enrolled templates
- ❌ Does NOT provide liveness detection or anti-spoofing

To implement real face matching, you would need:
1. A face verification provider (e.g., AWS Rekognition, Azure Cognitive Services Face API)
2. A face enrollment step (capture + store encrypted template per user)
3. A secure backend (Supabase Edge Function) to compare captured frame vs template
4. Explicit biometric data consent handling compliant with applicable law

The UI is built to accommodate this: the `completeFaceVerification()` function in `AuthContext.tsx`
can call a real API before granting access. The step is clearly labeled as "presence check only" in the UI.

---

## 9. Testing Checklist

| Test | How to verify |
|---|---|
| Email OTP sent | Enter authorized email → check inbox |
| Wrong OTP | Enter `000000` → see "Incorrect code. N attempts remaining." |
| Expired OTP | Wait 5+ minutes → enter old code → see expired error |
| Resend cooldown | Click Resend → button shows countdown |
| Unauthorized email | Enter unregistered email → see "not authorized" error |
| Protected route | Clear sessionStorage, navigate directly → redirected to login |
| Logout | Click logout in sidebar → session cleared, login screen shown |
| Session persistence | Refresh page mid-session → face check required again |

---

## 10. Quick Reference — Files Changed

| File | Change |
|---|---|
| `.env` | Created with URL pre-filled, key placeholder |
| `src/lib/supabase.ts` | Improved config detection, handles both key formats |
| `src/auth/AuthContext.tsx` | Uses `isSupabaseReady` from client, improved error messages |
| `src/auth/LoginPage.tsx` | Better "key not configured" instructions |
| `l` | DB schema + RLS (run in SQL Editor) |
