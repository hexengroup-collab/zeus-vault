import { useEffect } from 'react'
import { VaultMark } from '@/components/VaultMark'
import gsap from 'gsap'
import { useRef } from 'react'

export function Splash() {
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (barRef.current) {
      gsap.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power2.inOut' })
    }
  }, [])
  return (
    <div className="vault-stage relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <div className="vault-grain" />
      <VaultMark size={76} />
      <div className="mt-6 font-condensed text-4xl font-bold tracking-[0.18em] text-vault-text">
        ZEUS<span className="text-vault-red"> VAULT</span>
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.4em] text-vault-muted">Encrypted Dossier System</div>
      <div className="mt-8 h-px w-56 bg-white/10">
        <div ref={barRef} className="h-px origin-left bg-vault-red" />
      </div>
      <div className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.3em] text-vault-muted">Establishing secure context…</div>
    </div>
  )
}
