import { type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

export function Section({
  index,
  title,
  hint,
  defaultOpen = true,
  actions,
  children,
}: {
  index: string
  title: string
  hint?: string
  defaultOpen?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="vault-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 border-b border-vault-border-soft px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
        aria-expanded={open}
      >
        <span className="font-mono text-[10px] font-semibold text-vault-red">{index}</span>
        <span className="font-condensed text-[15px] font-semibold uppercase tracking-[0.12em] text-vault-text">{title}</span>
        {hint && <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-vault-muted md:inline">{hint}</span>}
        <span className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {actions}
          <ChevronDown size={14} className={`text-vault-muted transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {open && <div className="px-4 py-4">{children}</div>}
    </section>
  )
}
