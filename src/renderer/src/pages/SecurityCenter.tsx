import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Fingerprint, HardDrive, KeyRound, LogOut, ScrollText, ShieldCheck, ShieldAlert, DatabaseZap } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { toastInfo, toastError, toastOk } from '@/stores/toast'
import { formatTimestamp, relativeTime } from '@shared/time'
import type { IntegrityResult } from '@shared/types'

export function SecurityCenter() {
  const { data: center, loading } = useAsync(() => call(zeus.security.center()), [])
  const { data: settings } = useAsync(() => call(zeus.settings.get()), [])
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [chain, setChain] = useState<{ ok: boolean; checked: number } | null>(null)

  const runIntegrity = async () => {
    setChecking(true)
    try {
      setIntegrity(await call(zeus.security.integrity()))
    } catch (e) {
      toastError('Check failed', e instanceof Error ? e.message : undefined)
    } finally {
      setChecking(false)
    }
  }
  const verifyChain = async () => {
    try {
      const r = await call(zeus.security.verifyAudit())
      setChain({ ok: r.ok, checked: r.checked })
      if (r.ok) toastOk('AUDIT CHAIN INTACT', `${r.checked} entries hash-verified`)
      else toastError('CHAIN BROKEN', `Broken at ${r.brokenAt}`)
    } catch (e) {
      toastError('Verification failed', e instanceof Error ? e.message : undefined)
    }
  }
  const revokeAllOthers = async () => {
    const { revoked } = await call(zeus.account.logoutAll())
    toastInfo('Sessions terminated', `${revoked} other session(s) revoked`)
  }

  if (loading || !center) return <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.4em] text-vault-muted">Auditing security posture…</div>

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="micro-label flex items-center gap-2"><ShieldCheck size={10} /> Hardened Posture</div>
      <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">SECURITY CENTER</h1>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">Verify · rotate · revoke - do not trust, attest</p>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Encryption posture */}
        <section className="vault-panel p-5 xl:col-span-6">
          <div className="micro-label flex items-center gap-2"><Fingerprint size={10} /> Envelope Encryption</div>
          <div className="mt-3 space-y-2.5">
            <Row label="Cipher" value="AES-256-GCM (field-level) + wrapped master key" ok />
            <Row label="Field Key Fingerprint" value={String(center.fieldFingerprint.toString(16).toUpperCase().padStart(8, '0'))} mono />
            <Row label="Database Binding" value={String(center.dbFingerprint.toString(16).toUpperCase().padStart(8, '0'))} mono />
            <Row label="Key Protection" value={center.protection === 'system' ? 'OS keychain (DPAPI / libsecret)' : 'Portable wrapped key file'} ok={center.protection === 'system'} warn={center.protection !== 'system'} />
            <Row label="Password Hashing" value="Argon2id · m=32MB · t=3 · p=1" ok />
            <Row label="Audit Chain" value={center.auditChainOk ? `Intact · ${center.auditEntries} entries` : 'BROKEN - investigate immediately'} ok={center.auditChainOk} warn={!center.auditChainOk} />
          </div>
          <div className="mt-4 flex gap-2 border-t border-white/[0.06] pt-4">
            <button className="vault-btn" onClick={() => void verifyChain()}><ScrollText size={12} /> Verify Audit Chain</button>
            <button className="vault-btn" onClick={() => void runIntegrity()} disabled={checking}><DatabaseZap size={12} /> {checking ? 'Scanning…' : 'Database Integrity'}</button>
          </div>
          {chain && (
            <div className={`mt-2 font-mono text-[9px] uppercase tracking-[0.2em] ${chain.ok ? 'text-vault-green' : 'text-vault-red'}`}>
              {chain.ok ? `✓ chain verified · ${chain.checked} entries · sha-256 linked` : '✗ audit chain integrity failure'}
            </div>
          )}
        </section>

        {/* Integrity results */}
        <section className="vault-panel p-5 xl:col-span-6">
          <div className="micro-label flex items-center gap-2"><HardDrive size={10} /> Integrity Report</div>
          {!integrity && <p className="mt-3 text-[11px] leading-relaxed text-vault-text2">Run a full integrity check: SQLite quick_check, foreign-key scan, and an attempt to decrypt every encrypted field. Decryption failures indicate tampering or key mismatch.</p>}
          {integrity && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Cell label="Quick Check" value={integrity.quickCheck} ok={integrity.quickCheck === 'ok'} />
              <Cell label="FK Violations" value={String(integrity.foreignKeyErrors)} ok={integrity.foreignKeyErrors === 0} />
              <Cell label="Encrypted Fields" value={String(integrity.encryptedFields)} ok />
              <Cell label="Decrypt Failures" value={String(integrity.encryptedFailures)} ok={integrity.encryptedFailures === 0} />
              <Cell label="Duplicate IDs" value={String(integrity.duplicateCodes)} ok={integrity.duplicateCodes === 0} />
              <Cell label="Orphan Rows" value={String(integrity.orphanRows)} ok={integrity.orphanRows === 0} />
            </div>
          )}
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="micro-label">Policy Snapshot</div>
            <ul className="mt-2 space-y-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-vault-text2">
              <li className="flex justify-between"><span>Sensitive export by default</span><span className={settings?.exportSensitiveDefault ? 'text-vault-red' : 'text-vault-green'}>{settings?.exportSensitiveDefault ? 'ALLOWED' : 'DENIED'}</span></li>
              <li className="flex justify-between"><span>Clipboard auto-clear</span><span className="text-vault-text">{settings?.clipboardClearSeconds ?? 30}s</span></li>
              <li className="flex justify-between"><span>View tracking</span><span className="text-vault-text">{settings?.trackViews ? 'ON' : 'OFF'}</span></li>
              <li className="flex justify-between"><span>Single session</span><span className="text-vault-text">{settings?.singleSession ? 'ENFORCED' : 'RELAXED'}</span></li>
              <li className="flex justify-between"><span>Session lifetime</span><span className="text-vault-text">{settings?.sessionDurationDays ?? 90} days</span></li>
            </ul>
          </div>
        </section>

        {/* Sessions */}
        <section className="vault-panel p-5 xl:col-span-7">
          <div className="micro-label flex items-center gap-2"><KeyRound size={10} /> Your Sessions</div>
          <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto vault-scroll">
            {center.sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 border border-white/[0.05] px-3 py-2">
                <div>
                  <div className="font-mono text-[9px] text-vault-text2">{s.deviceName}{s.current && <span className="ml-2 text-vault-green"> - CURRENT</span>}</div>
                  <div className="font-mono text-[8px] text-vault-muted">issued {formatTimestamp(s.createdAt)} · expires {formatTimestamp(s.expiresAt)}{s.revokedAt ? ' · REVOKED' : ''}</div>
                </div>
                {!s.revokedAt && !s.current && (
                  <button className="font-mono text-[8px] uppercase tracking-[0.2em] text-vault-red hover:underline" onClick={async () => { await call(zeus.account.revokeSession(s.id)); toastInfo('Session revoked') }}>Revoke</button>
                )}
              </div>
            ))}
          </div>
          <button className="vault-btn vault-btn-ghost mt-2" onClick={() => void revokeAllOthers()}><LogOut size={11} /> Revoke all other sessions</button>
        </section>

        {/* Login ledger */}
        <section className="vault-panel p-5 xl:col-span-5">
          <div className="micro-label flex items-center gap-2"><ShieldAlert size={10} /> Recent Login Events</div>
          <div className="mt-2 max-h-56 space-y-0 overflow-y-auto vault-scroll">
            {center.loginHistory.slice(0, 12).map((h) => (
              <div key={h.id} className="border-b border-white/[0.05] py-1.5 last:border-b-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-mono text-[8px] uppercase tracking-[0.18em] ${h.eventType === 'FAILED_LOGIN' ? 'text-vault-red' : 'text-vault-text2'}`}>{h.eventType.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-[8px] text-vault-muted">{relativeTime(h.createdAt)}</span>
                </div>
                <div className="truncate text-[9px] text-vault-muted">{h.detail ?? h.deviceName}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
            <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-vault-muted">{center.backupCount} backup(s) on disk</span>
            <Link to="/backups" className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-vault-red hover:underline">Backup Center →</Link>
          </div>
        </section>
      </div>

      <p className="mt-6 text-center font-mono text-[8px] uppercase leading-relaxed tracking-[0.28em] text-vault-muted">
        The vault assumes compromise. Every layer is verifiable offline.<br />Reporting chain failures to your administrator is mandatory.
      </p>
    </div>
  )
}

function Row({ label, value, mono, ok, warn }: { label: string; value: string; mono?: boolean; ok?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] pb-2">
      <span className="micro-label !text-[8.5px]">{label}</span>
      <span className={`${mono ? 'font-mono text-[10px]' : 'text-[10.5px]'} ${ok ? 'text-vault-green' : warn ? 'text-vault-amber' : 'text-vault-text'}`}>{value}</span>
    </div>
  )
}

function Cell({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="micro-label !text-[7.5px]">{label}</div>
      <div className={`mt-1 truncate font-mono text-[10px] ${ok ? 'text-vault-green' : 'text-vault-red'}`} title={value}>{value}</div>
    </div>
  )
}
