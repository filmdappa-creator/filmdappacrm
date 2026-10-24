import { createClient } from '@supabase/supabase-js'

// ─── Read credentials from Vite environment ────────────────────────────────
// The env var is named VITE_SUPABASE_ANON_KEY to match the existing auth code.
// Supabase now calls this the "publishable key" (starts with sb_publishable_...)
// Both formats (sb_publishable_... and eyJ...) work with the Supabase JS client.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined

// ─── Config validation ─────────────────────────────────────────────────────

const PLACEHOLDER = 'PASTE_YOUR_PUBLISHABLE_KEY_HERE'

function isConfigured(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) return false
  if (supabaseAnonKey === PLACEHOLDER) return false
  if (supabaseUrl.includes('placeholder')) return false
  return true
}

export const isSupabaseReady = isConfigured()

if (!isSupabaseReady) {
  if (!supabaseUrl) {
    console.error('[Filmdappa CRM] VITE_SUPABASE_URL is missing. Add it to your .env file.')
  } else if (!supabaseAnonKey || supabaseAnonKey === PLACEHOLDER) {
    console.error(
      '[Filmdappa CRM] VITE_SUPABASE_ANON_KEY is not set. ' +
      'Open your .env file and replace PASTE_YOUR_PUBLISHABLE_KEY_HERE ' +
      'with your Supabase publishable (anon) key, then restart the dev server.'
    )
  }
}

// ─── Supabase client ────────────────────────────────────────────────────────
// We always create the client (with safe fallbacks) so imports don't crash.
// isSupabaseReady tells callers whether to proceed with real API calls.

export const supabase = createClient(
  supabaseUrl || 'https://hzxbafhukbnopygzsvyc.supabase.co',
  supabaseAnonKey && supabaseAnonKey !== PLACEHOLDER
    ? supabaseAnonKey
    : 'placeholder-anon-key-replace-in-env',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)

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
