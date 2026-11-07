import { useEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open && panelRef.current) {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: 14, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out' },
      )
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        className={`vault-panel relative w-full ${width} max-h-[88vh] overflow-y-auto vault-scroll shadow-[0_24px_80px_rgba(0,0,0,0.6)]`}
      >
        <div className="flex items-start justify-between border-b border-vault-border-soft px-5 py-4">
          <div>
            <h2 className="font-condensed text-xl font-semibold tracking-wide text-vault-text">{title}</h2>
            {subtitle && <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-vault-text2">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="vault-btn vault-btn-ghost !px-2" aria-label="Close dialog">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
