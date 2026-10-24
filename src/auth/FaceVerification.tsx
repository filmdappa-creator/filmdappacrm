import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraState =
  | 'consent'          // Showing consent + permission request
  | 'requesting'       // Waiting for browser permission
  | 'denied'           // Permission denied by user/browser
  | 'error'            // Camera unavailable / other error
  | 'active'           // Camera running, waiting for face
  | 'face_detected'    // Face is visible, ready to confirm
  | 'verifying'        // User clicked confirm, recording check
  | 'success'          // Check passed
  | 'unsupported'      // getUserMedia not supported

// ─── Face detection using browser ML (MediaPipe-free, lightweight) ────────────
// We use the browser's own face detection API where available.
// On browsers without FaceDetector (Chrome behind flag, Firefox, Safari),
// we fall back to a manual "hold still" timer after camera is active.
// This is PRESENCE CHECK ONLY — not biometric identity verification.

declare global {
  interface Window {
    FaceDetector?: new (opts?: { maxDetectedFaces?: number }) => {
      detect: (image: HTMLVideoElement) => Promise<Array<{ boundingBox: DOMRect }>>
    }
  }
}

const hasFaceDetectorAPI = typeof window !== 'undefined' && 'FaceDetector' in window

// ─── Component ────────────────────────────────────────────────────────────────

