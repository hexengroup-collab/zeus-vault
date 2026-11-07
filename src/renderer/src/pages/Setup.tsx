import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { VaultMark } from '@/components/VaultMark'
import gsap from 'gsap'
import { useEffect, useRef } from 'react'
import { call, zeus } from '@/lib/api'
import { passwordStrength } from '@/lib/format'
import { toastError } from '@/stores/toast'
import { useSession } from '@/stores/session'

export function Setup() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'intro' | 'account' | 'done'>('intro')
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [seedDemo, setSeedDemo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (panelRef.current) gsap.fromTo(panelRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' })
  }, [step])

  const strength = passwordStrength(password)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await call(zeus.setup.initialize({ adminFullName: fullName.trim(), adminUsername: username.trim(), adminEmail: email.trim(), password, seedDemoData: seedDemo }))
      useSession.getState().setBoot('needs-login')
      setStep('done')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Setup failed.'
      setError(message)
      toastError('SETUP FAILED', message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vault-stage relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="vault-grain" />
      <div ref={panelRef} className="relative z-10 w-full max-w-2xl px-6">
        {step === 'intro' && (
          <div className="vault-panel p-8">
            <div className="flex items-center gap-3">
              <VaultMark size={44} />
              <div className="micro-label">First-Run Initialization</div>
            </div>
            <h1 className="mt-5 font-condensed text-5xl font-bold leading-[0.95] tracking-tight text-vault-text">
              FORGE THE<br />
              <span className="text-vault-red">VAULT</span>
            </h1>
            <p className="mt-4 max-w-md text-[12px] leading-relaxed text-vault-text2">
              One-time initialization. Zeus Vault will generate a master encryption key protected by your operating system's secure keychain, create an encrypted local database, and assign you as administrator.
            </p>
            <ul className="mt-6 space-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-vault-text2">
              <li className="flex items-center gap-2"><Check size={11} className="text-vault-green" /> Master key generated locally - never leaves this machine</li>
              <li className="flex items-center gap-2"><Check size={11} className="text-vault-green" /> Argon2id password hashing</li>
              <li className="flex items-center gap-2"><Check size={11} className="text-vault-green" /> Append-only, hash-chained audit log</li>
              <li className="flex items-center gap-2"><Check size={11} className="text-vault-green" /> Single active session per user</li>
            </ul>
            <button className="vault-btn vault-btn-primary mt-8 h-11 w-full justify-center" onClick={() => setStep('account')}>
              Begin Initialization <ArrowRight size={13} />
            </button>
          </div>
        )}

        {step === 'account' && (
          <form onSubmit={submit} className="vault-panel p-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="micro-label">Step 1 of 1 - Administrator</div>
                <h2 className="mt-1 font-condensed text-3xl font-semibold tracking-wide text-vault-text">CREATE THE ADMIN ACCOUNT</h2>
              </div>
              <KeyRound size={22} strokeWidth={1.5} className="text-vault-amber" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="micro-label mb-1.5 block" htmlFor="su-name">Full Name</label>
                <input id="su-name" autoFocus className="vault-input h-10 w-full px-3" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Reyes" />
              </div>
              <div>
                <label className="micro-label mb-1.5 block" htmlFor="su-username">Username</label>
                <input id="su-username" autoComplete="off" spellCheck={false} className="vault-input h-10 w-full px-3 font-mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="operator" />
              </div>
              <div>
                <label className="micro-label mb-1.5 block" htmlFor="su-email">Email</label>
                <input id="su-email" autoComplete="off" spellCheck={false} className="vault-input h-10 w-full px-3 font-mono" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operator@example.com" />
              </div>
              <div className="md:col-span-2">
                <label className="micro-label mb-1.5 block" htmlFor="su-password">Password</label>
                <div className="relative">
                  <input id="su-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="vault-input h-10 w-full px-3 pr-10 font-mono" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 12 characters, mixed case, number, symbol" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-muted hover:text-vault-text" aria-label="Toggle password">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-1 flex-1 gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-full flex-1 rounded-full transition-colors ${i < strength.score + (password ? 1 : 0) ? strength.score < 2 ? 'bg-vault-red' : strength.score < 3 ? 'bg-vault-amber' : 'bg-vault-green' : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-vault-text2">{strength.label}</span>
                </div>
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-sm border border-white/[0.07] bg-white/[0.02] p-3">
              <button type="button" role="checkbox" aria-checked={seedDemo} onClick={() => setSeedDemo((v) => !v)} className={`mt-0.5 h-4 w-4 shrink-0 rounded-[2px] border ${seedDemo ? 'border-vault-red bg-vault-red' : 'border-white/20'}`}>
                {seedDemo && <svg viewBox="0 0 16 16" className="h-4 w-4 text-[#0D0507]"><path fill="currentColor" d="M6.2 12.4 2.4 8.6l1.5-1.5 2.3 2.3 5.9-5.9 1.5 1.5z" /></svg>}
              </button>
              <span>
                <span className="block text-[11px] font-semibold text-vault-text">Seed fictional demonstration dossiers</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-vault-text2">24 clearly-labeled fictional records so every screen has real data. Remove any time from All Profiles (filter DEMO).</span>
              </span>
            </label>

            {error && <div role="alert" className="mt-4 border border-vault-red/40 bg-vault-red/[0.08] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-vault-red">{error}</div>}

            <div className="mt-6 flex items-center gap-3">
              <button type="button" className="vault-btn vault-btn-ghost" onClick={() => setStep('intro')}>Back</button>
              <button type="submit" disabled={busy} className="vault-btn vault-btn-primary h-11 flex-1 justify-center">
                {busy ? 'FORGING VAULT…' : 'INITIALIZE VAULT'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="vault-panel p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center border border-vault-green/40 bg-vault-green/10">
              <ShieldCheck size={28} strokeWidth={1.5} className="text-vault-green" />
            </div>
            <h2 className="mt-6 font-condensed text-4xl font-semibold tracking-wide text-vault-text">VAULT ONLINE</h2>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-vault-text2">The encrypted vault has been initialized and your administrator account is active. Sign in to begin.</p>
            <button className="vault-btn vault-btn-primary mt-8 h-11 w-full justify-center" onClick={() => navigate('/login', { replace: true })}>
              Proceed to Authentication <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
