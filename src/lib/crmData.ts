// ============================================================================
// Filmdappa CRM — Permanent Supabase Database Service & CRUD Layer
// ============================================================================

import { supabase, isSupabaseReady } from './supabase'
import { isValidFinancialDate, MIN_FINANCIAL_DATE, MAX_FINANCIAL_DATE } from './calendar'

export interface ClientRecord {
  id: string
  name: string
  business: string
  phone: string
  amount: number
  videos: number
  posters: number
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD
  status: 'Active' | 'Ending soon' | 'Inactive'
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface ClientPaymentRecord {
  id: string
  client_id: string
  amount: number
  payment_date: string // YYYY-MM-DD
  payment_method: 'Bank transfer' | 'UPI' | 'Cash' | 'Card'
  reference: string
  notes?: string
  created_at?: string
}

export interface ExpenseRecord {
  id: string
  date: string // YYYY-MM-DD
  category: string
  description: string
  recipient: string
  staff_id?: string | null
  client_id?: string | null
  client_name?: string
  amount: number
  status: 'Paid' | 'Pending'
  payment_method: string
  receipt_reference: string
  notes?: string
  created_at?: string
}

export function isStaffSalaryExpense(expense: ExpenseRecord): boolean {
  const cat = (expense.category || '').trim().toLowerCase()
  return cat === 'staff salary' || cat.includes('salary') || Boolean(expense.staff_id)
}

export function expenseMatchesStaff(expense: ExpenseRecord, staffMember: StaffRecord): boolean {
  if (expense.staff_id && expense.staff_id === staffMember.id) return true
  if (expense.recipient && expense.recipient.trim().toLowerCase() === staffMember.name.trim().toLowerCase()) {
    return true
  }
  return false
}

export interface StaffRecord {
  id: string
  name: string
  phone: string
  role: 'Editor' | 'Cameraman' | 'Poster Designer' | 'Other'
  salary: number
  status: 'Active' | 'Inactive'
  created_at?: string
  updated_at?: string
}

export interface StaffPaymentRecord {
  id: string
  staff_id: string
  staff_name?: string
  payment_date: string // YYYY-MM-DD
  amount: number
  payment_type: 'Salary' | 'Project Payment' | 'Advance' | 'Other'
  related_client: string
  work_description: string
  payment_method: string
  reference: string
  status: 'Paid' | 'Pending'
  created_at?: string
}

export interface DeliverableRecord {
  id: string
  client_id: string
  title: string
  type: 'Video' | 'Poster'
  assigned_staff: string
  status: 'Pending' | 'In Progress' | 'Completed'
  completion_date?: string | null
  month: string // e.g. "2026-10"
  created_at?: string
}

export interface CompanySettings {
  company_name: string
  business_email: string
  phone_number: string
  currency: string
}

export interface AuditRecord {
  id: string
  created_at: string
  record_type: string
  amount?: string
  actor: string
  description: string
}

export const DEFAULT_SETTINGS: CompanySettings = {
  company_name: 'Filmdappa Media Company',
  business_email: 'accounts@filmdappa.com',
  phone_number: '+91 98765 00000',
  currency: 'INR — Indian Rupee',
}

// ── Cache Layer for offline fallback & instant load ──────────────────────────
const CACHE_KEY = 'filmdappa_crm_cache_'

function getCached<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(CACHE_KEY + key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setCached<T>(key: string, data: T): void {
  try {
    localStorage.setItem(CACHE_KEY + key, JSON.stringify(data))
  } catch (e) {
    console.warn('[Filmdappa CRM Cache]', e)
  }
}

function formatDbError(error: any): string {
  if (!error) return 'An unknown database error occurred.'
  console.error('[Filmdappa CRM Database Error]', {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })

  // 1. Missing database table
  if (
    error.code === '42P01' ||
    error.message?.includes('schema cache') ||
    error.message?.includes('does not exist')
  ) {
    return 'Database table does not exist in Supabase yet. Please execute supabase/migrations/002_crm_data_tables.sql in your Supabase SQL Editor.'
  }

  // 2. PostgreSQL 42501 Permission Denied (Missing table grant or RLS restriction)
  if (error.code === '42501' || error.message?.toLowerCase().includes('permission denied')) {
    const hintText = error.hint ? ` (${error.hint})` : ''
    return `Database permission denied (PostgreSQL 42501): ${error.message}.${hintText} Please run supabase/migrations/003_fix_authorization_and_rls.sql in your Supabase SQL Editor to grant table privileges to the authenticated role.`
  }

  // 3. Network connection error
  if (
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('NetworkError') ||
    error.message?.includes('network')
  ) {
    return 'Network connection error. Unable to connect to Supabase. Please check your internet connection.'
  }

  return error.message || String(error)
}

// ─── 1. Clients CRUD ────────────────────────────────────────────────────────

export async function fetchClients(): Promise<ClientRecord[]> {
  const cached = getCached<ClientRecord[]>('clients', [])
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[Filmdappa Supabase] fetchClients warning:', error.message)
      return cached
    }
    if (data) {
      setCached('clients', data)
      return data
    }
  } catch (err) {
    console.warn('[Filmdappa Supabase] fetchClients network error:', err)
  }
  return cached
}

