import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { KeyRound, LogIn, MonitorSmartphone, Plus, Shield, UserRound, X } from 'lucide-react'
import { call, zeus, ApiFailure } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSession } from '@/stores/session'
import { Avatar } from '@/components/Avatar'
import { Modal } from '@/components/Modal'
import { ConfirmModal } from '@/components/ConfirmModal'
import { toastError, toastInfo, toastOk } from '@/stores/toast'
import { ROLE_LABELS } from '@shared/constants'
import { formatTimestamp, relativeTime } from '@shared/time'
import { passwordStrength, generatePasswordLocal } from '@/lib/format'
import type { LoginHistoryEntry, Role, UserRecord, UserSessionInfo } from '@shared/types'

export function UserManagement() {
  const { user } = useSession()
  if (user?.role !== 'admin') return <Navigate to="/overview" replace />
  return <UserManagementInner />
}

function UserManagementInner() {
  const { user: me } = useSession()
  const { data: users, loading, reload } = useAsync(() => call(zeus.users.list()), [])
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null)
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null)
  const [sessionsTarget, setSessionsTarget] = useState<UserRecord | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<UserRecord | null>(null)

  const active = (users ?? []).filter((u) => u.status === 'active')
  const suspended = (users ?? []).filter((u) => u.status !== 'active')

  return (
    <div className="p-5">
      <div className="flex items-end justify-between border-b border-vault-border-soft pb-4">
        <div>
          <div className="micro-label">Access Control</div>
          <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">USER MANAGEMENT</h1>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">{active.length} active · {suspended.length} restricted · single active session per account</p>
        </div>
        <button className="vault-btn vault-btn-primary" onClick={() => setCreateOpen(true)}><Plus size={12} /> New User</button>
      </div>

      {loading && <div className="py-12 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-vault-muted">Enumerating principals…</div>}

      <div className="mt-4 overflow-x-auto vault-scroll border border-vault-border-soft">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[#0E1013]">
            <tr className="border-b border-vault-border">
              {['User', 'Role', 'Status', 'Dossiers', 'Last Login', 'Session', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-vault-text2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="row-alt border-b border-white/[0.05] align-middle">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={u.avatar} name={u.fullName} size={30} />
                    <div>
                      <div className="text-[11.5px] font-semibold text-vault-text">{u.fullName}</div>
                      <div className="font-mono text-[8.5px] text-vault-muted">@{u.username} · {u.email}</div>
                    </div>
                    {u.id === me?.id && <span className="chip !border-vault-red/40 !text-vault-red">You</span>}
                  </div>
                </td>
                <td className="px-3 py-2"><span className={`chip ${u.role === 'admin' ? '!border-vault-red/40 !text-vault-red' : u.role === 'readonly' ? '!border-vault-text2/40 !text-vault-text2' : ''}`}>{ROLE_LABELS[u.role]}</span></td>
                <td className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em]"><span className={u.status === 'active' ? 'text-vault-green' : 'text-vault-red'}>{u.status}</span></td>
                <td className="px-3 py-2 font-mono text-[10px] text-vault-text2">{u.profileCount}</td>
                <td className="px-3 py-2"><div className="font-mono text-[8.5px] text-vault-text2">{u.lastLogin ? formatTimestamp(u.lastLogin) : 'never'}</div></td>
                <td className="px-3 py-2">{u.sessionActive ? <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-vault-green"><span className="status-dot bg-vault-green pulse-dot" /> Live</span> : <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-vault-muted">Idle</span>}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-text" title="Edit user" onClick={() => setEditTarget(u)}><UserRound size={12} /></button>
                    <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-amber" title="Reset password" onClick={() => setResetTarget(u)}><KeyRound size={12} /></button>
                    <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-text" title="Sessions & login history" onClick={() => setSessionsTarget(u)}><LogIn size={12} /></button>
                    {u.id !== me?.id && (
                      <button className="p-1.5 text-vault-muted transition-colors hover:text-vault-red" title={u.status === 'active' ? 'Suspend user' : 'Reactivate user'} onClick={() => setSuspendTarget(u)}><Shield size={12} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); reload() }} />
      <EditUserModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); reload() }} />
      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} onSaved={() => { setResetTarget(null); reload() }} />
      <UserSessionsDrawer target={sessionsTarget} onClose={() => setSessionsTarget(null)} />
      <ConfirmModal
        open={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        title={suspendTarget?.status === 'active' ? 'Suspend user' : 'Reactivate user'}
        message={suspendTarget?.status === 'active'
          ? `${suspendTarget?.username} will be signed out immediately and barred from the vault. This is reversible.`
          : `${suspendTarget?.username} will regain access to the vault.`}
        confirmLabel={suspendTarget?.status === 'active' ? 'Suspend' : 'Reactivate'}
        danger={suspendTarget?.status === 'active'}
        onConfirm={async () => {
          if (!suspendTarget) return
          try {
            await call(zeus.users.update({ id: suspendTarget.id, patch: { status: suspendTarget.status === 'active' ? 'suspended' : 'active' } }))
            toastInfo(suspendTarget.status === 'active' ? 'User suspended' : 'User reactivated', suspendTarget.username)
            reload()
          } catch (e) {
            toastError('Action failed', e instanceof Error ? e.message : undefined)
          }
        }}
      />
    </div>
  )
}

function CreateUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('standard')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const strength = passwordStrength(password)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await call(zeus.users.create({ fullName: fullName.trim(), username: username.trim(), email: email.trim(), password, role }))
      toastOk('User created', username.trim())
      setFullName(''); setUsername(''); setEmail(''); setPassword(''); setRole('standard')
      onSaved()
    } catch (e) {
      setError(e instanceof ApiFailure ? [e.message, ...(e.fields ?? []).map((f) => f.message)].join(' ') : 'Create failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Principal" subtitle="Credentials are hashed with Argon2id">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block"><span className="micro-label mb-1 block">Full Name *</span><input autoFocus className="vault-input h-10 w-full px-3" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
          <label className="block"><span className="micro-label mb-1 block">Username *</span><input className="vault-input h-10 w-full px-3 font-mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="operator" /></label>
          <label className="block"><span className="micro-label mb-1 block">Email *</span><input className="vault-input h-10 w-full px-3 font-mono" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="col-span-2 block">
            <span className="micro-label mb-1 block">Initial Password *</span>
            <div className="flex gap-2">
              <input className="vault-input h-10 flex-1 px-3 font-mono" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum per policy" />
              <button type="button" className="vault-btn !px-2" onClick={() => setPassword(generatePasswordLocal(20))} title="Generate"><KeyRound size={12} /></button>
            </div>
            <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.2em] text-vault-text2">{password ? `${strength.label} · ${strength.entropy} bits` : 'never stored in plaintext'}</div>
          </label>
          <label className="col-span-2 block">
            <span className="micro-label mb-1 block">Role</span>
            <select className="vault-select h-10 w-full px-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="standard">Standard User - create/edit profiles</option>
              <option value="readonly">Read-Only User - view & copy only</option>
              <option value="admin">Administrator - full control</option>
            </select>
          </label>
        </div>
        {error && <div role="alert" className="border border-vault-red/40 bg-vault-red/[0.08] px-3 py-2 text-[10px] text-vault-red">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="vault-btn vault-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="vault-btn vault-btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create User'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({ target, onClose, onSaved }: { target: UserRecord | null; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('standard')
  const [busy, setBusy] = useState(false)
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  if (target && target.id !== initializedFor) {
    setInitializedFor(target.id)
    setFullName(target.fullName)
    setEmail(target.email)
    setRole(target.role)
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target || busy) return
    setBusy(true)
    try {
      await call(zeus.users.update({ id: target.id, patch: { fullName: fullName.trim(), email: email.trim(), role } }))
      toastOk('User updated', target.username)
      onSaved()
    } catch (e) {
      toastError('Update failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={!!target} onClose={onClose} title="Edit Principal" subtitle={target?.username}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className="micro-label mb-1 block">Full Name</span><input className="vault-input h-10 w-full px-3" value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <label className="block"><span className="micro-label mb-1 block">Email</span><input className="vault-input h-10 w-full px-3 font-mono" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block">
          <span className="micro-label mb-1 block">Role</span>
          <select className="vault-select h-10 w-full px-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="standard">Standard User</option>
            <option value="readonly">Read-Only User</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="vault-btn vault-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="vault-btn vault-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ target, onClose, onSaved }: { target: UserRecord | null; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const strength = passwordStrength(password)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!target || busy) return
    setBusy(true)
    try {
      await call(zeus.users.resetPassword({ id: target.id, newPassword: password }))
      toastOk('Password reset', `${target.username} must change it at next sign-in`)
      setPassword('')
      onSaved()
    } catch (e) {
      toastError('Reset failed', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={!!target} onClose={onClose} title="Reset Password" subtitle={target?.username} width="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[11px] leading-relaxed text-vault-text2">A new temporary password is set and all of {target?.username}'s sessions are revoked immediately. They will be forced to choose a fresh password at sign-in.</p>
        <div className="flex gap-2">
          <input autoFocus className="vault-input h-10 flex-1 px-3 font-mono" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" />
          <button type="button" className="vault-btn !px-2" onClick={() => setPassword(generatePasswordLocal(20))} title="Generate"><KeyRound size={12} /></button>
        </div>
        <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-vault-text2">{password ? `${strength.label} · ${strength.entropy} bits` : ' - '}</div>
        <div className="flex justify-end gap-2">
          <button type="button" className="vault-btn vault-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="vault-btn vault-btn-danger" disabled={busy || !password}>{busy ? 'Resetting…' : 'Reset Password'}</button>
        </div>
      </form>
    </Modal>
  )
}

function UserSessionsDrawer({ target, onClose }: { target: UserRecord | null; onClose: () => void }) {
  const { data: sessions, reload: reloadSessions } = useAsync(() => (target ? call(zeus.users.sessions(target.id)) : Promise.resolve([] as UserSessionInfo[])), [target?.id])
  const { data: history } = useAsync(() => (target ? call(zeus.users.loginHistory(target.id)) : Promise.resolve([] as LoginHistoryEntry[])), [target?.id])
  if (!target) return null
  return (
    <Modal open={!!target} onClose={onClose} title={`${target.username} - Sessions`} subtitle="Intrusion surface & login ledger" width="max-w-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="micro-label">Active & Historical Sessions</span>
        <button className="vault-btn vault-btn-danger !py-1.5" onClick={async () => { const n = await call(zeus.users.revokeSessions(target.id)); toastInfo('Sessions revoked', `${n} session(s) terminated`); reloadSessions() }}>
          <MonitorSmartphone size={11} /> Revoke All
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto vault-scroll space-y-1.5">
        {(sessions ?? []).map((s) => (
          <div key={s.id} className="flex items-center justify-between border border-white/[0.06] px-3 py-2">
            <div>
              <div className="font-mono text-[9px] text-vault-text2">{s.deviceName}</div>
              <div className="font-mono text-[8px] text-vault-muted">created {formatTimestamp(s.createdAt)} · expires {formatTimestamp(s.expiresAt)}{s.revokedAt ? ' · REVOKED' : ''}</div>
            </div>
            <span className={`font-mono text-[8px] uppercase tracking-[0.2em] ${s.revokedAt ? 'text-vault-red' : s.current ? 'text-vault-green' : 'text-vault-text2'}`}>{s.revokedAt ? 'revoked' : s.current ? 'current' : 'valid'}</span>
          </div>
        ))}
        {sessions && sessions.length === 0 && <div className="py-4 text-center font-mono text-[9px] text-vault-muted">No sessions recorded</div>}
      </div>
      <div className="mb-2 mt-4"><span className="micro-label">Login Ledger</span></div>
      <div className="max-h-56 overflow-y-auto vault-scroll space-y-0">
        {(history ?? []).slice(0, 25).map((h) => (
          <div key={h.id} className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] py-1.5">
            <div>
              <span className={`font-mono text-[8.5px] uppercase tracking-[0.18em] ${h.eventType === 'FAILED_LOGIN' ? 'text-vault-red' : 'text-vault-text2'}`}>{h.eventType.replace(/_/g, ' ')}</span>
              <span className="ml-2 text-[10px] text-vault-muted">{h.detail ?? ''}</span>
            </div>
            <span className="shrink-0 font-mono text-[8px] text-vault-muted">{relativeTime(h.createdAt)}</span>
          </div>
        ))}
        {history && history.length === 0 && <div className="py-4 text-center font-mono text-[9px] text-vault-muted">No login history</div>}
      </div>
      <button className="vault-btn vault-btn-ghost mt-3 !px-2" onClick={onClose}><X size={12} /> Close</button>
    </Modal>
  )
}
