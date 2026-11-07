import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { VaultMark } from '@/components/VaultMark'
import gsap from 'gsap'
import { useEffect, useRef } from 'react'
import { call, zeus } from '@/lib/api'
import { useSession } from '@/stores/session'
import { toastError } from '@/stores/toast'

export function Login() {
  const navigate = useNavigate()
  const setAuthenticated = useSession((s) => s.setAuthenticated)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(panelRef.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' })
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const deviceId = getDeviceId()
      const result = await call(zeus.session.login({ username: username.trim(), password, remember, deviceId }))
      setAuthenticated(result.user, result.session.sessionRef, result.session.expiresAt, result.app)
      navigate('/overview', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Access denied.'
      setError(message)
      toastError('ACCESS DENIED', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vault-stage relative flex h-full w-full overflow-hidden">
      <div className="vault-grain" />
      {/* Left - typography & schematic */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-vault-border-soft p-10 lg:flex">
        <Schematic />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <VaultMark size={40} />
            <div className="micro-label">Zeus Vault · Secure Dossier System</div>
          </div>
          <h1 className="mt-8 font-condensed text-[96px] font-bold leading-[0.92] tracking-tight text-vault-text xl:text-[128px]">
            ZEUS<br />
            <span className="text-vault-red">VAULT</span>
          </h1>
          <p className="mt-6 max-w-md text-[13px] leading-relaxed text-vault-text2">
            Private, encrypted profile intelligence. Every record a structured dossier. Every change accounted for.
          </p>
          <div className="mt-10 flex gap-6 font-mono text-[9px] uppercase tracking-[0.24em] text-vault-muted">
            <span>AES-256-GCM</span>
            <span>·</span>
            <span>Argon2id</span>
            <span>·</span>
            <span>Audit-Chained</span>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between font-mono text-[8.5px] uppercase tracking-[0.3em] text-vault-muted">
          <span>Handler access only</span>
          <span>Unauthorized access is a prosecutable offense</span>
        </div>
      </div>

      {/* Right - authentication panel */}
      <div className="relative z-10 flex w-full items-center justify-center lg:w-[520px] xl:w-[560px]">
        <div ref={panelRef} className="w-full max-w-md px-8">
          <div className="micro-label mb-2 flex items-center gap-2"><VaultMark size={13} /> Authentication Required</div>
          <h2 className="font-condensed text-4xl font-semibold tracking-wide text-vault-text">IDENTIFY YOURSELF</h2>
          <p className="mt-1.5 text-[11px] leading-relaxed text-vault-text2">
            Authorized personnel only. Failed attempts are logged and brute-force protection is enforced.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="username" className="micro-label mb-1.5 block">Username</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="vault-input h-11 w-full px-3 font-mono"
                placeholder="e.g. operator"
              />
            </div>
            <div>
              <label htmlFor="password" className="micro-label mb-1.5 block">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="vault-input h-11 w-full px-3 pr-11 font-mono tracking-wider"
                  placeholder="••••••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-muted transition-colors hover:text-vault-text"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="border border-vault-red/40 bg-vault-red/[0.08] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-vault-red">
                {error}
              </div>
            )}

            <label className="flex cursor-pointer select-none items-center gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={remember}
                onClick={() => setRemember((v) => !v)}
                className={`h-4 w-4 rounded-[2px] border transition-colors ${remember ? 'border-vault-red bg-vault-red' : 'border-white/20 bg-transparent'}`}
              >
                {remember && <svg viewBox="0 0 16 16" className="h-4 w-4 text-[#0D0507]"><path fill="currentColor" d="M6.2 12.4 2.4 8.6l1.5-1.5 2.3 2.3 5.9-5.9 1.5 1.5z" /></svg>}
              </button>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">Remember trusted device (90 days)</span>
            </label>

            <button type="submit" disabled={busy || !username.trim() || !password} className="vault-btn vault-btn-primary h-11 w-full justify-center !text-[11px]">
              {busy ? 'AUTHENTICATING…' : 'AUTHENTICATE'}
            </button>

            <p className="pt-1 text-center font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.18em] text-vault-muted">
              Account recovery is handled by your administrator<br />Failed logins are recorded in the audit log
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

function getDeviceId(): string {
  const key = 'zeus-device-id'
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(key, id)
    return id
  } catch {
    return 'unknown-device'
  }
}

function Schematic() {
  return (
    <svg className="pointer-events-none absolute -right-32 top-1/2 h-[720px] w-[720px] -translate-y-1/2 opacity-60" viewBox="0 0 720 720" fill="none" aria-hidden="true">
      <circle cx="360" cy="360" r="350" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="2 7" />
      <circle cx="360" cy="360" r="260" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <circle cx="360" cy="360" r="170" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="30 12" />
      <circle cx="360" cy="360" r="90" stroke="rgba(227,75,100,0.35)" strokeWidth="1" />
      <line x1="360" y1="0" x2="360" y2="720" stroke="rgba(255,255,255,0.045)" />
      <line x1="0" y1="360" x2="720" y2="360" stroke="rgba(255,255,255,0.045)" />
      <line x1="104" y1="104" x2="616" y2="616" stroke="rgba(255,255,255,0.03)" />
      <line x1="616" y1="104" x2="104" y2="616" stroke="rgba(255,255,255,0.03)" />
      <circle cx="360" cy="360" r="3.5" fill="#E34B64" />
      <circle cx="360" cy="360" r="14" stroke="#E34B64" strokeOpacity="0.4" />
      <text x="372" y="330" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="'IBM Plex Mono'" letterSpacing="2">51.5072° N</text>
      <text x="372" y="412" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="'IBM Plex Mono'" letterSpacing="2">0.1276° W</text>
    </svg>
  )
}
