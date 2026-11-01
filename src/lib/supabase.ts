import { createClient } from '@supabase/supabase-js'

// ─── URL Sanitization & Repair ─────────────────────────────────────────────

/**
 * Sanitizes and normalizes the Supabase project URL.
 * Ensures the URL is strictly the project origin (e.g. https://<project-ref>.supabase.co)
 * without extraneous paths like /auth/v1, /rest/v1, or trailing slashes.
 */
export function sanitizeSupabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return ''
  let cleaned = String(rawUrl).trim()
  // Remove enclosing quotes if present (e.g. from misconfigured .env)
  cleaned = cleaned.replace(/^['"]|['"]$/g, '').trim()
  if (!cleaned) return ''

  // Prepend https:// if protocol is omitted
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`
  }

  try {
    const parsed = new URL(cleaned)
    // Extract strictly the protocol + host + port (origin):
    // e.g. "https://hzxbafhukbnopygzsvyc.supabase.co/rest/v1" -> "https://hzxbafhukbnopygzsvyc.supabase.co"
    // e.g. "https://hzxbafhukbnopygzsvyc.supabase.co/auth/v1/" -> "https://hzxbafhukbnopygzsvyc.supabase.co"
    return parsed.origin
  } catch {
    // Fallback regex cleaning if URL parser fails
    return cleaned
      .replace(/\/+$/, '')
      .replace(/\/(auth|rest|storage|functions)(\/v\d+)?\/?$/i, '')
      .replace(/\/v\d+\/?$/i, '')
      .replace(/\/+$/, '')
  }
}

/**
 * Repairs malformed endpoint URLs on the fly (defense-in-depth).
 * Eliminates accidental duplicated or crossed paths such as:
 *   - /rest/v1/auth/v1/otp -> /auth/v1/otp
 *   - /auth/v1/auth/v1     -> /auth/v1
 *   - /rest/v1/rest/v1     -> /rest/v1
 */
export function repairSupabaseUrl(rawUrl: string): string {
  return rawUrl
    .replace(/\/rest\/v1\/auth\/v1(\/|$)/i, '/auth/v1$1')
    .replace(/\/auth\/v1\/auth\/v1(\/|$)/i, '/auth/v1$1')
    .replace(/\/rest\/v1\/rest\/v1(\/|$)/i, '/rest/v1$1')
}

/**
 * Formats a URL for safe diagnostic logging without exposing sensitive tokens or keys.
 */
export function getSafeDisplayUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    const sensitiveKeys = ['token', 'apikey', 'api_key', 'code', 'access_token', 'refresh_token']
    for (const key of sensitiveKeys) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '[REDACTED]')
      }
    }
    return `${parsed.origin}${parsed.pathname}${parsed.search ? '?' + parsed.searchParams.toString() : ''}`
  } catch {
    return String(rawUrl).split('?')[0]
  }
}

/**
 * Resolves a clean redirect URL for Supabase authentication emails.
 * Uses VITE_APP_URL if explicitly defined, or undefined.
 * Note: Only pass emailRedirectTo when an explicit redirect domain is configured.
 */
export function getAppRedirectUrl(): string | undefined {
  const envUrl = (
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    (import.meta.env.APP_URL as string | undefined)
  )?.trim()
  if (!envUrl) return undefined

  try {
    const url = new URL(envUrl.startsWith('http') ? envUrl : `https://${envUrl}`)
    return url.origin
  } catch {
    return undefined
  }
}

/**
 * Normalizes and translates authentication errors into clear, actionable messages.
 */
export function formatAuthError(error: any, email?: string): string {
  if (!error) return 'An unexpected authentication error occurred.'

  const message = (error.message || String(error)).trim()
  const lower = message.toLowerCase()

  // 1. Invalid path error (e.g. /rest/v1 or /auth/v1 appended to base URL, or disallowed redirect URL)
  if (lower.includes('invalid path') || error.code === 'PGRST126' || error.code === 'PGRST125') {
    return 'Invalid API endpoint path. Ensure VITE_SUPABASE_URL points strictly to your project root (https://<project-ref>.supabase.co) without /rest/v1 or /auth/v1.'
  }

  // 2. User not found / not invited
  if (
    lower.includes('signups not allowed') ||
    lower.includes('user not found') ||
    lower.includes('email not confirmed') ||
    lower.includes('invalid login credentials')
  ) {
    return email
      ? `The email "${email}" is not registered in Filmdappa CRM. Contact your administrator to invite your account.`
      : 'This email is not registered in Filmdappa CRM. Contact your administrator to invite your account.'
  }

  // 3. Rate limits
  if (lower.includes('for security purposes') || lower.includes('too many requests')) {
    return 'Too many requests. Please wait a moment before trying again.'
  }

  if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
    return 'Email rate limit exceeded. Please wait a few minutes before requesting another verification code.'
  }

  // 4. Network / connectivity
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network')
  ) {
    return 'Network connection error. Unable to connect to Supabase. Please check your internet connection.'
  }

  // 5. Invalid token
  if (
    lower.includes('token has expired') ||
    lower.includes('token is expired') ||
    lower.includes('otp expired') ||
    lower.includes('invalid token')
  ) {
    return 'Incorrect or expired verification code. Please request a new code.'
  }

  // 6. Redirect URL error
  if (lower.includes('redirect') && (lower.includes('not allowed') || lower.includes('invalid'))) {
    return 'The redirect URL is not allowed in your Supabase Auth settings. Check URL Configuration in your Supabase dashboard.'
  }

  return message
}

