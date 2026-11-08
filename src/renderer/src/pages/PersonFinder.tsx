import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Image as ImageIcon, ScanFace, Users } from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { detectPeople, type DetectedFace } from '@/lib/facefinder'
import { toastError, toastOk } from '@/stores/toast'
import type { ProfileListItem } from '@shared/types'

const FEATURE_POINTS = [0, 8, 16, 36, 39, 42, 45, 48, 54, 27, 30]
const MESH_LINKS: [number, number][] = []
for (let i = 0; i < 16; i++) MESH_LINKS.push([i, i + 1])
for (let i = 17; i < 24; i++) MESH_LINKS.push([i, i + 1])
for (let i = 27; i < 34; i++) MESH_LINKS.push([i, i + 1])
for (let i = 36; i < 41; i++) MESH_LINKS.push([i, i + 1])
MESH_LINKS.push([41, 36])
for (let i = 42; i < 47; i++) MESH_LINKS.push([i, i + 1])
MESH_LINKS.push([47, 42])
for (let i = 48; i < 59; i++) MESH_LINKS.push([i, i + 1])
MESH_LINKS.push([59, 48])
for (let i = 61; i < 67; i++) MESH_LINKS.push([i, i + 1])
MESH_LINKS.push([67, 61])
const BOX_COLORS = ['#E34B64', '#5F8FB0', '#4F8A6B', '#D69B45', '#8A7FB0', '#7A8B9A', '#C86F4A']

export function PersonFinder() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [faces, setFaces] = useState<DetectedFace[]>([])
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [saveFor, setSaveFor] = useState<number | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [candidates, setCandidates] = useState<ProfileListItem[]>([])

  const openPicker = (i: number) => {
    setSaveFor(i)
    setPickerQuery('')
    setCandidates([])
  }

  const searchProfiles = async (q: string) => {
    setPickerQuery(q)
    if (!q.trim()) {
      setCandidates([])
      return
    }
    try {
      const r = await call(zeus.profiles.list({ search: q.trim().slice(0, 60), view: 'all-status', page: 1, pageSize: 8 }))
      setCandidates(r.rows)
    } catch {
      setCandidates([])
    }
  }

  const saveFaceTo = async (face: DetectedFace, profile: ProfileListItem) => {
    try {
      await call(zeus.photos.saveFace({ profileId: profile.id, cropDataUrl: face.crop, geom: undefined, desc: face.desc ?? undefined }))
      toastOk('Face saved', `${face.match ? 'updated' : 'new'} reference under ${profile.fullName} (${profile.profileCode})`)
      setSaveFor(null)
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : undefined)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    setFaces([])
    setBusy(true)
    setModelStatus('loading')
    try {
      const detected = await detectPeople(url)
      const probe = new Image()
      await new Promise<void>((res) => {
        probe.onload = () => res()
        probe.onerror = () => res()
        probe.src = url
      })
      setDims({ w: probe.naturalWidth, h: probe.naturalHeight })
      setModelStatus('ready')
      if (detected.length === 0) {
        toastError('No faces found', 'Try a clearer, front-facing photo.')
        return
      }
      toastOk(`${detected.length} face${detected.length === 1 ? '' : 's'} found`, 'Matching each face against stored face descriptors (distance ≤ 0.6)…')
      const withMatch = await Promise.all(
        detected.map(async (f) => {
          try {
            const hits = await call(zeus.photos.matchFace({ cropDataUrl: f.crop, geom: undefined, desc: f.desc ?? undefined }))
            const best = hits[0]
            return best ? { ...f, match: { profileId: best.profileId, score: best.score, distance: best.distance, name: best.name, code: best.code } } : f
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
                    {MESH_LINKS.map(([a, b], j) => {
                      const pa = f.landmarks[a]
                      const pb = f.landmarks[b]
                      if (!pa || !pb) return null
                      return <line key={j} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={c} strokeWidth={1.2} opacity={active ? 0.9 : 0.45} />
                    })}
                    {FEATURE_POINTS.map((p, j) => {
                      const pt = f.landmarks[p]
                      if (!pt) return null
                      return <circle key={j} cx={pt.x} cy={pt.y} r={dims.w * 0.006} fill={c} />
                    })}
                    {f.match ? (
                      <g>
                        <rect x={f.box.x} y={Math.max(0, f.box.y - dims.h * 0.055)} width={dims.w * 0.34} height={dims.h * 0.05} fill="#0D0F12" stroke={c} strokeWidth={1.5} />
                      <text x={f.box.x + 6} y={Math.max(0, f.box.y - dims.h * 0.016)} fill={c} fontSize={dims.h * 0.032} fontFamily="monospace">
                        {`#${f.index + 1} ${f.match.score >= 85 ? f.match.name : f.match.score >= 70 ? `~${f.match.name}` : 'no confident match'} d=${f.match.distance !== null && f.match.distance !== undefined ? f.match.distance.toFixed(2) : '?'} ${f.match.score.toFixed(0)}%`}
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
              <div key={f.index} onMouseEnter={() => setHover(f.index)} onMouseLeave={() => setHover(null)} className={`border px-3 py-2 transition-colors ${f.match ? 'border-white/[0.08] bg-white/[0.02]' : 'border-white/[0.05]'} ${hover === f.index ? 'border-vault-red/40' : ''}`}>
                <div className="flex items-center justify-between">
                  <button onClick={() => f.match && navigate(`/profiles/${f.match.profileId}`)} className="min-w-0 flex-1 text-left">
                    <span className="font-mono text-[10px] text-vault-text2">
                      <span style={{ color: BOX_COLORS[i % BOX_COLORS.length] }}>■</span> Face #{f.index + 1}
                      {f.match ? <span className="text-vault-text"> — {f.match.score >= 85 ? f.match.name : f.match.score >= 70 ? `~${f.match.name}` : 'no confident match'} <span className="text-vault-muted">({f.match.code})</span></span> : <span> — new person</span>}
                    </span>
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    {f.match && <span className="font-mono text-[11px] font-bold text-vault-red">{f.match.score.toFixed(1)}%</span>}
                    <span role="button" tabIndex={0} className={`font-mono text-[9px] uppercase tracking-[0.18em] ${saveFor === f.index ? 'text-vault-red' : 'text-vault-muted hover:text-vault-text'}`} onClick={() => openPicker(f.index)}>
                      {f.match ? 'Save as reference' : 'Save to dossier'}
                    </span>
                  </span>
                </div>
                {saveFor === f.index && (
                  <div className="mt-2 border-t border-white/[0.06] pt-2">
                    <input autoFocus value={pickerQuery} onChange={(e) => void searchProfiles(e.target.value)} placeholder="Search a dossier to store this face under…" className="vault-input h-9 w-full px-2 text-[11px]" />
                    <div className="mt-1.5 space-y-1">
                      {candidates.map((c) => (
                        <button key={c.id} onClick={() => void saveFaceTo(f, c)} className="flex w-full items-center justify-between border border-white/[0.06] px-2 py-1.5 text-left hover:border-vault-red/40">
                          <span className="text-[11px] text-vault-text2">{c.fullName}</span>
                          <span className="font-mono text-[8px] text-vault-muted">{c.profileCode}</span>
                        </button>
                      ))}
                      {candidates.length === 0 && <div className="font-mono text-[9px] text-vault-muted">Type at least 2 characters…</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-[8px] uppercase tracking-[0.25em] text-vault-muted">Hover a face to inspect · click a matched person to open their dossier</p>
        </div>
      )}
    </div>
  )
}
