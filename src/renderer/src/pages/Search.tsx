import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import gsap from 'gsap'
import { Bookmark, CornerDownLeft, Scan, Trash2, Wand2 } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { ProfileTable, buildDefaultColumns } from '@/components/ProfileTable'
import { toastError, toastOk } from '@/stores/toast'
import type { SavedSearch, SearchResults } from '@shared/types'

const EXAMPLES = [
  'Show profiles created by me',
  'People from the United States who work in technology',
  'Top 5 newest profiles',
  'Profiles created in 2026',
  'Find profiles tagged with priority',
  'Find profiles with Gmail addresses',
  'People in finance from New York',
  'Find profiles with missing phone numbers',
]

export function SearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [result, setResult] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState<'text' | 'semantic' | 'documents'>('text')
  const [semantic, setSemantic] = useState<{ profileId: string; score: number }[]>([])
  const [docs, setDocs] = useState<{ attachmentId: string; profileId: string; name: string; snippet: string }[]>([])
  const [docStatus, setDocStatus] = useState<{ done: number; pending: number; failed: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<HTMLDivElement>(null)

  const { data: saved, reload: reloadSaved } = useAsync(() => call(zeus.search.saved()), [])
  const { data: recent, reload: reloadRecent } = useAsync(() => call(zeus.search.recent()), [])

  const run = async (text: string, targetPage = 1) => {
    const q = text.trim()
    if (!q) return
    setSearching(true)
    setPage(targetPage)
    setSearchParams({ q }, { replace: true })
    try {
      if (mode === 'documents') {
        const hits = await call(zeus.photos.docSearch(q))
        setDocs(hits)
        setResult(null)
        setSemantic([])
        const st = await call(zeus.photos.docStatus())
        setDocStatus({ done: st.done, pending: st.queued + st.processing, failed: st.failed })
        return
      }
      if (mode === 'semantic') {
        const hits = await call(zeus.nlp.semantic(q))
        const resolved = await Promise.all(
          hits.map(async (h) => {
            try {
              const d = await call(zeus.profiles.get(h.profileId))
              return { h, d }
            } catch {
              return null
            }
          }),
        )
        void resolved
        setSemantic(hits)
        setResult(null)
        return
      }
      const r = await call(zeus.search.query({ text: q, page: targetPage, pageSize: 50 }))
      setResult(r)
      setSemantic([])
      void reloadRecent()
    } catch (e) {
      toastError('Search failed', e instanceof Error ? e.message : undefined)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const q = searchParams.get('q')
    if (q && q.trim()) void run(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scanRef.current && searching) {
      gsap.fromTo(scanRef.current, { opacity: 0 }, { opacity: 1, duration: 0.15 })
    }
  }, [searching])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(query)
  }

  const saveSearch = async () => {
    const name = window.prompt('Name this saved search:', query.trim().slice(0, 60))
    if (!name?.trim()) return
    try {
      await call(zeus.search.save({ name: name.trim(), query: query.trim() }))
      toastOk('Search saved', name.trim())
      reloadSaved()
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : undefined)
    }
  }

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-12">
      {/* Left rail - command & saved searches */}
      <div className="vault-scroll overflow-y-auto border-b border-vault-border-soft p-5 xl:col-span-4 2xl:col-span-3 xl:border-b-0 xl:border-r">
        <div className="micro-label flex items-center gap-2"><Wand2 size={11} className="text-vault-red" /> Natural Language Query</div>
        <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">ASK THE<br /><span className="text-vault-red">ARCHIVE</span></h1>

        <form onSubmit={submit} className="relative mt-4">
          <div ref={scanRef} className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden opacity-0">
            <div className="scan-sweep h-full w-24 bg-gradient-to-r from-transparent via-vault-red/25 to-transparent" />
          </div>
          <input
            ref={inputRef}
            autoFocus
            className="vault-input h-14 w-full border-vault-red/20 px-4 font-mono text-[12.5px]"
            placeholder="Find everyone from Texas who works in technology…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Natural language search"
          />
          <button type="submit" className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-vault-red/50 bg-vault-red/15 text-vault-red transition-colors hover:bg-vault-red/25" aria-label="Run search">
            <CornerDownLeft size={15} />
          </button>
        </form>

        <div className="mt-3 flex gap-1.5">
          <button onClick={() => setMode('text')} className={`px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${mode === 'text' ? 'bg-vault-red/90 text-[#0D0507]' : 'border border-white/10 text-vault-text2 hover:text-vault-text'}`}>Text + NLP</button>
          <button onClick={() => setMode('semantic')} className={`px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${mode === 'semantic' ? 'bg-vault-red/90 text-[#0D0507]' : 'border border-white/10 text-vault-text2 hover:text-vault-text'}`}>Semantic</button>
          <button onClick={() => setMode('documents')} className={`px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] transition-colors ${mode === 'documents' ? 'bg-vault-red/90 text-[#0D0507]' : 'border border-white/10 text-vault-text2 hover:text-vault-text'}`}>Documents (OCR)</button>
          {mode === 'documents' && (
            <button className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-vault-text2 hover:text-vault-text" onClick={() => void call(zeus.photos.ocrAll()).then((r) => toastOk('OCR queued', `${r.queued} document(s) queued`)).catch((e) => toastError('OCR failed', e instanceof Error ? e.message : undefined))}>
              OCR all attachments
            </button>
          )}
          {mode === 'semantic' && (
            <button className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-vault-text2 hover:text-vault-text" onClick={() => void call(zeus.nlp.embedAll()).then((r) => toastOk('Embeddings built', `${r.embedded} profile(s)`)).catch((e) => toastError('Embedding failed', e instanceof Error ? e.message : undefined))}>
              Build embeddings
            </button>
          )}
        </div>

        <div className="mt-4">
          <div className="micro-label mb-1.5">Example Queries</div>
          <div className="flex flex-col items-start gap-1">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setQuery(ex); void run(ex) }} className="group flex items-baseline gap-2 text-left font-mono text-[10px] leading-relaxed text-vault-text2 transition-colors hover:text-vault-text">
                <span className="text-vault-red/70 group-hover:text-vault-red">›</span>{ex}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 border-t border-vault-border-soft pt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="micro-label">Saved Searches</span>
            {query.trim() && <button className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-vault-red hover:underline" onClick={() => void saveSearch()}><Bookmark size={9} className="mr-1 inline" />Save current</button>}
          </div>
          <div className="space-y-1">
            {(saved ?? []).map((s: SavedSearch) => (
              <div key={s.id} className="group flex items-center gap-2 border border-white/[0.05] px-2 py-1.5 transition-colors hover:border-white/[0.12]">
                <Bookmark size={10} className="shrink-0 text-vault-amber/80" />
                <button className="min-w-0 flex-1 truncate text-left text-[10.5px] text-vault-text2 hover:text-vault-text" title={s.query} onClick={() => { setQuery(s.query); void run(s.query) }}>
                  {s.name}
                </button>
                <button className="opacity-0 transition-opacity hover:text-vault-red group-hover:opacity-100" onClick={() => void call(zeus.search.deleteSaved(s.id)).then(reloadSaved)} aria-label="Delete saved search">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            {saved && saved.length === 0 && <div className="py-2 font-mono text-[9px] text-vault-muted">No saved searches yet</div>}
          </div>
        </div>

        <div className="mt-5 border-t border-vault-border-soft pt-4">
          <div className="micro-label mb-1.5">Recent Commands</div>
          <div className="space-y-1">
            {(recent ?? []).slice(0, 6).map((r) => (
              <button key={r.id} onClick={() => { setQuery(r.command); void run(r.command) }} className="block w-full truncate text-left font-mono text-[9px] text-vault-muted transition-colors hover:text-vault-text" title={r.command}>
                {r.command}
              </button>
            ))}
            {recent && recent.length === 0 && <div className="py-2 font-mono text-[9px] text-vault-muted">No recent commands</div>}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex min-h-0 flex-col xl:col-span-8 2xl:col-span-9">
        <div className="flex shrink-0 items-center justify-between border-b border-vault-border-soft px-4 py-2.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-vault-text2">
            {result ? <><span className="text-vault-text">{result.total}</span> record(s) · {result.tookMs}ms{result.interpretation.nlp ? ' · NLP' : ''}</> : 'Awaiting query'}
          </div>
          {result && result.interpretation.clauses.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {result.interpretation.clauses.map((c, i) => (
                <span key={i} className={`chip ${c.confidence === 'certain' ? '!border-vault-green/40 !text-vault-green' : c.confidence === 'inferred' ? '!border-vault-amber/40 !text-vault-amber' : '!border-vault-red/40 !text-vault-red'}`} title={c.confidence}>
                  {c.label}: {c.value}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="vault-scroll min-h-0 flex-1 overflow-auto">
          {searching && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Scan size={28} strokeWidth={1.25} className="animate-pulse text-vault-red" />
              <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-vault-muted">Scanning archive…</div>
            </div>
          )}
          {!searching && !result && docs.length > 0 && (
            <div className="p-4">
              <div className="micro-label mb-2">
                OCR matches{docStatus ? ` · ${docStatus.done} scanned · ${docStatus.pending} pending · ${docStatus.failed} failed` : ''}
              </div>
              <div className="space-y-1.5">
                {docs.map((d) => (
                  <button key={d.attachmentId} onClick={() => navigate(`/profiles/${d.profileId}`)} className="w-full border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-vault-red/40">
                    <div className="font-mono text-[10px] text-vault-text">{d.name}</div>
                    <div className="mt-0.5 line-clamp-2 font-mono text-[9px] text-vault-muted">…{d.snippet}…</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!searching && !result && semantic.length > 0 && (
            <div className="p-4">
              <div className="micro-label mb-2">Semantic matches · local embeddings · cosine similarity</div>
              <div className="space-y-1.5">
                {semantic.map((s) => (
                  <button key={s.profileId} onClick={() => navigate(`/profiles/${s.profileId}`)} className="flex w-full items-center justify-between border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-vault-red/40">
                    <span className="font-mono text-[10px] text-vault-text2">{s.profileId.slice(0, 8)}…</span>
                    <span className="font-mono text-[11px] font-bold text-vault-red">{s.score.toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!searching && result && (
            <ProfileTable
              rows={result.rows}
              columns={buildDefaultColumns().filter((c) => !['phone'].includes(c.id))}
              onOpen={(id) => navigate(`/profiles/${id}`)}
              showSelect={false}
            />
          )}
          {!searching && !result && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Scan size={36} strokeWidth={1} className="text-vault-muted" />
              <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-vault-muted">The archive awaits your query</div>
              <div className="max-w-sm text-[11px] leading-relaxed text-vault-text2">Full names, fields, natural language, countries, dates and missing-data detection are all queryable.</div>
            </div>
          )}
        </div>
        {result && (
          <div className="flex shrink-0 items-center justify-between border-t border-vault-border-soft px-4 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">
            {result.interpretation.freeText && <span>Free text: “{result.interpretation.freeText}”</span>}
            <div className="ml-auto flex items-center gap-3">
              <button className="vault-btn vault-btn-ghost !px-2 !py-1" disabled={page <= 1} onClick={() => void run(query, page - 1)}>Prev</button>
              <span>{page} / {pageCount}</span>
              <button className="vault-btn vault-btn-ghost !px-2 !py-1" disabled={page >= pageCount} onClick={() => void run(query, page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
