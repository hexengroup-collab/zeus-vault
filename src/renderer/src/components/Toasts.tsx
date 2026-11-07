import { useToast } from '@/stores/toast'
import { AlertTriangle, Check, Info, X } from 'lucide-react'

const toneIcon = {
  ok: Check,
  error: AlertTriangle,
  info: Info,
  amber: AlertTriangle,
} as const

const toneColor = {
  ok: 'text-vault-green border-vault-green/40',
  error: 'text-vault-red border-vault-red/50',
  info: 'text-vault-text2 border-white/10',
  amber: 'text-vault-amber border-vault-amber/40',
} as const

export function Toasts() {
  const { toasts, dismiss } = useToast()
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = toneIcon[t.tone]
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`tick-in pointer-events-auto flex items-start gap-2.5 border bg-[#14161B]/95 px-3 py-2.5 text-left shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-sm ${toneColor[t.tone]}`}
          >
            <Icon size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="block font-mono text-[10px] font-semibold leading-tight tracking-[0.14em] text-vault-text">{t.title}</span>
              {t.detail && <span className="mt-0.5 block truncate font-mono text-[9.5px] text-vault-text2">{t.detail}</span>}
            </span>
            <X size={11} className="ml-auto mt-0.5 shrink-0 text-vault-muted" />
          </button>
        )
      })}
    </div>
  )
}
