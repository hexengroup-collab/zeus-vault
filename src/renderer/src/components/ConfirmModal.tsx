import { useState } from 'react'
import { Modal } from './Modal'
import { AlertTriangle } from 'lucide-react'

export function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'CONFIRM',
  danger = true,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-sm border p-2 ${danger ? 'border-vault-red/40 text-vault-red' : 'border-vault-amber/40 text-vault-amber'}`}>
          <AlertTriangle size={16} strokeWidth={1.75} />
        </div>
        <p className="text-[12px] leading-relaxed text-vault-text2">{message}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="vault-btn vault-btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className={`vault-btn ${danger ? 'vault-btn-danger' : 'vault-btn-primary'}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
              onClose()
            }
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
