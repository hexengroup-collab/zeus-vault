import type { AppSettings } from '@shared/types'

export function applyAppearance(s: AppSettings): void {
  const root = document.documentElement
  root.style.zoom = String(s.fontScale)
  const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const reduced = s.animationIntensity !== 'full' || (s.motionPreference === 'system' && systemReduced)
  root.classList.toggle('reduced-motion', reduced)
  root.style.filter = s.theme === 'graphite' ? 'saturate(0.55) brightness(1.03)' : ''
}
