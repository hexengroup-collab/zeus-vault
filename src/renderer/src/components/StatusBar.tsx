import { useEffect, useState } from 'react'
import { useSession } from '@/stores/session'
import { APP_TITLE, APP_VERSION } from '@shared/constants'

export function StatusBar() {
  const { app, sessionRef } = useSession()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const p2 = (n: number) => String(n).padStart(2, '0')
  const clock = `${now.getUTCFullYear()}-${p2(now.getUTCMonth() + 1)}-${p2(now.getUTCDate())} ${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())} UTC`
  return (
    <footer className="relative z-10 flex h-7 shrink-0 items-center gap-4 border-t border-vault-border-soft bg-[#0B0D10] px-3 font-mono text-[8px] uppercase tracking-[0.18em] text-vault-muted">
      <span className="font-semibold text-vault-text2">{APP_TITLE} · v{APP_VERSION}</span>
      <span className="hidden md:inline">DB ONLINE</span>
      <span className="hidden lg:inline">STORAGE LOCAL</span>
      <span className="hidden xl:inline">ENCRYPTION AES-256-GCM</span>
      {app?.demoSeeded && <span className="text-vault-amber/80">DEMO DATA - FICTIONAL</span>}
      <span className="ml-auto hidden sm:inline">SESSION {sessionRef ?? ' - '}</span>
      <span className="tabular-nums text-vault-text2">{clock}</span>
    </footer>
  )
}
