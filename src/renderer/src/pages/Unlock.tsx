import { FormEvent, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, LogOut } from 'lucide-react'
import { VaultMark } from '@/components/VaultMark'
import gsap from 'gsap'
import { useNavigate } from 'react-router-dom'
import { call, zeus } from '@/lib/api'
import { useSession } from '@/stores/session'
import { Avatar } from '@/components/Avatar'
import { toastError } from '@/stores/toast'

export function Unlock() {
  const navigate = useNavigate()
  const { user } = useSession()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(panelRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' })
    }
  }, [])

  const unlock = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      const result = await call(zeus.session.unlock({ password, keepSession: true }))
      useSession.getState().setAuthenticated(result.user, useSession.getState().sessionRef ?? 'SESSION', useSession.getState().sessionExpiresAt ?? '', useSession.getState().app!)
      navigate('/overview', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unlock failed.'
      setError(message)
      toastError('VAULT REMAINS LOCKED', message)
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    try {
      await call(zeus.session.logout())
    } catch {
      /* ignore */
    }
    useSession.getState().clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="vault-stage relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="vault-grain" />
      <div ref={panelRef} className="relative z-10 w-full max-w-md px-6">
        <div className="vault-panel p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center">
            <VaultMark size={44} />
          </div>
          <div className="micro-label mt-5">Vault Locked - Inactivity Timeout</div>
          <h1 className="mt-1.5 font-condensed text-4xl font-semibold tracking-wide text-vault-text">SESSION SEALED</h1>
          {user && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <Avatar src={user.avatar} name={user.fullName} size={38} />
              <div className="text-left">
                <div className="text-[12px] font-semibold text-vault-text">{user.fullName}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-vault-muted">@{user.username}</div>
              </div>
            </div>
          )}
          <form onSubmit={unlock} className="mt-6 space-y-3 text-left">
            <label className="micro-label block" htmlFor="unlock-password">Re-enter password</label>
            <div className="relative">
              <input id="unlock-password" autoFocus type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="vault-input h-11 w-full px-3 pr-11 font-mono" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••••••" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-muted hover:text-vault-text" aria-label="Toggle password">
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && <div role="alert" className="border border-vault-red/40 bg-vault-red/[0.08] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-vault-red">{error}</div>}
            <button type="submit" disabled={busy || !password} className="vault-btn vault-btn-primary h-11 w-full justify-center">
              {busy ? 'VERIFYING…' : 'UNSEAL VAULT'}
            </button>
          </form>
          <button onClick={() => void signOut()} className="mt-4 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-muted transition-colors hover:text-vault-text">
            <LogOut size={11} /> Terminate session instead
          </button>
        </div>
      </div>
    </div>
  )
}
