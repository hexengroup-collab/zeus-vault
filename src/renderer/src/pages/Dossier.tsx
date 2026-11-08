import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import gsap from 'gsap'
import {
  Archive,
  ArrowLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Pencil,
  RotateCcw,
  Star,
  StickyNote,
  Trash2,
  Upload,
} from 'lucide-react'
import { call, zeus } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSession } from '@/stores/session'
import { Avatar } from '@/components/Avatar'
import { CopyButton } from '@/components/CopyButton'
import { FlagIcon } from '@/components/FlagIcon'
import { Section } from '@/components/Section'
import { FieldRow } from '@/components/FieldRow'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Modal } from '@/components/Modal'
import { toastError, toastInfo, toastOk } from '@/stores/toast'
import { formatTimestamp, relativeTime } from '@shared/time'
import { bytes, defaultAvatar, ageFromDob } from '@/lib/format'

import { copyText } from '@/lib/clipboard'
import { fullAddress } from '@shared/address'

export function Dossier() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useSession()
  const { data, loading, error, reload } = useAsync(() => call(zeus.profiles.get(id!)), [id])
  const [favorite, setFavorite] = useState<boolean | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [tab, setTab] = useState<'history' | 'audit'>('history')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [hoveredZoom, setHoveredZoom] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 })
  const headerRef = useRef<HTMLDivElement>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const { data: history } = useAsync(() => call(zeus.profiles.fieldHistory(id!)), [id])
  const { data: auditTrail } = useAsync(() => call(zeus.profiles.audit(id!)), [id])
  const { data: tokens } = useAsync(() => call(zeus.photos.profile(id!)), [id, data?.avatar])
  const avatarToken = tokens?.find((t) => t.kind === 'avatar')

  useEffect(() => {
    if (data) setFavorite(data.isFavorite)
  }, [data])

  useEffect(() => {
    if (headerRef.current) {
      gsap.fromTo(headerRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' })
    }
  }, [id])

  const isReadOnly = user?.role === 'readonly'

  if (loading) return <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.4em] text-vault-muted">Retrieving dossier…</div>
  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-vault-red">Dossier unavailable</div>
        <div className="text-[12px] text-vault-text2">{error ?? 'Record not found.'}</div>
        <button className="vault-btn" onClick={() => navigate('/profiles')}><ArrowLeft size={12} /> Back to archive</button>
      </div>
    )
  }

  const d = data
  const age = ageFromDob(d.basic.dob)
  const isFavorite = favorite ?? d.isFavorite
  const fieldMeta = new Map(d.custom.fieldMeta.map((m) => [m.key, m]))
  const metaFor = (...keys: string[]) => {
    for (const k of keys) {
      const m = fieldMeta.get(k)
      if (m) return { updatedBy: m.updatedBy || null, updatedAt: m.updatedAt }
    }
    return { updatedBy: null, updatedAt: null }
  }

  const doArchive = async () => {
    try {
      if (d.status === 'archived') {
        await call(zeus.profiles.restore(d.id))
        toastOk('Profile restored', d.profileCode)
      } else {
        await call(zeus.profiles.archive(d.id))
        toastOk('Profile archived', d.profileCode)
      }
      await reload()
    } catch (e) {
      toastError('Action failed', e instanceof Error ? e.message : undefined)
    }
  }
  const doDelete = async () => {
    try {
      await call(zeus.profiles.remove(d.id))
      toastOk('Profile deleted', `${d.profileCode} soft-deleted · audit recorded`)
      navigate('/profiles')
    } catch (e) {
      toastError('Delete failed', e instanceof Error ? e.message : undefined)
    }
  }
  const doDuplicate = async () => {
    try {
      const copy = await call(zeus.profiles.duplicate(d.id))
      toastOk('Dossier duplicated', copy.profileCode)
      navigate(`/profiles/${copy.id}`)
    } catch (e) {
      toastError('Duplicate failed', e instanceof Error ? e.message : undefined)
    }
  }
  const toggleFavorite = async () => {
    try {
      const result = await call(zeus.profiles.toggleFavorite(d.id))
      setFavorite(result.isFavorite)
      toastInfo(result.isFavorite ? 'Added to favorites' : 'Removed from favorites', d.profileCode)
    } catch (e) {
      toastError('Favorite failed', e instanceof Error ? e.message : undefined)
    }
  }
  const copyAll = async () => {
    const text = await call(zeus.profiles.composeCopyText({ id: d.id, includeSecrets: true }))
    const ok = await copyText(text, 0)
    toastOk(ok ? 'Full dossier copied' : 'Copy failed', d.profileCode)
  }
  const exportPdf = async () => {
    try {
      const picked = await call(zeus.importexport.pickSave({ format: 'pdf', defaultName: `dossier-${d.profileCode}.pdf` }))
      if (!picked) return
      const result = await call(zeus.importexport.exportDossier({ id: d.id, includeSensitive: false, targetPath: picked.filePath }))
      toastOk('Dossier exported', result.filePath)
    } catch (e) {
      toastError('Export failed', e instanceof Error ? e.message : undefined)
    }
  }
  const onAttachment = async (e: ChangeEvent<HTMLInputElement>, kind: 'attachment' | 'gallery-image') => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result)
        if (kind === 'attachment') {
          await call(zeus.profiles.addAttachment({ id: d.id, name: file.name, mime: file.type || 'application/octet-stream', dataUrl, category: 'documents' }))
          toastOk('Attachment added', file.name)
        } else {
          await call(zeus.profiles.addGalleryImage({ id: d.id, name: file.name, dataUrl }))
          toastOk('Image added', file.name)
          // Capture face geometry from the new image (best-effort, local).
          try {
            const { captureGeometry } = await import('@/lib/facefinder')
            const geom = await captureGeometry(dataUrl)
            if (geom) await call(zeus.photos.saveGeom({ profileId: d.id, geom, kind: 'gallery' }))
          } catch {
            /* geometry capture is optional */
          }
        }
        await reload()
      } catch (err) {
        toastError('Upload rejected', err instanceof Error ? err.message : undefined)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="vault-scroll min-h-full">
      {/* Header band */}
      <div ref={headerRef} className="relative border-b border-vault-border-soft px-6 pb-5 pt-5">
        {d.isDemo && <div className="pointer-events-none absolute right-6 top-4 chip !border-vault-amber/40 !text-vault-amber">FICTIONAL DEMO</div>}
        <div className="flex items-start gap-5">
          <button className="mt-1 text-vault-muted transition-colors hover:text-vault-text" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={18} strokeWidth={1.5} />
          </button>
          <div
            className="relative shrink-0 cursor-crosshair"
            onMouseEnter={() => setHoveredZoom(true)}
            onMouseLeave={() => setHoveredZoom(false)}
            onMouseMove={(e) => setZoomPos({ x: e.clientX, y: e.clientY })}
          >
            <Avatar src={d.avatar} name={d.basic.fullName} size={104} className="!rounded-[3px] border-white/15" />
            <div className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-[#0C0E11] bg-vault-green" title="Record active" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="micro-label">{d.audit.createdBy ? `File opened by archive handlers` : 'Dossier'}</div>
            <h1 className="mt-1 truncate font-condensed text-5xl font-bold leading-none tracking-tight text-vault-text">{d.basic.fullName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[11px] tracking-[0.1em] text-vault-red">{d.profileCode}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-vault-text2"><FlagIcon iso2={d.basic.countryIso2} />{d.basic.country || 'Unknown'}{d.basic.city ? ` · ${d.basic.city}` : ''}</span>
              <span className="chip">{d.basic.categoryName}</span>
              <span className={`chip ${d.status === 'active' ? '!border-vault-green/40 !text-vault-green' : '!border-vault-amber/40 !text-vault-amber'}`}>{d.status}</span>
              {age !== null && <span className="chip">AGE {age}</span>}
              {d.avatar && (
                <span className={`chip ${!avatarToken ? '!border-vault-amber/40 !text-vault-amber' : avatarToken.status === 'done' ? '!border-vault-green/40 !text-vault-green' : '!border-vault-amber/40 !text-vault-amber'}`} title="Photo token status">
                  TOKEN: {!avatarToken ? 'QUEUED' : avatarToken.status.toUpperCase()}{avatarToken?.faceDetected ? ' · FACE' : ''}
                </span>
              )}
            </div>
            {/* Action row */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {!isReadOnly && <button className="vault-btn vault-btn-primary" onClick={() => navigate(`/profiles/${d.id}/edit`)}><Pencil size={12} /> Edit</button>}
              <button className="vault-btn" onClick={() => void toggleFavorite()} title="Toggle favorite">
                <Star size={12} className={isFavorite ? 'fill-vault-amber text-vault-amber' : ''} /> {isFavorite ? 'Favorited' : 'Favorite'}
              </button>
              {!isReadOnly && <button className="vault-btn" onClick={() => void doDuplicate()}><Copy size={12} /> Duplicate</button>}
              <button className="vault-btn" onClick={() => void copyAll()}><Copy size={12} /> Copy All</button>
              <button className="vault-btn" onClick={() => void exportPdf()}><Download size={12} /> Dossier PDF</button>
              {!isReadOnly && (
                <button className="vault-btn" onClick={() => setConfirmArchive(true)}>
                  {d.status === 'archived' ? <><RotateCcw size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
                </button>
              )}
              {!isReadOnly && <button className="vault-btn vault-btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={12} /> Delete</button>}
            </div>
          </div>
        </div>

        {/* Proximity zoom floating preview */}
        {hoveredZoom && (
          <div
            className="pointer-events-none fixed z-50 hidden lg:block"
            style={{ left: Math.min(zoomPos.x + 24, window.innerWidth - 320), top: Math.min(zoomPos.y + 16, window.innerHeight - 340) }}
          >
            <div className="border border-vault-border bg-[#121419]/97 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
              <img src={d.avatar ?? defaultAvatar(d.basic.fullName)} alt={d.basic.fullName} className="h-64 w-64 object-cover" draggable={false} />
              <div className="flex items-center justify-between px-1 pb-1 pt-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2">{d.profileCode}</span>
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-text2"><FlagIcon iso2={d.basic.countryIso2} className="!h-[8px]" />{d.basic.countryIso2 || ' - '}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-12">
        {/* LEFT - information sections */}
        <div className="space-y-3 xl:col-span-7">
          <Section index="01" title="Personal Information">
            <dl>
              <FieldRow label="Full Name" value={d.basic.fullName} {...metaFor('fullName')} />
              <FieldRow label="Username" value={d.basic.username} {...metaFor('username')} />
              <FieldRow label="Profile ID" value={d.profileCode} />
              <FieldRow label="Date of Birth" value={d.basic.dob ? `${d.basic.dob}${age !== null ? `  ·  age ${age}` : ''}` : ''} copyValue={d.basic.dob} {...metaFor('dob')} />
              <FieldRow label="Gender" value={d.basic.gender} {...metaFor('gender')} />
              <FieldRow label="Nationality" value={d.basic.nationality} {...metaFor('nationality')} />
              <FieldRow label="Country" value={d.basic.country ? `${d.basic.country} (${d.basic.countryIso2})` : ''} copyValue={d.basic.country} {...metaFor('country')} />
              <FieldRow label="State / Province" value={d.basic.state} {...metaFor('state')} />
              <FieldRow label="City" value={d.basic.city} {...metaFor('city')} />
              <FieldRow label="Preferred Language" value={d.basic.preferredLanguage} {...metaFor('preferredLanguage')} />
              <FieldRow label="Timezone" value={d.basic.timezone} {...metaFor('timezone')} />
              <FieldRow label="Profile Status" value={d.basic.profileStatus} {...metaFor('profileStatus')} />
              <FieldRow label="Category" value={d.basic.categoryName} copyValue={d.basic.categoryName} />
            </dl>
          </Section>

          <Section index="02" title="Contact Information">
            <dl>
              <FieldRow label="Primary Phone" value={d.contact.primaryPhone} {...metaFor('primaryPhone')} />
              <FieldRow label="Secondary Phone" value={d.contact.secondaryPhone} {...metaFor('secondaryPhone')} />
              <FieldRow label="Phone Country Code" value={d.contact.phoneCountryCode} {...metaFor('phoneCountryCode')} />
              <FieldRow label="Primary Email" value={d.contact.primaryEmail} {...metaFor('primaryEmail')} />
              <FieldRow label="Secondary Email" value={d.contact.secondaryEmail} {...metaFor('secondaryEmail')} />
              <FieldRow label="Alternative Email" value={d.contact.altEmail} {...metaFor('altEmail')} />
              <FieldRow label="Website" value={d.contact.website} {...metaFor('website')} />
              <FieldRow label="Contact Preferences" value={d.contact.contactPreference} {...metaFor('contactPreference')} />
            </dl>
            {d.contact.socialLinks.length > 0 && (
              <div className="mt-2 border-t border-white/[0.05] pt-2">
                <div className="micro-label mb-1.5">Social Channels</div>
                {d.contact.socialLinks.map((s) => (
                  <FieldRow key={s.id ?? s.url} label={s.label || 'Link'} value={s.url} />
                ))}
              </div>
            )}
          </Section>

          <Section index="03" title="Address Information">
            <dl>
              <FieldRow label="Street Address" value={d.address.street} {...metaFor('street')} />
              <FieldRow label="Apartment / Suite" value={d.address.apartment} {...metaFor('apartment')} />
              <FieldRow label="City" value={d.address.city} {...metaFor('city')} />
              <FieldRow label="State" value={d.address.state} {...metaFor('state')} />
              <FieldRow label="ZIP / Postal Code" value={d.address.postalCode} {...metaFor('postalCode')} />
              <FieldRow label="Country" value={d.address.country} {...metaFor('country')} />
              <FieldRow label="Country Code" value={d.address.countryCode} {...metaFor('countryCode')} />
              <FieldRow label="Full Address" value={fullAddress(d)} {...metaFor('street')} />
            </dl>
          </Section>

          <Section index="04" title="Account Information" hint="Encrypted at rest">
            <dl>
              <FieldRow label="Login Username" value={d.account.loginUsername} {...metaFor('loginUsername')} />
              <FieldRow label="Login Email" value={d.account.loginEmail} {...metaFor('loginEmail')} />
              <div className="group grid grid-cols-[150px_1fr_auto] items-center gap-3 border-b border-white/[0.045] py-[7px] md:grid-cols-[180px_1fr_auto]">
                <dt className="micro-label">Account Password</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {d.account.hasPassword ? (
                    <>
                      <span className="font-mono text-[12px] tracking-wider text-vault-amber">{passwordVisible ? d.account.password : '••••••••••••'}</span>
                      <button className="text-vault-muted transition-colors hover:text-vault-text" onClick={() => setPasswordVisible((v) => !v)} aria-label="Toggle password visibility">
                        {passwordVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <CopyButton value={d.account.password} clearSeconds={15} />
                      {d.account.passwordUpdatedAt && <span className="hidden font-mono text-[8px] uppercase tracking-[0.14em] text-vault-muted xl:inline">rotated {relativeTime(d.account.passwordUpdatedAt)}</span>}
                    </>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-muted">Not set</span>
                  )}
                </dd>
                <dd />
              </div>
              <FieldRow label="Account Provider" value={d.account.accountProvider} {...metaFor('accountProvider')} />
              <FieldRow label="Account Created" value={d.account.accountCreatedAt} {...metaFor('accountCreatedAt')} />
              <FieldRow label="Last Login" value={d.account.lastLogin} {...metaFor('lastLogin')} />
              <FieldRow label="Account Status" value={d.account.status} {...metaFor('accountStatus')} />
              <FieldRow label="Recovery Info" value={d.account.recoveryInfo} masked={!passwordVisible} copyValue={d.account.recoveryInfo} clearSeconds={15} {...metaFor('recoveryInfo')} />
              <FieldRow label="Account Notes" value={d.account.notes} {...metaFor('notes')} />
            </dl>
          </Section>

          <Section index="05" title="Professional Information">
            <dl>
              <FieldRow label="Occupation" value={d.professional.occupation} {...metaFor('occupation')} />
              <FieldRow label="Job Title" value={d.professional.jobTitle} {...metaFor('jobTitle')} />
              <FieldRow label="Company" value={d.professional.company} {...metaFor('company')} />
              <FieldRow label="Industry" value={d.professional.industry} {...metaFor('industry')} />
              <FieldRow label="Professional Website" value={d.professional.website} {...metaFor('website')} />
              <FieldRow label="Work Email" value={d.professional.workEmail} {...metaFor('workEmail')} />
              <FieldRow label="Work Phone" value={d.professional.workPhone} {...metaFor('workPhone')} />
              <FieldRow label="Professional Notes" value={d.professional.notes} {...metaFor('notes')} />
            </dl>
          </Section>

          <Section index="06" title="Custom Information" defaultOpen={d.custom.fields.length > 0 || !!d.custom.internalNotes}>
            <dl>
              {d.custom.fields.map((f) => (
                <FieldRow key={f.id ?? f.label} label={f.label} value={f.type === 'secret' ? '••••••••' : f.value} copyValue={f.value} clearSeconds={f.type === 'secret' ? 15 : 30} />
              ))}
              {!d.custom.fields.length && <div className="py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-muted">No custom fields defined</div>}
            </dl>
            <div className="mt-3 border-t border-white/[0.05] pt-3">
              <FieldRow label="Personal Notes" value={d.custom.personalNotes} />
              <FieldRow label="Internal Notes" value={d.custom.internalNotes} />
            </div>
          </Section>
        </div>

        {/* RIGHT - attachments, notes, history */}
        <div className="space-y-3 xl:col-span-5">
          <Section index="07" title="Record Provenance" defaultOpen>
            <dl>
              <FieldRow label="Created By" value={`${d.audit.createdBy}  ·  ${formatTimestamp(d.audit.createdAt)}`} copyValue={`${d.audit.createdBy} @ ${d.audit.createdAt}`} />
              <FieldRow label="Last Updated By" value={d.audit.updatedBy ? `${d.audit.updatedBy}  ·  ${formatTimestamp(d.audit.updatedAt)}` : formatTimestamp(d.audit.updatedAt)} copyValue={`${d.audit.updatedBy ?? ' - '} @ ${d.audit.updatedAt}`} />
              {d.audit.archivedAt && <FieldRow label="Archived By" value={`${d.audit.archivedBy}  ·  ${formatTimestamp(d.audit.archivedAt)}`} />}
              {d.audit.deletedAt && <FieldRow label="Deleted By" value={`${d.audit.deletedBy}  ·  ${formatTimestamp(d.audit.deletedAt)}`} />}
              <FieldRow label="Views" value={`${d.audit.viewCount} · last viewed ${d.audit.lastViewedAt ? relativeTime(d.audit.lastViewedAt) : 'never'}`} />
              <FieldRow label="Record Version" value={`v${d.audit.version}`} />
            </dl>
            {d.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.05] pt-3">
                {d.tags.map((t) => (
                  <span key={t.id} className="chip" style={{ borderColor: `${t.color}55`, color: t.color }}>{t.name}</span>
                ))}
              </div>
            )}
            {d.basic.notes && (
              <div className="mt-3 border-t border-white/[0.05] pt-3">
                <div className="micro-label mb-1 flex items-center gap-1.5"><StickyNote size={9} /> Notes</div>
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-vault-text2">{d.basic.notes}</p>
                <CopyButton value={d.basic.notes} className="mt-1" />
              </div>
            )}
          </Section>

          <Section
            index="08"
            title="Attachments & Media"
            actions={!isReadOnly && (
              <>
                <button className="vault-btn !px-2 !py-1.5" title="Add attachment" onClick={() => attachmentInput.current?.click()}>
                  <Paperclip size={11} /><span className="hidden sm:inline">File</span>
                </button>
                <button className="vault-btn !px-2 !py-1.5" title="Add image" onClick={() => imageInput.current?.click()}>
                  <ImageIcon size={11} /><span className="hidden sm:inline">Image</span>
                </button>
              </>
            )}
          >
            <input ref={attachmentInput} type="file" className="hidden" onChange={(e) => void onAttachment(e, 'attachment')} />
            <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onAttachment(e, 'gallery-image')} />
            {d.images.length > 0 && (
              <div className="mb-3 grid grid-cols-4 gap-2">
                {d.images.map((img) => (
                  <button key={img.id} className="group relative overflow-hidden border border-white/[0.08]" onClick={() => setLightbox(img.dataUrl)} title={img.name}>
                    <img src={img.dataUrl} alt={img.name} className="h-20 w-full object-cover transition-transform duration-300 group-hover:scale-110" />
                    {!isReadOnly && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Remove image"
                        className="absolute right-1 top-1 hidden rounded-sm bg-black/70 p-1 text-vault-red group-hover:block"
                        onClick={(e) => {
                          e.stopPropagation()
                          void call(zeus.profiles.removeGalleryImage(img.id)).then(() => reload())
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void call(zeus.profiles.removeGalleryImage(img.id)).then(() => reload()) } }}
                      >
                        <Trash2 size={11} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {d.attachments.length === 0 && d.images.length === 0 && (
              <div className="flex flex-col items-center gap-2 border border-dashed border-white/[0.1] px-4 py-6 text-center">
                <Upload size={16} className="text-vault-muted" strokeWidth={1.5} />
                <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-vault-muted">No attachments on file</div>
              </div>
            )}
            <div className="space-y-1">
              {d.attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-2 border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
                  <FileText size={13} className="shrink-0 text-vault-text2" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10.5px] text-vault-text">{a.name}</div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-vault-muted">{bytes(a.size)} · {a.uploadedBy}</div>
                  </div>
                  <a href={a.dataUrl} download={a.name} className="text-vault-muted transition-colors hover:text-vault-text" aria-label="Download"><Download size={13} /></a>
                  {!isReadOnly && (
                    <button className="text-vault-muted transition-colors hover:text-vault-red" onClick={() => void call(zeus.profiles.removeAttachment(a.id)).then(() => reload())} aria-label="Remove attachment">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section index="09" title="Record History" hint="Field-level, append-only" defaultOpen>
            <div className="mb-3 flex border border-white/10">
              {(['history', 'audit'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`flex-1 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.22em] transition-colors ${tab === t ? 'bg-vault-red/90 text-[#0D0507]' : 'text-vault-text2 hover:text-vault-text'}`}>
                  {t === 'history' ? 'Field Changes' : 'Audit Trail'}
                </button>
              ))}
            </div>
            {tab === 'history' && (
              <div className="max-h-96 space-y-1 overflow-y-auto vault-scroll">
                {(history ?? []).slice(0, 60).map((h) => (
                  <div key={h.id} className="border-l-2 border-white/[0.07] py-1.5 pl-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-vault-amber/90">{h.fieldLabel}</span>
                      <span className="font-mono text-[8px] text-vault-muted">{formatTimestamp(h.createdAt, 'military')}</span>
                    </div>
                    <div className="mt-1 font-mono text-[8.5px] leading-snug">
                      <span className="text-vault-red/80">− {truncate(h.oldValue)}</span>
                      <br />
                      <span className="text-vault-green/90">+ {truncate(h.newValue)}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.2em] text-vault-muted">by {h.actorUsername} · {h.action}</div>
                  </div>
                ))}
                {history && history.length === 0 && <div className="py-4 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-vault-muted">No field changes recorded</div>}
              </div>
            )}
            {tab === 'audit' && (
              <div className="max-h-96 space-y-0 overflow-y-auto vault-scroll">
                {(auditTrail ?? []).slice(0, 60).map((a) => (
                  <div key={a.id} className="border-b border-white/[0.05] py-1.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-vault-text2">{a.eventType.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-[8px] text-vault-muted">{relativeTime(a.createdAt)}</span>
                    </div>
                    {a.detail && <div className="mt-0.5 truncate text-[10.5px] text-vault-text2" title={a.detail}>{a.detail}</div>}
                    <div className="font-mono text-[7.5px] uppercase tracking-[0.18em] text-vault-muted">{a.actorUsername} · {formatTimestamp(a.createdAt, 'military')}</div>
                  </div>
                ))}
                {auditTrail && auditTrail.length === 0 && <div className="py-4 text-center font-mono text-[9px] uppercase tracking-[0.3em] text-vault-muted">No audit events for this record</div>}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Lightbox for gallery images */}
      <Modal open={!!lightbox} onClose={() => setLightbox(null)} title="Attachment Preview" width="max-w-3xl">
        {lightbox && <img src={lightbox} alt="attachment" className="max-h-[70vh] w-full object-contain" />}
      </Modal>

      <ConfirmModal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={d.status === 'archived' ? 'Restore profile' : 'Archive profile'}
        message={d.status === 'archived' ? `${d.profileCode} will return to the active archive. This action is logged.` : `${d.profileCode} will be moved to the archive. It remains searchable and restorable. This action is logged.`}
        confirmLabel={d.status === 'archived' ? 'Restore' : 'Archive'}
        danger={false}
        onConfirm={doArchive}
      />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete profile"
        message={`${d.basic.fullName} (${d.profileCode}) will be soft-deleted. The record and its audit trail remain in the database and can be restored only by a database administrator from backup. This action is logged.`}
        confirmLabel="Delete profile"
        onConfirm={doDelete}
      />
    </div>
  )
}

function truncate(v: string | null): string {
  if (!v) return ' - '
  return v.length > 140 ? `${v.slice(0, 140)}…` : v
}