export function FaceVerification() {
  const { completeFaceVerification, cancelFaceVerification, isLoading, email } = useAuth()

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.FaceDetector>> | null>(null)
  const rafRef = useRef<number>(0)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cameraState, setCameraState] = useState<CameraState>('consent')
  const [consentChecked, setConsentChecked] = useState(false)
  const [faceVisible, setFaceVisible] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0) // 0-100
  const [error, setError] = useState<string | null>(null)

  // ── Stop stream on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // ── Request camera ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraState('requesting')
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Init FaceDetector if available
      if (hasFaceDetectorAPI && window.FaceDetector) {
        detectorRef.current = new window.FaceDetector({ maxDetectedFaces: 1 })
      }

      setCameraState('active')
      startDetectionLoop()
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setCameraState('denied')
      } else {
        setCameraState('error')
        setError(err instanceof Error ? err.message : 'Camera unavailable')
      }
    }
  }, [])

  // ── Detection loop ─────────────────────────────────────────────────────────
  const startDetectionLoop = useCallback(() => {
    if (hasFaceDetectorAPI && detectorRef.current) {
      // Use native FaceDetector API
      const detect = async () => {
        if (!videoRef.current || !detectorRef.current) return
        try {
          const faces = await detectorRef.current.detect(videoRef.current)
          const detected = faces.length > 0
          setFaceVisible(detected)
          setCameraState(s => s === 'active' || s === 'face_detected'
            ? detected ? 'face_detected' : 'active'
            : s)
        } catch {
          /* ignore frame errors */
        }
        rafRef.current = requestAnimationFrame(detect)
      }
      rafRef.current = requestAnimationFrame(detect)
    } else {
      // Fallback: assume face present after 3 seconds of camera being active
      // We CANNOT verify a face — we just know camera is live.
      // Label this clearly in the UI.
      const timer = setTimeout(() => {
        setFaceVisible(true)
        setCameraState(s => s === 'active' ? 'face_detected' : s)
      }, 3000)
      holdTimerRef.current = timer
    }
  }, [])

  // ── Hold-still progress bar ────────────────────────────────────────────────
  useEffect(() => {
    if (cameraState !== 'face_detected') {
      setHoldProgress(0)
      return
    }
    // Animate a 2-second "hold still" bar before user can confirm
    const start = Date.now()
    const HOLD_MS = 2000
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - start) / HOLD_MS) * 100)
      setHoldProgress(pct)
      if (pct < 100) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraState])

  // ── Confirm presence ───────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!faceVisible) return
    setCameraState('verifying')
    stopCamera()
    await completeFaceVerification()
    setCameraState('success')
  }

  const handleCancel = () => {
    stopCamera()
    cancelFaceVerification()
  }

  const handleRetry = () => {
    stopCamera()
    setFaceVisible(false)
    setHoldProgress(0)
    setConsentChecked(false)
    setCameraState('consent')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="login-form">
      <div>
        <span className="eyebrow">Step 2 of 2 — Presence check</span>
        <h2>Camera verification</h2>
        <p>
          Confirm you're present before accessing the workspace.
        </p>
      </div>

      {/* ── Consent screen ── */}
      {cameraState === 'consent' && (
        <ConsentScreen
          email={email}
          consentChecked={consentChecked}
          onConsentChange={setConsentChecked}
          onProceed={startCamera}
          onCancel={handleCancel}
        />
      )}

      {/* ── Requesting permission ── */}
      {cameraState === 'requesting' && (
        <div className="auth-camera-box auth-camera-box--msg">
          <CameraIcon />
          <strong>Waiting for camera permission…</strong>
          <p>Allow camera access in your browser's permission prompt.</p>
        </div>
      )}

      {/* ── Permission denied ── */}
      {cameraState === 'denied' && (
        <div className="auth-camera-box auth-camera-box--msg">
          <CameraOffIcon />
          <strong>Camera access denied</strong>
          <p>
            You blocked camera access. To continue, allow camera access in your
            browser's address bar or site settings, then try again.
          </p>
          <div className="auth-btn-row">
            <button id="btn-face-retry" className="btn btn-dark" onClick={handleRetry}>Try again</button>
            <button id="btn-face-cancel" className="btn btn-outline" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Unsupported ── */}
      {cameraState === 'unsupported' && (
        <div className="auth-camera-box auth-camera-box--msg">
          <CameraOffIcon />
          <strong>Camera not supported</strong>
          <p>
            Your browser or device doesn't support webcam access. Use a modern
            browser (Chrome, Edge, or Firefox) on a device with a camera.
          </p>
          <button id="btn-face-cancel-unsupported" className="btn btn-outline" onClick={handleCancel}>Cancel</button>
        </div>
      )}

      {/* ── Error ── */}
      {cameraState === 'error' && (
        <div className="auth-camera-box auth-camera-box--msg">
          <CameraOffIcon />
          <strong>Camera error</strong>
          <p>{error || 'Could not access the camera. Check that no other app is using it.'}</p>
          <div className="auth-btn-row">
            <button id="btn-face-retry-err" className="btn btn-dark" onClick={handleRetry}>Try again</button>
            <button id="btn-face-cancel-err" className="btn btn-outline" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Active camera ── */}
      {(cameraState === 'active' || cameraState === 'face_detected' || cameraState === 'verifying') && (
        <CameraView
          videoRef={videoRef}
          cameraState={cameraState}
          faceVisible={faceVisible}
          holdProgress={holdProgress}
          hasFaceDetector={hasFaceDetectorAPI}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      )}

      {/* ── Success ── */}
      {cameraState === 'success' && (
        <div className="auth-camera-box auth-camera-box--msg">
          <CheckCircleIcon />
          <strong>Presence confirmed</strong>
          <p>Access granted. Loading your workspace…</p>
        </div>
      )}

      {/* ── Honest disclaimer ── */}
      {(cameraState === 'active' || cameraState === 'face_detected' || cameraState === 'consent') && (
        <p className="auth-disclaimer">
          ⚠️ <strong>Presence check only.</strong> This step confirms you are in
          front of the device. It does not verify your identity against a stored
          biometric template and cannot detect spoofing or impersonation.
        </p>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConsentScreen({
  email, consentChecked, onConsentChange, onProceed, onCancel
}: {
  email: string
  consentChecked: boolean
  onConsentChange: (v: boolean) => void
  onProceed: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="auth-notice auth-notice--info">
        <strong>Camera access required</strong>
        <p>
          Logging in as <strong>{email}</strong>. The next step uses your device
          camera to confirm you are present. Your video is processed locally in
          this browser tab and is not recorded, stored, or transmitted.
        </p>
      </div>
      <label className="auth-consent-label">
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={e => onConsentChange(e.target.checked)}
          id="face-consent"
        />
        <span>
          I understand this is a presence check only (not biometric identity
          verification) and I consent to the camera being used for this purpose.
        </span>
      </label>
      <div className="auth-btn-row">
        <button
          id="btn-face-proceed"
          className="btn btn-dark"
          onClick={onProceed}
          disabled={!consentChecked}
        >
          Enable camera
        </button>
        <button id="btn-face-cancel-consent" className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  )
}

function CameraView({
  videoRef,
  cameraState,
  faceVisible,
  holdProgress,
  hasFaceDetector,
  onConfirm,
  onCancel,
  isLoading,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  cameraState: CameraState
  faceVisible: boolean
  holdProgress: number
  hasFaceDetector: boolean
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}) {
  const isVerifying = cameraState === 'verifying'
  const faceDetected = cameraState === 'face_detected'
  const ready = faceDetected && holdProgress >= 100

  let statusLabel = 'Looking for face…'
  if (!hasFaceDetector) statusLabel = 'Camera active — click Confirm when ready'
  else if (faceDetected) statusLabel = 'Face detected — hold still…'
  if (faceVisible && holdProgress >= 100) statusLabel = 'Ready to confirm'
  if (isVerifying) statusLabel = 'Confirming…'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className={`auth-camera-box ${faceDetected ? 'auth-camera-box--detected' : ''}`}>
        <video
          ref={videoRef}
          className="auth-video"
          playsInline
          muted
          aria-label="Camera preview"
        />
        {/* Face frame overlay */}
        <div className={`auth-face-frame ${faceDetected ? 'auth-face-frame--active' : ''}`} />
        {isVerifying && <div className="auth-verifying-overlay"><span>Confirming…</span></div>}
      </div>

      {/* Progress bar */}
      {faceDetected && holdProgress < 100 && hasFaceDetector && (
        <div className="auth-hold-bar">
          <div style={{ width: `${holdProgress}%` }} />
        </div>
      )}

      <div className="auth-status-row">
        <span className={`auth-status-dot ${faceDetected ? 'auth-status-dot--on' : ''}`} />
        <span style={{ fontSize: '11px' }}>{statusLabel}</span>
      </div>

      <div className="auth-btn-row">
        <button
          id="btn-face-confirm"
          className="btn btn-dark"
          onClick={onConfirm}
          disabled={isVerifying || isLoading || (hasFaceDetector && !ready)}
        >
          {isVerifying ? 'Confirming…' : 'Confirm presence'}
        </button>
        <button id="btn-face-cancel-active" className="btn btn-outline" onClick={onCancel} disabled={isVerifying}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7 16 12 23 17V7z" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

function CameraOffIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" /><path d="M16 16H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-3h6" />
      <path d="M11.5 5H17a2 2 0 0 1 2 2v3.8M17 17l6 5V7" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
