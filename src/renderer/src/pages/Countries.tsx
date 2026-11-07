import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe2, Search, X } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { FlagIcon } from '@/components/FlagIcon'
import { relativeTime } from '@shared/time'

const REGIONS = ['All', 'Americas', 'Europe', 'Asia', 'Africa', 'Oceania'] as const

export function Countries() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<(typeof REGIONS)[number]>('All')
  const { data: stats } = useAsync(() => call(zeus.search.countryStats()), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (stats ?? []).filter((c) => {
      if (region !== 'All' && c.region !== region) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q || c.dial.includes(q)
    })
  }, [stats, query, region])

  const withProfiles = filtered.filter((c) => c.profileCount > 0).length
  const totalProfiles = (stats ?? []).reduce((acc, c) => acc + c.profileCount, 0)

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-vault-border-soft pb-4">
        <div>
          <div className="micro-label flex items-center gap-2"><Globe2 size={10} /> Location Intelligence</div>
          <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">COUNTRIES</h1>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">{withProfiles} countries represented · {totalProfiles} dossiers indexed</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex min-w-56 items-center gap-2 border border-white/10 bg-[#0D0F12] px-2.5">
            <Search size={12} className="text-vault-muted" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country, ISO code or dial code…" className="h-9 w-full bg-transparent text-[11px] outline-none placeholder:text-vault-muted" aria-label="Search countries" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear" className="text-vault-muted hover:text-vault-text"><X size={12} /></button>}
          </div>
          <div className="flex border border-white/10">
            {REGIONS.map((r) => (
              <button key={r} onClick={() => setRegion(r)} className={`px-2.5 py-2 font-mono text-[8.5px] uppercase tracking-[0.18em] transition-colors ${region === r ? 'bg-vault-red/90 text-[#0D0507]' : 'text-vault-text2 hover:text-vault-text'}`}>{r}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px border border-vault-border-soft bg-white/[0.04] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {filtered.map((c) => (
          <button
            key={c.iso2}
            onClick={() => navigate(`/profiles?country=${c.iso2}`)}
            className={`group flex flex-col items-center gap-1.5 px-2 py-3 transition-colors hover:bg-[#12151C] ${c.profileCount > 0 ? 'bg-[#0E1014]' : 'bg-[#0B0D10]'}`}
            title={c.profileCount > 0 ? `View ${c.profileCount} dossier(s) from ${c.name}` : `${c.name} - no dossiers yet`}
          >
            <FlagIcon iso2={c.iso2} className="!h-[18px] !w-[27px]" />
            <span className="w-full truncate text-center text-[9px] leading-tight text-vault-text2 group-hover:text-vault-text">{c.name}</span>
            <span className="font-mono text-[8px] text-vault-muted">{c.dial}</span>
            <span className={`font-mono text-[8px] uppercase tracking-[0.18em] ${c.profileCount > 0 ? 'text-vault-amber' : 'text-vault-muted/50'}`}>
              {c.profileCount > 0 ? `${c.profileCount} dossier${c.profileCount === 1 ? '' : 's'}` : ' - '}
            </span>
            {c.lastUpdated && <span className="font-mono text-[7px] text-vault-muted/60">{relativeTime(c.lastUpdated)}</span>}
          </button>
        ))}
        {filtered.length === 0 && <div className="col-span-full bg-[#0B0D10] py-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-vault-muted">No countries match</div>}
      </div>
    </div>
  )
}