// ─── Environment Variable Resolution ────────────────────────────────────────

const rawUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PROJECT_URL as string | undefined) ||
  ''
)

const sanitizedUrl = sanitizeSupabaseUrl(rawUrl)
export const supabaseUrl = sanitizedUrl || 'https://hzxbafhukbnopygzsvyc.supabase.co'

if (rawUrl && rawUrl.trim() !== supabaseUrl) {
  console.info('[Filmdappa CRM] Normalized Supabase URL from:', rawUrl, 'to:', supabaseUrl)
}

const rawKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.SUPABASE_KEY as string | undefined) ||
  ''
)

export const supabaseAnonKey = rawKey?.trim().replace(/^['"]|['"]$/g, '').trim() || ''

// ─── Config validation ─────────────────────────────────────────────────────

const PLACEHOLDER = 'PASTE_YOUR_PUBLISHABLE_KEY_HERE'

if (!supabaseUrl) {
  console.error(
    '[Filmdappa CRM] Error: Missing environment variable VITE_SUPABASE_URL. ' +
    'Please set VITE_SUPABASE_URL in your deployment environment variables or local .env file.'
  )
}

if (!supabaseAnonKey) {
  console.error(
    '[Filmdappa CRM] Error: Missing environment variable VITE_SUPABASE_ANON_KEY. ' +
    'Please set VITE_SUPABASE_ANON_KEY in your deployment environment variables or local .env file.'
  )
}

function isConfigured(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) return false
  if (supabaseAnonKey === PLACEHOLDER || supabaseAnonKey === 'placeholder-anon-key-replace-in-env') return false
  if (supabaseUrl.includes('placeholder') || supabaseUrl.includes('YOUR_PROJECT_REF')) return false
  return true
}

export const isSupabaseReady = isConfigured()

// ─── Safe Diagnostic & Self-Healing Fetch ──────────────────────────────────

function createSafeDiagnosticFetch(nativeFetch: typeof fetch = fetch): typeof fetch {
  return async function safeSupabaseFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    let urlString = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url

    const originalUrl = urlString
    const repairedUrl = repairSupabaseUrl(urlString)
    const isRepaired = repairedUrl !== originalUrl

    if (isRepaired) {
      console.warn(
        '[Filmdappa CRM] Repaired malformed Supabase request URL:\n' +
        `  Original: ${getSafeDisplayUrl(originalUrl)}\n` +
        `  Repaired: ${getSafeDisplayUrl(repairedUrl)}`
      )
      if (typeof input === 'string' || input instanceof URL) {
        input = repairedUrl
      } else {
        try {
          input = new Request(repairedUrl, input as Request)
        } catch {
          input = repairedUrl
        }
      }
      urlString = repairedUrl
    }

    const safeUrl = getSafeDisplayUrl(urlString)
    const method = init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')

    try {
      const response = await nativeFetch(input, init)
      if (!response.ok) {
        console.warn(
          `[Filmdappa CRM Supabase HTTP] ${method} ${safeUrl} -> Status ${response.status} (${response.statusText || 'Error'})`
        )
      }
      return response
    } catch (fetchError: unknown) {
      console.error(
        `[Filmdappa CRM Supabase Network Error] ${method} ${safeUrl} -> Failed to connect:`,
        fetchError instanceof Error ? fetchError.message : fetchError
      )
      throw fetchError
    }
  }
}

// ─── Supabase Client ───────────────────────────────────────────────────────

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey && supabaseAnonKey !== PLACEHOLDER
    ? supabaseAnonKey
    : 'placeholder-anon-key-replace-in-env',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: createSafeDiagnosticFetch(typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined),
    },
  }
)

// ─── Diagnostic Helpers ────────────────────────────────────────────────────

export function getSupabaseDiagnostics() {
  const isCleanRoot = !supabaseUrl.includes('/rest') && !supabaseUrl.includes('/auth')
  const clientAuthUrl = (supabase as any)?.authUrl?.toString?.() || (supabase as any)?.auth?.url || 'unknown'
  const clientRestUrl = (supabase as any)?.rest?.url || 'unknown'

  return {
    environment: import.meta.env.MODE || 'production',
    configured: isSupabaseReady,
    projectOrigin: supabaseUrl,
    isValidRootUrl: isCleanRoot,
    authEndpoint: clientAuthUrl,
    restEndpoint: clientRestUrl,
    hasAnonKey: Boolean(supabaseAnonKey && supabaseAnonKey !== PLACEHOLDER),
    anonKeyPrefix: supabaseAnonKey ? `${supabaseAnonKey.slice(0, 8)}...` : 'none',
  }
}

if (typeof window !== 'undefined') {
  ;(window as any).__FILMDAPPA_SUPABASE_DIAGNOSTICS__ = getSupabaseDiagnostics
  console.info('[Filmdappa CRM Supabase Diagnostics]', getSupabaseDiagnostics())
}

// ─── Database type definitions ─────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      authorized_users: {
        Row: {
          id: string
          email: string
          role: 'owner' | 'finance_admin' | 'viewer'
          full_name: string
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['authorized_users']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['authorized_users']['Insert']>
      }
      auth_audit_log: {
        Row: {
          id: string
          event: string
          email: string | null
          user_id: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['auth_audit_log']['Row'], 'id' | 'created_at'>
        Update: never
      }
      face_verification_sessions: {
        Row: {
          id: string
          user_id: string
          session_token: string
          consent_acknowledged: boolean
          face_detected: boolean
          verified_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['face_verification_sessions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['face_verification_sessions']['Insert']>
      }
    }
  }
}