export async function createClient(
  client: Omit<ClientRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<ClientRecord> {
  const id = client.id || crypto.randomUUID()
  const record: ClientRecord = {
    ...client,
    id,
    amount: Number(client.amount || 0),
    videos: Number(client.videos || 0),
    posters: Number(client.posters || 0),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (!isValidFinancialDate(record.start_date) || !isValidFinancialDate(record.end_date)) {
    throw new Error(`Dates must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
  }
  if (record.start_date > record.end_date) {
    throw new Error('Agreement start date cannot be after end date.')
  }
  if (record.amount < 0) {
    throw new Error('Monthly package amount cannot be negative.')
  }
  if (record.videos < 0) {
    throw new Error('Videos per month cannot be negative.')
  }
  if (record.posters < 0) {
    throw new Error('Posters per month cannot be negative.')
  }

  if (isSupabaseReady) {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      throw new Error('Authentication session is missing or expired. Please log in again to save this client.')
    }

    const { data, error } = await supabase.from('clients').insert([record]).select().single()
    if (error) throw new Error(formatDbError(error))
    const saved = data || record
    const existing = getCached<ClientRecord[]>('clients', [])
    setCached('clients', [saved, ...existing.filter((c) => c.id !== saved.id)])
    return saved
  }

  const existing = getCached<ClientRecord[]>('clients', [])
  setCached('clients', [record, ...existing.filter((c) => c.id !== record.id)])
  return record
}

export async function updateClient(
  id: string,
  updates: Partial<Omit<ClientRecord, 'id' | 'created_at'>>
): Promise<ClientRecord> {
  if (updates.start_date && !isValidFinancialDate(updates.start_date)) {
    throw new Error(`Start date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
  }
  if (updates.end_date && !isValidFinancialDate(updates.end_date)) {
    throw new Error(`End date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
  }
  if (updates.start_date && updates.end_date && updates.start_date > updates.end_date) {
    throw new Error('Agreement start date cannot be after end date.')
  }

  const sanitizedUpdates = { ...updates }
  if (sanitizedUpdates.amount !== undefined) sanitizedUpdates.amount = Number(sanitizedUpdates.amount || 0)
  if (sanitizedUpdates.videos !== undefined) sanitizedUpdates.videos = Number(sanitizedUpdates.videos || 0)
  if (sanitizedUpdates.posters !== undefined) sanitizedUpdates.posters = Number(sanitizedUpdates.posters || 0)

  const payload = { ...sanitizedUpdates, updated_at: new Date().toISOString() }

  if (isSupabaseReady) {
    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(formatDbError(error))
    const existing = getCached<ClientRecord[]>('clients', [])
    const updatedList = existing.map((c) => (c.id === id ? { ...c, ...data } : c))
    setCached('clients', updatedList)
    return data
  }

  const existing = getCached<ClientRecord[]>('clients', [])
  const updatedList = existing.map((c) => (c.id === id ? { ...c, ...payload } : c))
  setCached('clients', updatedList)
  return updatedList.find((c) => c.id === id)!
}

export async function deleteClient(id: string): Promise<void> {
  if (isSupabaseReady) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) throw new Error(formatDbError(error))
  }
  const existingClients = getCached<ClientRecord[]>('clients', [])
  setCached('clients', existingClients.filter((c) => c.id !== id))

  // Clean up related cached records for local consistency
  const existingPayments = getCached<ClientPaymentRecord[]>('client_payments', [])
  setCached('client_payments', existingPayments.filter((p) => p.client_id !== id))

  const existingDeliverables = getCached<DeliverableRecord[]>('deliverables', [])
  setCached('deliverables', existingDeliverables.filter((d) => d.client_id !== id))
}

// ─── 2. Client Payments CRUD ────────────────────────────────────────────────

export async function fetchClientPayments(): Promise<ClientPaymentRecord[]> {
  const cached = getCached<ClientPaymentRecord[]>('client_payments', [])
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('client_payments')
      .select('*')
      .order('payment_date', { ascending: false })

    if (error) return cached
    if (data) {
      setCached('client_payments', data)
      return data
    }
  } catch {
    // fallback
  }
  return cached
}

export async function createClientPayment(
  payment: Omit<ClientPaymentRecord, 'id' | 'created_at'> & { id?: string }
): Promise<ClientPaymentRecord> {
  const id = payment.id || crypto.randomUUID()
  const record: ClientPaymentRecord = {
    ...payment,
    id,
    created_at: new Date().toISOString(),
  }

  if (!isValidFinancialDate(record.payment_date)) {
    throw new Error(`Payment date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
  }
  if (record.amount <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }

  if (isSupabaseReady) {
    const { data, error } = await supabase.from('client_payments').insert([record]).select().single()
    if (error) throw new Error(formatDbError(error))
    const saved = data || record
    const existing = getCached<ClientPaymentRecord[]>('client_payments', [])
    setCached('client_payments', [saved, ...existing.filter((p) => p.id !== saved.id)])
    return saved
  }

  const existing = getCached<ClientPaymentRecord[]>('client_payments', [])
  setCached('client_payments', [record, ...existing.filter((p) => p.id !== record.id)])
  return record
}

export async function deleteClientPayment(id: string): Promise<void> {
  if (isSupabaseReady) {
    const { error } = await supabase.from('client_payments').delete().eq('id', id)
    if (error) throw new Error(formatDbError(error))
  }
  const existing = getCached<ClientPaymentRecord[]>('client_payments', [])
  setCached('client_payments', existing.filter((p) => p.id !== id))
}

// ─── 3. Expenses CRUD ───────────────────────────────────────────────────────

export async function fetchExpenses(): Promise<ExpenseRecord[]> {
  const cached = getCached<ExpenseRecord[]>('expenses', [])
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })

    if (error) return cached
    if (data) {
      setCached('expenses', data)
      return data
    }
  } catch {
    // fallback
  }
  return cached
}

export async function createExpense(
  expense: Omit<ExpenseRecord, 'id' | 'created_at'> & { id?: string }
): Promise<ExpenseRecord> {
  const id = expense.id || crypto.randomUUID()
  const record: ExpenseRecord = {
    ...expense,
    id,
    created_at: new Date().toISOString(),
  }

  if (!isValidFinancialDate(record.date)) {
    throw new Error(`Expense date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
  }
  if (record.amount < 0) {
    throw new Error('Expense amount cannot be negative.')
  }

  if (isSupabaseReady) {
    let saved: ExpenseRecord = record
    const { data, error } = await supabase.from('expenses').insert([record]).select().single()
    if (error) {
      // If error is due to missing staff_id column, retry without staff_id
      const isMissingStaffCol =
        error.message?.includes('staff_id') ||
        error.details?.includes('staff_id') ||
        error.code === '42703' ||
        error.code === 'PGRST204'

      if (isMissingStaffCol && 'staff_id' in record) {
        const { staff_id, ...payloadWithoutStaff } = record
        const retry = await supabase.from('expenses').insert([payloadWithoutStaff]).select().single()
        if (retry.error) throw new Error(formatDbError(retry.error))
        saved = { ...retry.data, staff_id }
      } else {
        throw new Error(formatDbError(error))
      }
    } else if (data) {
      saved = data
    }
    const existing = getCached<ExpenseRecord[]>('expenses', [])
    setCached('expenses', [saved, ...existing.filter((e) => e.id !== saved.id)])
    return saved
  }

  const existing = getCached<ExpenseRecord[]>('expenses', [])
  setCached('expenses', [record, ...existing.filter((e) => e.id !== record.id)])
  return record
}

export async function updateExpense(
  id: string,
  updates: Partial<Omit<ExpenseRecord, 'id' | 'created_at'>>
): Promise<ExpenseRecord> {
  if (updates.date && !isValidFinancialDate(updates.date)) {
    throw new Error(`Expense date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
  }

  if (isSupabaseReady) {
    let updatedData: any = updates
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      const isMissingStaffCol =
        error.message?.includes('staff_id') ||
        error.details?.includes('staff_id') ||
        error.code === '42703' ||
        error.code === 'PGRST204'

      if (isMissingStaffCol && 'staff_id' in updates) {
        const { staff_id, ...updatesWithoutStaff } = updates
        const retry = await supabase
          .from('expenses')
          .update(updatesWithoutStaff)
          .eq('id', id)
          .select()
          .single()
        if (retry.error) throw new Error(formatDbError(retry.error))
        updatedData = { ...retry.data, staff_id }
      } else {
        throw new Error(formatDbError(error))
      }
    } else {
      updatedData = data
    }

    const existing = getCached<ExpenseRecord[]>('expenses', [])
    const updated = existing.map((e) => (e.id === id ? { ...e, ...updatedData } : e))
    setCached('expenses', updated)
    return updatedData
  }

  const existing = getCached<ExpenseRecord[]>('expenses', [])
  const updated = existing.map((e) => (e.id === id ? { ...e, ...updates } : e))
  setCached('expenses', updated)
  return updated.find((e) => e.id === id)!
}

export async function deleteExpense(id: string): Promise<void> {
  if (isSupabaseReady) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw new Error(formatDbError(error))
  }
  const existing = getCached<ExpenseRecord[]>('expenses', [])
  setCached('expenses', existing.filter((e) => e.id !== id))
}

