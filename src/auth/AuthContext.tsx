import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseReady } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthStep =
  | 'email'          // Enter email address
  | 'otp'            // Enter OTP code
  | 'face'           // Webcam presence check
  | 'authenticated'  // Fully authenticated

export type AuthState = {
  step: AuthStep
  session: Session | null
  user: User | null
  email: string
  otpSentAt: number | null        // Unix ms timestamp of last OTP send
  otpAttempts: number             // Failed OTP attempts in current session
  faceVerified: boolean           // Whether presence check passed
  isLoading: boolean
  error: string | null
  isSupabaseConfigured: boolean
}

export type AuthActions = {
  sendOtp: (email: string) => Promise<void>
  verifyOtp: (token: string) => Promise<void>
  completeFaceVerification: () => Promise<void>
  cancelFaceVerification: () => void
  logout: () => Promise<void>
  clearError: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_COOLDOWN_SECONDS = 60
const MAX_OTP_ATTEMPTS = 5

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<(AuthState & AuthActions) | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// ─── Audit Logging (non-blocking, best-effort) ────────────────────────────────

async function logAuditEvent(
  event: string,
  email?: string | null,
  userId?: string | null,
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.from('auth_audit_log').insert({
      event,
      email: email ?? null,
      user_id: userId ?? null,
      metadata: metadata ?? null,
    })
  } catch {
    // Non-blocking — audit log failures should not block the auth flow
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const isSupabaseConfigured = isSupabaseReady

  const [state, setState] = useState<AuthState>({
    step: 'email',
    session: null,
    user: null,
    email: '',
    otpSentAt: null,
    otpAttempts: 0,
    faceVerified: false,
    isLoading: true,
    error: null,
    isSupabaseConfigured,
  })

  // ── Restore session on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, isLoading: false }))
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && session.user?.email) {
        try {
          const { data: authUser, error: authError } = await supabase
            .from('authorized_users')
            .select('id, email, is_active')
            .eq('email', session.user.email)
            .maybeSingle()

          if (!authError && authUser && authUser.is_active === false) {
            await supabase.auth.signOut()
            setState(s => ({ ...s, session: null, user: null, step: 'email', isLoading: false }))
            return
          }
        } catch {
          // If table check fails, proceed with session
        }

        setState(s => ({
          ...s,
          session,
          user: session.user,
          email: session.user.email ?? '',
          step: 'authenticated',
          isLoading: false,
        }))
      } else {
        setState(s => ({ ...s, isLoading: false }))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState(s => ({
          ...s,
          session: null,
          user: null,
          step: 'email',
          email: '',
          otpSentAt: null,
          otpAttempts: 0,
        }))
      }
    })

    return () => subscription.unsubscribe()
  }, [isSupabaseConfigured])

  // ── Actions ──────────────────────────────────────────────────────────────

  const sendOtp = async (email: string) => {
    const trimmed = email.trim().toLowerCase()

    // Rate limit: check cooldown
    if (state.otpSentAt && Date.now() - state.otpSentAt < OTP_COOLDOWN_SECONDS * 1000) {
      const remaining = Math.ceil((OTP_COOLDOWN_SECONDS * 1000 - (Date.now() - state.otpSentAt)) / 1000)
      setState(s => ({ ...s, error: `Please wait ${remaining}s before requesting a new code.` }))
      return
    }

    setState(s => ({ ...s, isLoading: true, error: null }))

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
      }

      // ── Check public.authorized_users allow-list & active status ─────────
      try {
        const { data: authUser, error: checkError } = await supabase
          .from('authorized_users')
          .select('id, email, is_active')
          .eq('email', trimmed)
          .maybeSingle()

        if (!checkError && authUser) {
          if (authUser.is_active === false) {
            throw new Error('This account has been deactivated. Contact your administrator.')
          }
        } else if (!checkError && authUser === null) {
          throw new Error('This email is not authorized to access Filmdappa CRM. Contact your administrator.')
        }
      } catch (checkErr) {
        if (
          checkErr instanceof Error &&
          (checkErr.message.includes('not authorized') || checkErr.message.includes('deactivated'))
        ) {
          throw checkErr
        }
      }

      // Supabase OTP: sends an 8-digit OTP to the email.
      // Only authorized users (those who have accounts in Supabase Auth) should receive the OTP.
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false, // Only allow pre-registered users
        },
      })

      if (error) {
        // Supabase returns various messages for unregistered/disabled users
        const msg = error.message.toLowerCase()
        if (
          msg.includes('signups not allowed') ||
          msg.includes('user not found') ||
          msg.includes('email not confirmed') ||
          msg.includes('invalid login credentials')
        ) {
          throw new Error('This email is not authorized to access Filmdappa CRM. Contact your administrator.')
        }
        // Supabase rate-limit message
        if (msg.includes('for security purposes')) {
          throw new Error('Too many requests. Please wait a moment before trying again.')
        }
        throw error
      }

      await logAuditEvent('otp_requested', trimmed)

      setState(s => ({
        ...s,
        email: trimmed,
        otpSentAt: Date.now(),
        step: 'otp',
        isLoading: false,
        error: null,
      }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send verification code.'
      await logAuditEvent('otp_request_failed', trimmed, null, { reason: message })
      setState(s => ({ ...s, isLoading: false, error: message }))
    }
  }

  const verifyOtp = async (token: string) => {
    if (state.otpAttempts >= MAX_OTP_ATTEMPTS) {
      setState(s => ({
        ...s,
        error: 'Too many failed attempts. Please request a new verification code.',
        step: 'email',
        otpAttempts: 0,
      }))
      return
    }

    setState(s => ({ ...s, isLoading: true, error: null }))

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: state.email,
        token: token.trim(),
        type: 'email',
      })

      if (error) {
        const attempts = state.otpAttempts + 1
        const remaining = MAX_OTP_ATTEMPTS - attempts

        let message = 'Incorrect or expired verification code.'
        if (attempts >= MAX_OTP_ATTEMPTS) {
          message = 'Too many failed attempts. Please request a new code.'
        } else if (remaining === 1) {
          message = `Incorrect code. 1 attempt remaining.`
        } else {
          message = `Incorrect code. ${remaining} attempts remaining.`
        }

        await logAuditEvent('otp_verification_failed', state.email, null, { attempts })

        setState(s => ({
          ...s,
          isLoading: false,
          error: message,
          otpAttempts: attempts,
          ...(attempts >= MAX_OTP_ATTEMPTS ? { step: 'email', otpAttempts: 0 } : {}),
        }))
        return
      }

      // ── Verify against public.authorized_users ─────────────────────────────
      try {
        const { data: authUser, error: authUserError } = await supabase
          .from('authorized_users')
          .select('id, email, is_active, role, full_name')
          .eq('email', state.email)
          .maybeSingle()

        if (!authUserError && authUser) {
          if (authUser.is_active === false) {
            await supabase.auth.signOut()
            await logAuditEvent('login_denied_inactive', state.email, data.user?.id)
            throw new Error('This account has been deactivated. Contact your administrator.')
          }
        } else if (!authUserError && authUser === null) {
          await supabase.auth.signOut()
          await logAuditEvent('login_denied_unauthorized', state.email, data.user?.id)
          throw new Error('This email is not authorized to access Filmdappa CRM. Contact your administrator.')
        }
      } catch (authCheckErr) {
        if (
          authCheckErr instanceof Error &&
          (authCheckErr.message.includes('deactivated') || authCheckErr.message.includes('not authorized'))
        ) {
          throw authCheckErr
        }
      }

      await logAuditEvent('otp_verification_success', state.email, data.user?.id)

      // Redirect to the authenticated CRM page
      setState(s => ({
        ...s,
        session: data.session,
        user: data.user,
        step: 'authenticated',
        isLoading: false,
        error: null,
        otpAttempts: 0,
      }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed.'
      setState(s => ({ ...s, isLoading: false, error: message }))
    }
  }

  const completeFaceVerification = async () => {
    setState(s => ({ ...s, isLoading: true, error: null }))
    try {
      // Record consent + presence check in the database
      if (state.user && isSupabaseConfigured) {
        await supabase.from('face_verification_sessions').insert({
          user_id: state.user.id,
          session_token: crypto.randomUUID(),
          consent_acknowledged: true,
          face_detected: true,
          verified_at: new Date().toISOString(),
        })
        await logAuditEvent('face_presence_check_passed', state.email, state.user.id)
      }

      // Mark face verified in sessionStorage (survives hot reload, not across tabs)
      sessionStorage.setItem('filmdappa_face_verified', 'true')

      setState(s => ({
        ...s,
        faceVerified: true,
        step: 'authenticated',
        isLoading: false,
      }))
    } catch {
      // Non-blocking — don't block login if DB write fails
      sessionStorage.setItem('filmdappa_face_verified', 'true')
      setState(s => ({ ...s, faceVerified: true, step: 'authenticated', isLoading: false }))
    }
  }

  const cancelFaceVerification = () => {
    // User opted out — log them out entirely
    logout()
  }

  const logout = async () => {
    if (state.user) {
      await logAuditEvent('logout', state.email, state.user.id)
    }
    sessionStorage.removeItem('filmdappa_face_verified')
    await supabase.auth.signOut()
    setState(s => ({
      ...s,
      session: null,
      user: null,
      step: 'email',
      faceVerified: false,
      email: '',
      otpSentAt: null,
      otpAttempts: 0,
      error: null,
    }))
  }

  const clearError = () => setState(s => ({ ...s, error: null }))

  return (
    <AuthContext.Provider value={{ ...state, sendOtp, verifyOtp, completeFaceVerification, cancelFaceVerification, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  )
}
