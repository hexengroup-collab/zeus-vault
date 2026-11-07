import { CopyButton } from './CopyButton'
import { formatTimestamp, type DateTimeStyle } from '@shared/time'

/** One dossier field: label, copyable value, last-modified provenance. */
export function FieldRow({
  label,
  value,
  copyValue,
  clearSeconds = 30,
  masked = false,
  updatedBy,
  updatedAt,
  dateStyle = 'utc',
  action,
}: {
  label: string
  value: string | null | undefined
  copyValue?: string
  clearSeconds?: number
  masked?: boolean
  updatedBy?: string | null
  updatedAt?: string | null
  dateStyle?: DateTimeStyle
  action?: React.ReactNode
}) {
  const display = masked ? (value ? '••••••••••••' : '') : (value ?? '')
  const actualCopy = copyValue ?? value ?? ''
  const empty = !value || !value.trim()
  return (
    <div className="group grid grid-cols-[150px_1fr_auto] items-baseline gap-3 border-b border-white/[0.045] py-[7px] last:border-b-0 md:grid-cols-[180px_1fr_auto]">
      <dt className="micro-label select-none truncate leading-6">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 leading-6">
        {empty ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-muted"> - </span>
        ) : (
          <span className={`truncate text-[12px] ${masked ? 'font-mono text-vault-amber' : 'text-vault-text'}`} title={masked ? undefined : value ?? undefined}>
            {display}
          </span>
        )}
        {!empty && <CopyButton value={actualCopy} clearSeconds={clearSeconds} />}
        {action}
      </dd>
      <dd className="hidden shrink-0 text-right font-mono text-[8.5px] uppercase tracking-[0.12em] text-vault-muted lg:block">
        {updatedBy ? <>edited by <span className="text-vault-text2">{updatedBy}</span> · {formatTimestamp(updatedAt, dateStyle)}</> : null}
      </dd>
    </div>
  )
}
