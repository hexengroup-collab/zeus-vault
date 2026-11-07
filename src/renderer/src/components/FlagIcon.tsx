import { memo } from 'react'
import * as Flags3x2 from 'country-flag-icons/react/3x2'

type AnyFlag = React.ComponentType<{ className?: string; title?: string }>

const registry = Flags3x2 as unknown as Record<string, AnyFlag>

/** Renders the SVG flag for an ISO-3166 alpha-2 code (3x2). Falls back to an ISO badge. */
export const FlagIcon = memo(function FlagIcon({ iso2, className }: { iso2?: string | null; className?: string }) {
  const code = (iso2 ?? '').trim().toUpperCase()
  const Flag = /^[A-Z]{2}$/.test(code) ? registry[code] : undefined
  if (!Flag) {
    return (
      <span
        className={`inline-flex h-[12px] min-w-[18px] items-center justify-center rounded-[2px] border border-white/15 bg-white/5 px-1 font-mono text-[8px] leading-none text-vault-text2 ${className ?? ''}`}
      >
        {code || ' -  - '}
      </span>
    )
  }
  return <Flag className={`inline-block h-[12px] w-[18px] rounded-[1px] object-cover ${className ?? ''}`} title={code} />
})
