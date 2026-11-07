import { useCallback, useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '@/lib/clipboard'
import { toastOk, toastError } from '@/stores/toast'

/** Copy-to-clipboard button with inline confirmation and optional auto-clear. */
export function CopyButton({
  value,
  label = 'Copy',
  clearSeconds = 30,
  className,
  onCopied,
}: {
  value: string
  label?: string
  clearSeconds?: number
  className?: string
  onCopied?: () => void
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(t)
  }, [copied])

  const doCopy = useCallback(async () => {
    const ok = await copyText(value, clearSeconds)
    if (ok) {
      setCopied(true)
      toastOk('COPIED TO CLIPBOARD')
      onCopied?.()
    } else {
      toastError('COPY FAILED', 'Clipboard access was denied.')
    }
  }, [value, clearSeconds, onCopied])

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        void doCopy()
      }}
      title={label}
      aria-label={label}
      className={`group inline-flex h-6 w-6 items-center justify-center rounded-[2px] border border-transparent text-vault-muted transition-all hover:border-white/10 hover:bg-white/5 hover:text-vault-text ${className ?? ''}`}
    >
      {copied ? <Check size={11} strokeWidth={2.5} className="text-vault-green" /> : <Copy size={11} strokeWidth={1.75} />}
    </button>
  )
}
