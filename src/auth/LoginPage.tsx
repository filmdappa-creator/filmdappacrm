import { FormEvent, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
import { FaceVerification } from './FaceVerification'
import filmdappaLogo from '../assets/filmdappa-logo.jpg'

// ─── Shared branded shell ─────────────────────────────────────────────────────

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="login-page">
      <section className="login-brand">
        <header className="login-brand-header">
          <img
            src={filmdappaLogo}
            alt="Filmdappa logo"
            className="login-brand-logo"
          />
          <div className="login-brand-text">
            <strong>FILMDAPPA</strong>
            <small>MEDIA COMPANY</small>
          </div>
        </header>

        <div className="login-brand-body">
          <span className="login-brand-badge">SECURE WORKSPACE</span>
          <h1>A clearer view of your business.</h1>
          <p>
            Multi-step identity verification protects your financial records and
            client data.
          </p>
        </div>

        <footer className="login-brand-footer">
          <small className="copyright">© 2026 Filmdappa Media Company</small>
        </footer>
      </section>
      <section className="login-form-wrap">{children}</section>
    </main>
  )
}

// ─── Config-missing warning ───────────────────────────────────────────────────

function SupabaseNotConfigured() {
  return (
    <div className="login-form">
      <div className="login-form-head">
        <span className="eyebrow">Configuration Required</span>
        <h2>Almost ready</h2>
        <p>One more step before you can log in.</p>
      </div>
      <div className="auth-notice auth-notice--warn">
        <strong>Add your Supabase publishable key</strong>
        <p>
          Your <code>.env</code> file has been created with the project URL.
          Open it in any text editor and replace <code>PASTE_YOUR_PUBLISHABLE_KEY_HERE</code>
          with your actual key, then restart the dev server.
        </p>
        <pre className="auth-code-block">{`# Open .env in the project root and edit:
VITE_SUPABASE_ANON_KEY=sb_publishable_your_actual_key_here

# Get it from:
# Supabase Dashboard → Settings → API → "anon public" key`}</pre>
        <p>
          After saving, press <strong>Ctrl+C</strong> to stop the dev server, then
          run <strong>npm run dev</strong> again.
        </p>
      </div>
    </div>
  )
}

// ─── Step 1 – Email entry ─────────────────────────────────────────────────────

function EmailStep() {
  const { sendOtp, isLoading, error, clearError, isSupabaseConfigured } = useAuth()
  const [email, setEmail] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await sendOtp(email)
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="login-form-head">
        <span className="eyebrow">Authorized access</span>
        <h2>Secure Login</h2>
        <p>Verify your identity to access Filmdappa CRM</p>
      </div>

      {!isSupabaseConfigured && (
        <div className="auth-notice auth-notice--warn">
          <strong>Key not configured</strong>
          <p>Open <code>.env</code> in your project root, replace the placeholder with your Supabase publishable key, then restart the dev server.</p>
        </div>
      )}

      <label className="field">
        <span>Work email address</span>
        <input
          id="login-email"
          type="email"
          placeholder="name@filmdappa.com"
          value={email}
          onChange={e => { setEmail(e.target.value); clearError() }}
          required
          autoComplete="email"
          autoFocus
          disabled={isLoading}
        />
      </label>

      {error && (
        <div className="auth-notice auth-notice--error" role="alert">
          {error}
        </div>
      )}

      <button
        id="btn-send-otp"
        type="submit"
        className="btn btn-dark"
        disabled={isLoading || !email.trim()}
      >
        {isLoading ? <LoadingDots /> : 'Send verification code'}
      </button>

      <p className="security-note">
        Only authorized Filmdappa team members can access this workspace.
      </p>
    </form>
  )
}

// ─── Step 2 – OTP entry ───────────────────────────────────────────────────────

const OTP_LENGTH = 8
const OTP_COOLDOWN_SECONDS = 60

function OtpStep() {
  const { verifyOtp, sendOtp, email, isLoading, error, clearError, otpSentAt } = useAuth()
  const [otp, setOtp] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Countdown timer for resend button
  useEffect(() => {
    if (!otpSentAt) return
    const tick = () => {
      const elapsed = Math.floor((Date.now() - otpSentAt) / 1000)
      const remaining = Math.max(0, OTP_COOLDOWN_SECONDS - elapsed)
      setCooldown(remaining)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [otpSentAt])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (otp.trim().length === OTP_LENGTH) {
      await verifyOtp(otp.trim())
    }
  }

  const handleResend = async () => {
    setOtp('')
    clearError()
    await sendOtp(email)
  }

  const handleOtpChange = (value: string) => {
    // Only allow digits up to OTP_LENGTH
    const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
    setOtp(digits)
    clearError()
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="login-form-head">
        <span className="eyebrow">Email verification</span>
        <h2>Enter your code</h2>
        <p>
          We sent an 8-digit code to{' '}
          <strong style={{ color: 'var(--black)' }}>{email}</strong>.
          <br />
          It expires in 5 minutes.
        </p>
      </div>

      <label className="field">
        <span>Verification code</span>
        <input
          id="login-otp"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="00000000"
          value={otp}
          onChange={e => handleOtpChange(e.target.value)}
          autoComplete="one-time-code"
          autoFocus
          maxLength={OTP_LENGTH}
          disabled={isLoading}
        />
      </label>

      {error && (
        <div className="auth-notice auth-notice--error" role="alert">
          {error}
        </div>
      )}

      <button
        id="btn-verify-otp"
        type="submit"
        className="btn btn-dark"
        disabled={isLoading || otp.trim().length !== OTP_LENGTH}
      >
        {isLoading ? <LoadingDots /> : 'Verify code'}
      </button>

      <div className="auth-resend-row">
        <span>Didn't receive it?</span>
        <button
          id="btn-resend-otp"
          type="button"
          className="text-link"
          onClick={handleResend}
          disabled={isLoading || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>

      <p className="security-note">
        Check your spam folder if you don't see it within a minute.
      </p>
    </form>
  )
}

// ─── Loading dots ─────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <span className="auth-loading-dots" aria-label="Loading">
      <span /><span /><span />
    </span>
  )
}

// ─── Main Login router ────────────────────────────────────────────────────────

export function LoginPage() {
  const { step, isLoading, isSupabaseConfigured } = useAuth()

  if (isLoading && step === 'email') {
    return (
      <LoginShell>
        <div className="login-form" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <LoadingDots />
        </div>
      </LoginShell>
    )
  }

  if (!isSupabaseConfigured && step === 'email') {
    return (
      <LoginShell>
        <SupabaseNotConfigured />
      </LoginShell>
    )
  }

  if (step === 'face') {
    return (
      <LoginShell>
        <FaceVerification />
      </LoginShell>
    )
  }

  return (
    <LoginShell>
      {step === 'otp' ? <OtpStep /> : <EmailStep />}
    </LoginShell>
  )
}
