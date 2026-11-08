import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, FolderOpen, Image as ImageIcon, ScanFace } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { fileToDataUrl } from '@/lib/images'
import { toastError, toastOk } from '@/stores/toast'
import { Avatar } from '@/components/Avatar'
import { defaultAvatar } from '@/lib/format'
import type { PhotoMatch, PhotoQueueStatus } from '@shared/types'

const SCORE_LABEL = (score: number) =>
  score >= 92 ? 'Near-exact match' : score >= 75 ? 'Likely same subject' : score >= 55 ? 'Possible match' : 'Weak signal'

export function ImageSearch() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [matches, setMatches] = useState<PhotoMatch[]>([])
  const [faceDetected, setFaceDetected] = useState(false)
  const [scores, setScores] = useState<Record<string, { name: string; code: string; avatar: string | null }>>({})
  const [queue, setQueue] = useState<PhotoQueueStatus | null>(null)
  const [view, setView] = useState('all-status')
  const [text, setText] = useState('')

  useEffect(() => {
    let alive = true
    const t = setInterval(() => {
      void call(zeus.photos.status())
        .then((s) => {
          if (alive) setQueue(s)
        })
        .catch(() => {})
    }, 2000)
    void call(zeus.photos.status())
      .then((s) => {
        if (alive) setQueue(s)
      })
      .catch(() => {})
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const runSearch = async (url: string) => {
    setMatches([])
    setSearching(true)
    try {
      const r = await call(zeus.photos.search({ dataUrl: url, view: view === 'all-status' ? undefined : view, text: text || undefined }))
      setFaceDetected(r.faceDetected)
      setMatches(r.matches)
      for (const m of r.matches.slice(0, 20)) {
        call(zeus.profiles.get(m.profileId))
          .then((d) => setScores((prev) => ({ ...prev, [m.profileId]: { name: d.basic.fullName, code: d.profileCode, avatar: d.avatar } })))
          .catch(() => {})
      }
    } catch (e) {
      toastError('Image search failed', e instanceof Error ? e.message : undefined)
    } finally {
      setSearching(false)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const url = await fileToDataUrl(file, 512, 0.85)
      setPreview(URL.createObjectURL(file))
      setDataUrl(url)
      await runSearch(url)
    } catch (e) {
      toastError('Image search failed', e instanceof Error ? e.message : undefined)
    }
  }

  const pending = (queue?.queued ?? 0) + (queue?.processing ?? 0)

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="micro-label">Visual Dossier Search</div>
      <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">IMAGE SEARCH</h1>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">Matches the query against stored photo tokens — archive images are never re-scanned</p>

      <div className="mt-6 vault-panel p-5">
        <div
          className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-white/15 p-8 text-center transition-colors hover:border-vault-red/50"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void onFile(e.dataTransfer.files?.[0])
          }}
        >
          {preview ? (
            <img src={preview} alt="Query" className="max-h-48 rounded-[3px] object-contain" />
          ) : (
            <>
              <ImageIcon size={22} className="text-vault-muted" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-text2">Drop a photo here or click to choose</span>
              <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-vault-muted">Any subject — a person, an object, a scene</span>
            </>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select value={view} onChange={(e) => setView(e.target.value)} className="vault-input h-10 px-2 text-[11px]" aria-label="Status filter">
            <option value="all-status">All statuses</option>
            <option value="active">Active only</option>
            <option value="archived">Archived only</option>
          </select>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by name, tag…" className="vault-input h-10 min-w-52 flex-1 px-3 text-[11px]" aria-label="Text filter" />
          <button
            className="vault-btn vault-btn-primary h-10"
            disabled={!dataUrl || searching}
            onClick={() => dataUrl && void runSearch(dataUrl)}
          >
            <ScanFace size={13} /> {searching ? 'Matching…' : 'Search again'}
          </button>
          <button
            className="vault-btn vault-btn-ghost h-10"
            onClick={() =>
              void call(zeus.photos.enqueueAll())
                .then((r) => {
                  toastOk('Tokenize queued', `${r.queued} photo(s) queued`)
                  return call(zeus.photos.status())
                })
                .then((s) => setQueue(s))
                .catch((e) => toastError('Tokenize failed', e instanceof Error ? e.message : undefined))
            }
          >
            <FolderOpen size={13} /> Tokenize all photos
          </button>
        </div>

        {queue && (
          <div className="mt-4 border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">
              <span>
                Token queue: {queue.done} done · {pending} pending · {queue.failed} failed
              </span>
              <span>{queue.current ? `Now: ${queue.current}` : queue.queued + queue.processing === 0 ? 'All photos tokenized' : 'Processing…'}</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-white/[0.06]">
              <div
                className="h-1.5 bg-vault-red transition-all"
                style={{ width: `${queue.done + queue.failed === 0 ? 0 : Math.round((queue.done / (queue.done + queue.failed + pending || 1)) * 100)}%` }}
              />
            </div>
            {queue.lastError && (
              <div className="mt-2 border border-vault-red/40 bg-vault-red/[0.08] px-2 py-1.5 font-mono text-[9px] text-vault-red">
                Last tokenize error: {queue.lastError}
              </div>
            )}
          </div>
        )}

        {faceDetected && (
          <div className="mt-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-vault-text2">
            <Camera size={12} /> Face region detected in query — face token used in scoring
          </div>
        )}
      </div>

      {matches.length > 0 && (
        <div className="mt-6">
          <div className="micro-label mb-2">{matches.length} match{matches.length === 1 ? '' : 'es'} · ranked by perceptual similarity</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {matches.map((m) => {
              const p = scores[m.profileId]
              return (
                <Link key={m.tokenId} to={`/profiles/${m.profileId}`} className="flex items-center gap-3 border border-white/[0.08] bg-white/[0.02] p-3 transition-colors hover:border-vault-red/40">
                  {m.image ? (
                    <img src={m.image} alt={m.label} className="h-11 w-11 shrink-0 rounded-[3px] object-cover" />
                  ) : (
                    <Avatar src={p?.avatar ?? defaultAvatar(p?.name ?? '?')} name={p?.name ?? '?'} size={44} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-vault-text">{p?.name ?? m.profileId}</div>
                    <div className="truncate font-mono text-[8px] uppercase tracking-[0.18em] text-vault-muted">
                      {p?.code ?? ''} · {m.label} · {SCORE_LABEL(m.score)}
                      {m.faceDetected ? ' · face data' : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[13px] font-bold text-vault-red">{m.score.toFixed(1)}%</div>
                    <div className="font-mono text-[7px] uppercase tracking-[0.15em] text-vault-muted">phash {m.phashSim} · color {m.histSim}{m.faceSim !== null ? ` · face ${m.faceSim}` : ''}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
      {matches.length === 0 && !searching && (
        <p className="mt-6 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">No matches yet — drop a photo above</p>
      )}
    </div>
  )
}
