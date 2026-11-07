import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Eye, EyeOff, KeyRound, LogOut, MonitorSmartphone, Trash2 } from 'lucide-react'
import { call, zeus, ApiFailure } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSession } from '@/stores/session'
import { Avatar } from '@/components/Avatar'
import { toastError, toastInfo, toastOk } from '@/stores/toast'
import { passwordStrength } from '@/lib/format'
import { fileToDataUrl } from '@/lib/images'
import { formatTimestamp, relativeTime } from '@shared/time'
import { APP_TITLE } from '@shared/constants'

export function MyAccount() {
  const navigate = useNavigate()
  const { user, clear } = useSession()
  const fileInput = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const identityDirty = (fullName !== user?.fullName) || (username !== user?.username) || (email !== user?.email)
  const identityNeedsPassword = username !== user?.username || email !== user?.email

  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [changingPw, setChangingPw] = useState(false)

  const { data: sessions, reload: reloadSessions } = useAsync(() => call(zeus.account.sessions()), [])
  const { data: history } = useAsync(() => call(zeus.account.loginHistory()), [])

  const strength = passwordStrength(newPw)

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !identityDirty || savingProfile) return
    setSavingProfile(true)
    try {
      const updated = await call(zeus.account.updateProfile({
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        currentPassword: identityNeedsPassword ? currentPassword : undefined,
      }))
      useSession.setState({ user: { ...user, fullName: updated.fullName, username: updated.username, email: updated.email } })
      setCurrentPassword('')
      toastOk('Account updated')
    } catch (e) {
      toastError('Update failed', e instanceof ApiFailure ? e.message : 'Unknown error')
    } finally {
      setSavingProfile(false)
    }
  }

  const onAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    try {
      const dataUrl = await fileToDataUrl(file, 256, 0.85)
      await call(zeus.account.setAvatar(dataUrl))
      useSession.setState({ user: { ...user, avatar: dataUrl } })
      toastOk('Avatar updated')
    } catch (err) {
      toastError('Upload rejected', err instanceof Error ? err.message : undefined)
    }
  }

  const removeAvatar = async () => {
    if (!user) return
    await call(zeus.account.setAvatar(null))
    useSession.setState({ user: { ...user, avatar: null } })
    toastInfo('Avatar removed')
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (changingPw) return
    setChangingPw(true)
    try {
      await call(zeus.account.changePassword({ currentPassword: curPw, newPassword: newPw }))
      setCurPw(''); setNewPw('')
      toastOk('Password changed', 'Other sessions were revoked; this one remains active.')
    } catch (e) {
      toastError('Change refused', e instanceof ApiFailure ? [e.message, ...(e.fields ?? []).map((f) => f.message)].join(' ') : 'Unknown error')
    } finally {
      setChangingPw(false)
    }
  }

  const signOut = async () => {
    await call(zeus.session.logout()).catch(() => void 0)
    clear()
    navigate('/login', { replace: true })
  }

  const revokeAllOthers = async () => {
    const result = await call(zeus.account.logoutAll())
    toastInfo('Sessions terminated', `${result.revoked} session(s) revoked. Sign in again on other devices.`)
    reloadSessions()
  }

  return (
    <div className="mx-auto max-w-5xl p-5 pb-16">
      <div className="border-b border-vault-border-soft pb-4">
        <div className="micro-label">Self Service</div>
        <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">MY ACCOUNT</h1>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">{APP_TITLE} · handler identity</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Identity card */}
        <div className="vault-panel p-5 xl:col-span-5">
          <div className="micro-label">Identity</div>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative">
              <Avatar src={user?.avatar} name={user?.fullName ?? ''} size={84} className="!rounded-[3px]" />
              <button className="absolute -bottom-2 -right-2 border border-vault-border bg-vault-surface p-1.5 text-vault-text2 transition-colors hover:text-vault-text" onClick={() => fileInput.current?.click()} aria-label="Change avatar">
                <Camera size={12} />
              </button>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onAvatar(e)} />
            </div>
            <div>
              <div className="font-condensed text-2xl font-semibold leading-none tracking-wide text-vault-text">{user?.fullName}</div>
              <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">@{user?.username}</div>
              {user?.avatar && <button className="mt-2 font-mono text-[8px] uppercase tracking-[0.2em] text-vault-muted hover:text-vault-red" onClick={() => void removeAvatar()}>Remove photo</button>}
            </div>
          </div>

          <form onSubmit={saveProfile} className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
            <label className="block"><span className="micro-label mb-1 block">Full Name</span><input className="vault-input h-10 w-full px-3" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="micro-label mb-1 block">Username</span><input className="vault-input h-10 w-full px-3 font-mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} /></label>
              <label className="block"><span className="micro-label mb-1 block">Email</span><input className="vault-input h-10 w-full px-3 font-mono" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            </div>
            {identityNeedsPassword && (
              <label className="block">
                <span className="micro-label mb-1 block">Current Password - required to change username or email</span>
                <input type="password" autoComplete="current-password" className="vault-input h-10 w-full px-3 font-mono" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
              </label>
            )}
            <button type="submit" className="vault-btn vault-btn-primary w-full justify-center" disabled={!identityDirty || savingProfile || (identityNeedsPassword && !currentPassword)}>
              {savingProfile ? 'Encrypting…' : 'Save Identity'}
            </button>
          </form>
        </div>

        {/* Password change */}
        <div className="vault-panel p-5 xl:col-span-7">
          <div className="flex items-center justify-between">
            <div className="micro-label flex items-center gap-2"><KeyRound size={10} /> Credential Rotation</div>
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-vault-muted">Changing password revokes all other sessions</span>
          </div>
          <form onSubmit={changePassword} className="mt-3 grid max-w-lg gap-3">
            <label className="block"><span className="micro-label mb-1 block">Current Password</span><input type="password" autoComplete="current-password" className="vault-input h-10 w-full px-3 font-mono" value={curPw} onChange={(e) => setCurPw(e.target.value)} /></label>
            <label className="block">
              <span className="micro-label mb-1 block">New Password</span>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} autoComplete="new-password" className="vault-input h-10 w-full px-3 pr-10 font-mono" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-muted hover:text-vault-text" aria-label="Toggle visibility">{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex h-1.5 flex-1 gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-full flex-1 rounded-full ${newPw && i < strength.score + 1 ? (strength.score < 2 ? 'bg-vault-red' : strength.score < 3 ? 'bg-vault-amber' : 'bg-vault-green') : 'bg-white/10'}`} />
                ))}
              </div>
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-vault-text2">{newPw ? `${strength.label} · ${strength.entropy} bits` : ''}</span>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[8.5px] uppercase tracking-[0.15em] text-vault-muted">
              <li className={newPw.length >= 12 ? 'text-vault-green' : ''}>≥ 12 characters</li>
              <li className={/[A-Z]/.test(newPw) ? 'text-vault-green' : ''}>Uppercase letter</li>
              <li className={/[0-9]/.test(newPw) ? 'text-vault-green' : ''}>Number</li>
              <li className={/[^A-Za-z0-9]/.test(newPw) ? 'text-vault-green' : ''}>Symbol</li>
            </ul>
            <button type="submit" className="vault-btn vault-btn-primary w-full justify-center" disabled={!curPw || !newPw || changingPw}>
              {changingPw ? 'Rotating…' : 'Rotate Password'}
            </button>
          </form>

          {/* Sessions */}
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <div className="micro-label flex items-center gap-2"><MonitorSmartphone size={10} /> Active Sessions</div>
            <button className="vault-btn vault-btn-ghost !py-1.5 text-vault-amber" onClick={() => void revokeAllOthers()}><Trash2 size={11} /> Revoke all others</button>
          </div>
          <div className="mt-2 max-h-44 space-y-1 overflow-y-auto vault-scroll">
            {(sessions ?? []).slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between border border-white/[0.05] px-3 py-1.5">
                <div>
                  <div className="font-mono text-[9px] text-vault-text2">{s.deviceName}{s.current && <span className="ml-2 text-vault-green"> - THIS DEVICE</span>}</div>
                  <div className="font-mono text-[8px] text-vault-muted">last seen {relativeTime(s.lastSeenAt)}{s.revokedAt ? ' · REVOKED' : ''}</div>
                </div>
                {!s.revokedAt && !s.current && (
                  <button className="font-mono text-[8px] uppercase tracking-[0.2em] text-vault-red hover:underline" onClick={async () => { await call(zeus.account.revokeSession(s.id)); toastInfo('Session revoked'); reloadSessions() }}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
            {sessions && sessions.length === 0 && <div className="py-3 text-center font-mono text-[9px] text-vault-muted">Only this session</div>}
          </div>
        </div>

        {/* Login history */}
        <div className="vault-panel p-5 xl:col-span-12">
          <div className="micro-label">Login Ledger - Last 200 Events</div>
          <div className="mt-2 max-h-64 overflow-y-auto vault-scroll">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['When', 'Event', 'Device', 'Detail'].map((h) => <th key={h} className="px-2 py-1.5 font-mono text-[8px] uppercase tracking-[0.2em] text-vault-muted">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((h) => (
                  <tr key={h.id} className="border-b border-white/[0.04]">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[8.5px] text-vault-text2">{formatTimestamp(h.createdAt)}</td>
                    <td className="px-2 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em]"><span className={h.eventType === 'FAILED_LOGIN' ? 'text-vault-red' : 'text-vault-text2'}>{h.eventType.replace(/_/g, ' ')}</span></td>
                    <td className="px-2 py-1.5 font-mono text-[8.5px] text-vault-muted">{h.deviceName ?? ' - '}</td>
                    <td className="max-w-md truncate px-2 py-1.5 text-[10px] text-vault-text2" title={h.detail ?? ''}>{h.detail ?? ''}</td>
                  </tr>
                ))}
                {history && history.length === 0 && <tr><td colSpan={4} className="py-6 text-center font-mono text-[9px] text-vault-muted">No history</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
            <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-vault-muted">Session persistence is separate from vault-lock policy</span>
            <button className="vault-btn vault-btn-danger" onClick={() => void signOut()}><LogOut size={12} /> Sign Out</button>
          </div>
        </div>
      </div>
    </div>
  )
}
