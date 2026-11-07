import { useCallback, useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'
import { VaultMark } from './VaultMark'
import { call, zeus } from '@/lib/api'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void call(zeus.window.isMaximized())
      .then((r) => setMaximized(r.maximized))
      .catch(() => undefined)
    const off = zeus.window.onMaximizedChange
      ? zeus.window.onMaximizedChange((v) => setMaximized(v))
      : undefined
    return () => off?.()
  }, [])

  const toggleMaximize = useCallback(async () => {
    try {
      const r = await call(zeus.window.toggleMaximize())
      setMaximized(r.maximized)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div
      className="zv-titlebar relative z-50 flex h-10 shrink-0 select-none items-stretch justify-between border-b border-vault-border-soft bg-[#0B0D10]"
      onDoubleClick={() => void toggleMaximize()}
    >
      <div className="flex items-center gap-2.5 pl-3">
        <VaultMark size={19} />
        <span className="font-condensed text-[15px] font-bold tracking-[0.18em] text-vault-text">
          ZEUS <span className="text-vault-red">VAULT</span>
        </span>
        <span className="hidden font-mono text-[7.5px] uppercase tracking-[0.3em] text-vault-muted md:inline">
          Encrypted Dossier System
        </span>
      </div>

      <div className="flex items-stretch">
        <button
          type="button"
          aria-label="Minimize"
          className="zv-window-btn"
          onClick={() => void call(zeus.window.minimize()).catch(() => undefined)}
        >
          <Minus size={13} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          className="zv-window-btn"
          onClick={() => void toggleMaximize()}
        >
          {maximized ? <Copy size={11} strokeWidth={1.75} /> : <Square size={11} strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          aria-label="Close"
          className="zv-window-btn zv-window-close"
          onClick={() => void call(zeus.window.close()).catch(() => undefined)}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
