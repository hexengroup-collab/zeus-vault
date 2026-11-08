import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Image as ImageIcon, ScanFace, Users } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { detectPeople, type DetectedFace } from '@/lib/facefinder'
import { toastError, toastOk } from '@/stores/toast'

const FEATURE_POINTS = [1, 33, 263, 468, 473, 61, 291, 199, 90, 13, 14, 234, 454, 127, 356]
const BOX_COLORS = ['#E34B64', '#5F8FB0', '#4F8A6B', '#D69B45', '#8A7FB0', '#7A8B9A', '#C86F4A']

export function PersonFinder() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [faces, setFaces] = useState<DetectedFace[]>([])
  const [tess, setTess] = useState<{ start: number; end: number }[]>([])
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    setFaces([])
    setBusy(true)
    setModelStatus('loading')
    try {
      const r = await detectPeople(url)
      setTess(r.tess)
      setDims({ w: r.width, h: r.height })
      setModelStatus('ready')
      if (r.faces.length === 0) {
        toastError('No faces found', 'Try a clearer, front-facing photo.')
        return
      }
      toastOk(`${r.faces.length} face${r.faces.length === 1 ? '' : 's'} found`, 'Matching each face against stored photo tokens…')
      const withMatch = await Promise.all(
        r.faces.map(async (f) => {
          try {
            const hits = await call(zeus.photos.matchFace(f.crop))
            const best = hits.find((h) => h.score >= 50)
            return best ? { ...f, match: { profileId: best.profileId, score: best.score, name: best.name, code: best.code } } : f
          } catch {
            return f
          }
        }),
      )
      setFaces(withMatch)
    } catch (e) {
      setModelStatus('error')
      toastError('Person detection failed', e instanceof Error ? e.message : 'Model assets unreadable — check the model status below')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="micro-label flex items-center gap-2"><ScanFace size={10} className="text-vault-red" /> Local Facial Intelligence</div>
      <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">PERSON FINDER</h1>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">Detects every face in a photo, maps facial landmarks, and identifies each person against the archive — 100% on-device</p>

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
          <ImageIcon size={22} className="text-vault-muted" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-text2">Drop a photo with people, or click to choose</span>
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-vault-muted">Handles 1–20+ faces · boxes + eyes / lips / ears landmarks + mesh</span>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </div>

        <div className="mt-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">
          <Users size={12} />
          <span>
            Model: {modelStatus === 'idle' ? 'standby (loads on first photo)' : modelStatus === 'loading' ? 'loading…' : modelStatus === 'ready' ? 'ready (MediaPipe, local)' : 'unavailable — see log'}
          </span>
          {busy && <span className="animate-pulse text-vault-red">Scanning…</span>}
        </div>
      </div>

      {src && dims.w > 0 && (
        <div className="mt-6">
          <div className="relative mx-auto w-fit max-w-full overflow-hidden border border-white/10">
            <img src={src} alt="People photo" className="block max-h-[70vh] max-w-full" />
            <svg viewBox={`0 0 ${dims.w} ${dims.h}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {faces.map((f, i) => {
                const c = BOX_COLORS[i % BOX_COLORS.length]
                const active = hover === f.index
                return (
                  <g key={f.index} onMouseEnter={() => setHover(f.index)} onMouseLeave={() => setHover(null)} onClick={() => f.match && navigate(`/profiles/${f.match.profileId}`)} className={f.match ? 'cursor-pointer' : ''}>
                    <rect x={f.box.x} y={f.box.y} width={f.box.w} height={f.box.h} fill="none" stroke={c} strokeWidth={active ? 6 : 3} />
                    {tess.map((t, j) => {
                      const a = f.landmarks[t.start]
                      const b = f.landmarks[t.end]
                      if (!a || !b) return null
                      return <line key={j} x1={a.x * dims.w} y1={a.y * dims.h} x2={b.x * dims.w} y2={b.y * dims.h} stroke={c} strokeWidth={0.8} opacity={active ? 0.9 : 0.45} />
                    })}
                    {FEATURE_POINTS.map((p, j) => {
                      const pt = f.landmarks[p]
                      if (!pt) return null
                      return <circle key={j} cx={pt.x * dims.w} cy={pt.y * dims.h} r={dims.w * 0.006} fill={c} />
                    })}
                    {f.match ? (
                      <g>
                        <rect x={f.box.x} y={Math.max(0, f.box.y - dims.h * 0.055)} width={dims.w * 0.34} height={dims.h * 0.05} fill="#0D0F12" stroke={c} strokeWidth={1.5} />
                        <text x={f.box.x + 6} y={Math.max(0, f.box.y - dims.h * 0.016)} fill={c} fontSize={dims.h * 0.032} fontFamily="monospace">
                          {`#${f.index + 1} ${f.match.name} ${f.match.score.toFixed(0)}%`}
                        </text>
                      </g>
                    ) : (
                      <text x={f.box.x} y={Math.max(0, f.box.y - 6)} fill={c} fontSize={dims.h * 0.03} fontFamily="monospace">
                        {`#${f.index + 1} unknown`}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>

          <div className="mt-4 space-y-1.5">
            {faces.map((f, i) => (
              <button
                key={f.index}
                onMouseEnter={() => setHover(f.index)}
                onMouseLeave={() => setHover(null)}
                onClick={() => f.match && navigate(`/profiles/${f.match.profileId}`)}
                className={`flex w-full items-center justify-between border px-3 py-2 text-left transition-colors ${f.match ? 'border-white/[0.08] bg-white/[0.02] hover:border-vault-red/40' : 'border-white/[0.05] opacity-70'}`}
              >
                <span className="font-mono text-[10px] text-vault-text2">
                  <span style={{ color: BOX_COLORS[i % BOX_COLORS.length] }}>■</span> Face #{f.index + 1}
                  {f.match ? <span className="text-vault-text"> — {f.match.name} <span className="text-vault-muted">({f.match.code})</span></span> : <span> — no archive match</span>}
                </span>
                {f.match && <span className="font-mono text-[11px] font-bold text-vault-red">{f.match.score.toFixed(1)}%</span>}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-[8px] uppercase tracking-[0.25em] text-vault-muted">Hover a face to inspect · click a matched person to open their dossier</p>
        </div>
      )}
    </div>
  )
}
