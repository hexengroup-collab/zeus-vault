import { useId } from 'react'

/** Zeus Vault glass orb mark: circular liquid-glass icon with a molten gold bolt. */
export function VaultMark({ size = 32, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/[:]/g, '')
  const orbId = `zv-orb-${uid}`
  const specId = `zv-spec-${uid}`
  const boltId = `zv-bolt-${uid}`
  const rimId = `zv-rim-${uid}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} role="img" aria-label="Zeus Vault">
      <defs>
        <radialGradient id={orbId} cx="38%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#5B6270" />
          <stop offset="38%" stopColor="#2A2F38" />
          <stop offset="78%" stopColor="#14171D" />
          <stop offset="100%" stopColor="#0A0C10" />
        </radialGradient>
        <radialGradient id={specId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={boltId} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#F5B58D" />
          <stop offset="35%" stopColor="#E08D66" />
          <stop offset="62%" stopColor="#E34B64" />
          <stop offset="100%" stopColor="#7A3D22" />
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.32" />
        </linearGradient>
      </defs>

      {/* Outer glow */}
      <circle cx="50" cy="50" r="49" fill="#E9C069" opacity="0.10" />
      {/* Glass orb */}
      <circle cx="50" cy="50" r="44" fill={`url(#${orbId})`} stroke={`url(#${rimId})`} strokeWidth="1.4" />
      {/* Inner ring */}
      <circle cx="50" cy="50" r="39.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.10" strokeWidth="0.8" />
      {/* Specular key light */}
      <ellipse cx="34" cy="30" rx="13" ry="9" fill={`url(#${specId})`} opacity="0.85" transform="rotate(-28 34 30)" />
      {/* Molten gold bolt */}
      <path
        d="M 55.4 23.5 L 41.8 52.7 L 50.7 52.7 L 44.6 76.5 L 60.2 46.6 L 51.4 46.6 Z"
        fill={`url(#${boltId})`}
        stroke="#4A2412"
        strokeOpacity="0.55"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}