// ─── 4. Staff CRUD ──────────────────────────────────────────────────────────

export async function fetchStaff(): Promise<StaffRecord[]> {
  const cached = getCached<StaffRecord[]>('staff', [])
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return cached
    if (data) {
      setCached('staff', data)
      return data
    }
  } catch {
    // fallback
  }
  return cached
}

export async function createStaff(
  person: Omit<StaffRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<StaffRecord> {
  const id = person.id || crypto.randomUUID()
  const record: StaffRecord = {
    ...person,
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (isSupabaseReady) {
    const { data, error } = await supabase.from('staff').insert([record]).select().single()
    if (error) throw new Error(formatDbError(error))
    const saved = data || record
    const existing = getCached<StaffRecord[]>('staff', [])
    setCached('staff', [saved, ...existing.filter((s) => s.id !== saved.id)])
    return saved
  }

  const existing = getCached<StaffRecord[]>('staff', [])
  setCached('staff', [record, ...existing.filter((s) => s.id !== record.id)])
  return record
}

export async function updateStaff(
  id: string,
  updates: Partial<Omit<StaffRecord, 'id' | 'created_at'>>
): Promise<StaffRecord> {
  const payload = { ...updates, updated_at: new Date().toISOString() }

  if (isSupabaseReady) {
    const { data, error } = await supabase
      .from('staff')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(formatDbError(error))
    const existing = getCached<StaffRecord[]>('staff', [])
    const updated = existing.map((s) => (s.id === id ? { ...s, ...data } : s))
    setCached('staff', updated)
    return data
  }

  const existing = getCached<StaffRecord[]>('staff', [])
  const updated = existing.map((s) => (s.id === id ? { ...s, ...payload } : s))
  setCached('staff', updated)
  return updated.find((s) => s.id === id)!
}

export async function deleteStaff(id: string): Promise<void> {
  if (isSupabaseReady) {
    const { error } = await supabase.from('staff').delete().eq('id', id)
    if (error) throw new Error(formatDbError(error))
  }
  const existing = getCached<StaffRecord[]>('staff', [])
  setCached('staff', existing.filter((s) => s.id !== id))
}

// ─── 5. Staff Payments CRUD ─────────────────────────────────────────────────

export async function fetchStaffPayments(): Promise<StaffPaymentRecord[]> {
  const cached = getCached<StaffPaymentRecord[]>('staff_payments', [])
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('staff_payments')
      .select('*')
      .order('payment_date', { ascending: false })

    if (error) return cached
    if (data) {
      setCached('staff_payments', data)
      return data
    }
  } catch {
    // fallback
  }
  return cached
}

export async function createStaffPayment(
  sp: Omit<StaffPaymentRecord, 'id' | 'created_at'> & { id?: string }
): Promise<StaffPaymentRecord> {
  const id = sp.id || crypto.randomUUID()
  const record: StaffPaymentRecord = {
    ...sp,
    id,
    created_at: new Date().toISOString(),
  }

  if (!isValidFinancialDate(record.payment_date)) {
    throw new Error(`Payment date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
  }
  if (record.amount <= 0) {
    throw new Error('Staff payment amount must be greater than zero.')
  }

  if (isSupabaseReady) {
    const { data, error } = await supabase.from('staff_payments').insert([record]).select().single()
    if (error) throw new Error(formatDbError(error))
    const saved = data || record
    const existing = getCached<StaffPaymentRecord[]>('staff_payments', [])
    setCached('staff_payments', [saved, ...existing.filter((p) => p.id !== saved.id)])
    return saved
  }

  const existing = getCached<StaffPaymentRecord[]>('staff_payments', [])
  setCached('staff_payments', [record, ...existing.filter((p) => p.id !== record.id)])
  return record
}

export async function deleteStaffPayment(id: string): Promise<void> {
  if (isSupabaseReady) {
    const { error } = await supabase.from('staff_payments').delete().eq('id', id)
    if (error) throw new Error(formatDbError(error))
  }
  const existing = getCached<StaffPaymentRecord[]>('staff_payments', [])
  setCached('staff_payments', existing.filter((p) => p.id !== id))
}

// ─── 6. Deliverables CRUD ───────────────────────────────────────────────────

export async function fetchDeliverables(): Promise<DeliverableRecord[]> {
  const cached = getCached<DeliverableRecord[]>('deliverables', [])
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('deliverables')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return cached
    if (data) {
      setCached('deliverables', data)
      return data
    }
  } catch {
    // fallback
  }
  return cached
}

export async function createDeliverable(
  item: Omit<DeliverableRecord, 'id' | 'created_at'> & { id?: string }
): Promise<DeliverableRecord> {
  const id = item.id || crypto.randomUUID()
  const record: DeliverableRecord = {
    ...item,
    id,
    created_at: new Date().toISOString(),
  }

  if (isSupabaseReady) {
    const { data, error } = await supabase.from('deliverables').insert([record]).select().single()
    if (error) throw new Error(formatDbError(error))
    const saved = data || record
    const existing = getCached<DeliverableRecord[]>('deliverables', [])
    setCached('deliverables', [saved, ...existing.filter((d) => d.id !== saved.id)])
    return saved
  }

  const existing = getCached<DeliverableRecord[]>('deliverables', [])
  setCached('deliverables', [record, ...existing.filter((d) => d.id !== record.id)])
  return record
}

export async function updateDeliverableStatus(
  id: string,
  status: 'Pending' | 'In Progress' | 'Completed',
  completionDate?: string | null
): Promise<void> {
  const payload = {
    status,
    completion_date: status === 'Completed' ? completionDate || new Date().toISOString().slice(0, 10) : null,
  }

  if (isSupabaseReady) {
    const { error } = await supabase.from('deliverables').update(payload).eq('id', id)
    if (error) throw new Error(formatDbError(error))
  }

  const existing = getCached<DeliverableRecord[]>('deliverables', [])
  setCached(
    'deliverables',
    existing.map((d) => (d.id === id ? { ...d, ...payload } : d))
  )
}

export async function deleteDeliverable(id: string): Promise<void> {
  if (isSupabaseReady) {
    const { error } = await supabase.from('deliverables').delete().eq('id', id)
    if (error) throw new Error(formatDbError(error))
  }
  const existing = getCached<DeliverableRecord[]>('deliverables', [])
  setCached('deliverables', existing.filter((d) => d.id !== id))
}

// ─── 7. Company Settings ────────────────────────────────────────────────────

export async function fetchCompanySettings(): Promise<CompanySettings> {
  const cached = getCached<CompanySettings>('company_settings', DEFAULT_SETTINGS)
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 'default')
      .single()

    if (!error && data) {
      const settings: CompanySettings = {
        company_name: data.company_name || DEFAULT_SETTINGS.company_name,
        business_email: data.business_email || DEFAULT_SETTINGS.business_email,
        phone_number: data.phone_number || DEFAULT_SETTINGS.phone_number,
        currency: data.currency || DEFAULT_SETTINGS.currency,
      }
      setCached('company_settings', settings)
      return settings
    }
  } catch {
    // fallback
  }
  return cached
}

export async function saveCompanySettings(settings: CompanySettings): Promise<CompanySettings> {
  if (isSupabaseReady) {
    const { error } = await supabase
      .from('company_settings')
      .upsert({ id: 'default', ...settings, updated_at: new Date().toISOString() })

    if (error) throw new Error(formatDbError(error))
  }
  setCached('company_settings', settings)
  return settings
}

// ─── 8. Audit Trail CRUD ────────────────────────────────────────────────────

export async function fetchAuditLogs(): Promise<AuditRecord[]> {
  const cached = getCached<AuditRecord[]>('audit_logs', [])
  if (!isSupabaseReady) return cached

  try {
    const { data, error } = await supabase
      .from('crm_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data && data.length > 0) {
      setCached('audit_logs', data)
      return data
    }
  } catch {
    // fallback
  }
  return cached
}

export async function logCrmAction(
  actor: string,
  recordType: string,
  description: string,
  amount: string = '—'
): Promise<void> {
  const newLog: AuditRecord = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    record_type: recordType,
    amount,
    actor,
    description,
  }

  // Insert into Supabase crm_audit_log
  if (isSupabaseReady) {
    try {
      await supabase.from('crm_audit_log').insert([newLog])
    } catch {
      // ignore log failure
    }
  }

  const existing = getCached<AuditRecord[]>('audit_logs', [])
  setCached('audit_logs', [newLog, ...existing].slice(0, 100))
}
