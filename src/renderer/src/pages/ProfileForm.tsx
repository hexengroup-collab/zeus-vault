import { DragEvent, FormEvent, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { call, zeus, ApiFailure } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { Section } from '@/components/Section'
import { toastError, toastOk, toastInfo } from '@/stores/toast'
import { GENDERS, LANGUAGES, PROFILE_STATUSES, ACCOUNT_STATUSES, TIMEZONES } from '@shared/constants'
import { COUNTRIES } from '@shared/countries'
import type { ProfileInput, ProfileDetail, CustomField } from '@shared/types'
import { passwordStrength, generatePasswordLocal, ageFromDob } from '@/lib/format'
import { fileToDataUrl } from '@/lib/images'

const emptyInput = (): ProfileInput => ({
  basic: {
    fullName: '', username: '', dob: '', gender: '', nationality: '', country: '', countryIso2: '',
    state: '', city: '', preferredLanguage: '', timezone: 'UTC', profileStatus: 'Active', categoryId: null, tags: [], notes: '',
  },
  contact: {
    primaryPhone: '', secondaryPhone: '', phoneCountryCode: '', primaryEmail: '', secondaryEmail: '', altEmail: '',
    website: '', contactPreference: 'Email', socialLinks: [],
  },
  address: { street: '', apartment: '', city: '', state: '', postalCode: '', country: '', countryCode: '' },
  account: {
    loginUsername: '', loginEmail: '', password: '', clearPassword: false, accountProvider: '', accountCreatedAt: '',
    lastLogin: '', status: 'Active', recoveryInfo: '', notes: '',
  },
  professional: { occupation: '', jobTitle: '', company: '', industry: '', website: '', workEmail: '', workPhone: '', notes: '' },
  custom: { fields: [], personalNotes: '', internalNotes: '', personalTags: [] },
})

function fromDetail(d: ProfileDetail): ProfileInput {
  return {
    basic: {
      fullName: d.basic.fullName, username: d.basic.username, dob: d.basic.dob, gender: d.basic.gender,
      nationality: d.basic.nationality, country: d.basic.country, countryIso2: d.basic.countryIso2,
      state: d.basic.state, city: d.basic.city, preferredLanguage: d.basic.preferredLanguage, timezone: d.basic.timezone || 'UTC',
      profileStatus: d.basic.profileStatus || 'Active', categoryId: d.basic.categoryId || null,
      tags: d.tags.map((t) => t.name), notes: d.basic.notes,
    },
    contact: { ...d.contact, socialLinks: d.contact.socialLinks.map((s) => ({ ...s })) },
    address: { ...d.address },
    account: {
      loginUsername: d.account.loginUsername, loginEmail: d.account.loginEmail, password: '', clearPassword: false,
      accountProvider: d.account.accountProvider, accountCreatedAt: d.account.accountCreatedAt, lastLogin: d.account.lastLogin,
      status: d.account.status || 'Active', recoveryInfo: '', notes: d.account.notes,
    },
    professional: { ...d.professional },
    custom: {
      fields: d.custom.fields.map((f) => ({ ...f })),
      personalNotes: d.custom.personalNotes,
      internalNotes: d.custom.internalNotes,
      personalTags: [...d.custom.personalTags],
    },
  }
}

export function ProfileForm({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [input, setInput] = useState<ProfileInput>(emptyInput)
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined) // undefined = untouched
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ field: string; message: string }[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [nlpText, setNlpText] = useState('')
  const [nlpBusy, setNlpBusy] = useState(false)
  const [nlpResult, setNlpResult] = useState<Awaited<ReturnType<typeof extract>> | null>(null)
  const [nlpWarnings, setNlpWarnings] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const { data: categories } = useAsync(() => call(zeus.categories.list()), [])

  useAsync(async () => {
    if (mode === 'edit' && id) {
      const d = await call(zeus.profiles.get(id))
      setInput(fromDetail(d))
      setAvatar(d.avatar)
    }
    return null
  }, [mode, id])

  const age = ageFromDob(input.basic.dob)
  const setBasic = (patch: Partial<ProfileInput['basic']>) => setInput((s) => ({ ...s, basic: { ...s.basic, ...patch } }))
  const setContact = (patch: Partial<ProfileInput['contact']>) => setInput((s) => ({ ...s, contact: { ...s.contact, ...patch } }))
  const setAddress = (patch: Partial<ProfileInput['address']>) => setInput((s) => ({ ...s, address: { ...s.address, ...patch } }))
  const setAccount = (patch: Partial<ProfileInput['account']>) => setInput((s) => ({ ...s, account: { ...s.account, ...patch } }))
  const setProfessional = (patch: Partial<ProfileInput['professional']>) => setInput((s) => ({ ...s, professional: { ...s.professional, ...patch } }))
  const setCustom = (patch: Partial<ProfileInput['custom']>) => setInput((s) => ({ ...s, custom: { ...s.custom, ...patch } }))

  const onCountrySelect = (iso2: string) => {
    const c = COUNTRIES.find((x) => x.iso2 === iso2)
    if (!c) {
      setBasic({ country: '', countryIso2: '' })
      return
    }
    setBasic({ country: c.name, countryIso2: c.iso2, nationality: input.basic.nationality || c.name })
    setAddress({ country: c.name, countryCode: c.dial.replace('+', '') })
    if (!input.contact.primaryPhone.trim() || /^\+\d{1,3}[\s-]?$/.test(input.contact.primaryPhone.trim())) {
      setContact({ phoneCountryCode: c.dial })
    }
  }

  const onAvatarFile = async (file: File) => {
    try {
      if (!/image\/(jpeg|png|webp)/.test(file.type)) throw new Error('Only JPG, PNG and WebP are supported.')
      const dataUrl = await fileToDataUrl(file, 256, 0.85)
      setAvatar(dataUrl)
    } catch (e) {
      toastError('Image rejected', e instanceof Error ? e.message : undefined)
    }
  }
  const onAvatarDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void onAvatarFile(file)
  }

  // ---------------- NLP assist ----------------
  const extract = () => call(zeus.nlp.extract(nlpText))
  const runNlp = async () => {
    if (!nlpText.trim()) return
    setNlpBusy(true)
    setNlpWarnings([])
    try {
      const result = await extract()
      setNlpResult(result)
      setNlpWarnings(result.warnings)
    } catch (e) {
      toastError('Extraction failed', e instanceof Error ? e.message : undefined)
    } finally {
      setNlpBusy(false)
    }
  }
  const applyNlp = () => {
    if (!nlpResult) return
    const v = nlpResult.values
    setInput((prev) => {
      const next: ProfileInput = JSON.parse(JSON.stringify(prev))
      const assign = (obj: Record<string, string>, key: string, field: string) => {
        const value = v[key]
        if (value) obj[field] = value
      }
      assign(next.basic as never, 'fullName', 'fullName')
      assign(next.basic as never, 'username', 'username')
      assign(next.basic as never, 'dob', 'dob')
      assign(next.basic as never, 'gender', 'gender')
      assign(next.basic as never, 'nationality', 'nationality')
      assign(next.basic as never, 'country', 'country')
      assign(next.basic as never, 'countryIso2', 'countryIso2')
      assign(next.basic as never, 'state', 'state')
      assign(next.basic as never, 'city', 'city')
      assign(next.basic as never, 'preferredLanguage', 'preferredLanguage')
      assign(next.basic as never, 'timezone', 'timezone')
      assign(next.basic as never, 'profileStatus', 'profileStatus')
      assign(next.basic as never, 'notes', 'notes')
      assign(next.contact as never, 'primaryEmail', 'primaryEmail')
      assign(next.contact as never, 'secondaryEmail', 'secondaryEmail')
      assign(next.contact as never, 'primaryPhone', 'primaryPhone')
      assign(next.contact as never, 'secondaryPhone', 'secondaryPhone')
      assign(next.contact as never, 'phoneCountryCode', 'phoneCountryCode')
      assign(next.contact as never, 'website', 'website')
      assign(next.contact as never, 'contactPreference', 'contactPreference')
      assign(next.address as never, 'street', 'street')
      assign(next.address as never, 'apartment', 'apartment')
      assign(next.address as never, 'postalCode', 'postalCode')
      assign(next.address as never, 'city', 'city')
      assign(next.address as never, 'state', 'state')
      assign(next.address as never, 'country', 'country')
      assign(next.address as never, 'countryCode', 'countryCode')
      assign(next.professional as never, 'occupation', 'occupation')
      assign(next.professional as never, 'jobTitle', 'jobTitle')
      assign(next.professional as never, 'company', 'company')
      assign(next.professional as never, 'industry', 'industry')
      assign(next.professional as never, 'website', 'website')
      assign(next.account as never, 'loginUsername', 'loginUsername')
      assign(next.account as never, 'loginEmail', 'loginEmail')
      assign(next.account as never, 'password', 'password')
      assign(next.account as never, 'accountProvider', 'accountProvider')
      if (v.tags) next.basic.tags = v.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 30)
      if (v.age && !v.dob) {
        const estimated = new Date().getUTCFullYear() - Number(v.age)
        next.basic.dob = `${estimated}-07-01`
        setNlpWarnings((w) => [...w, `Date of birth estimated as ${estimated}-07-01 from stated age ${v.age}. Verify before saving.`])
      }
      if (v.category && categories) {
        const match = categories.find((c) => c.name.toLowerCase() === v.category.toLowerCase())
        if (match) next.basic.categoryId = match.id
        else setNlpWarnings((w) => [...w, `Category “${v.category}” was not found - set it manually.`])
      }
      return next
    })
    toastInfo('Fields applied to form', 'Review uncertain matches before saving.')
  }

  const captureGeom = async (dataUrl: string | null | undefined, profileId: string) => {
    if (!dataUrl) return
    try {
      const { captureGeometry } = await import('@/lib/facefinder')
      const geom = await captureGeometry(dataUrl)
      if (geom) await call(zeus.photos.saveGeom({ profileId, geom, kind: 'avatar' }))
    } catch {
      /* geometry capture is optional */
    }
  }

  // ---------------- save ----------------
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (saving) return
    setSaving(true)
    setFieldErrors([])
    try {
      if (mode === 'create') {
        const created = await call(zeus.profiles.create(input))
        if (avatar) await call(zeus.profiles.setAvatar({ id: created.id, dataUrl: avatar }))
        void captureGeom(avatar, created.id)
        toastOk('Dossier created', created.profileCode)
        navigate(`/profiles/${created.id}`)
      } else if (id) {
        const result = await call(zeus.profiles.update({ id, input }))
        if (avatar !== undefined) {
          await call(zeus.profiles.setAvatar({ id, dataUrl: avatar }))
          void captureGeom(avatar, id)
        }
        toastOk('Dossier updated', `${result.changes} field(s) changed`)
        navigate(`/profiles/${id}`)
      }
    } catch (err) {
      if (err instanceof ApiFailure) {
        setFieldErrors(err.fields ?? [])
        toastError('Validation failed', err.message)
      } else {
        toastError('Save failed', err instanceof Error ? err.message : undefined)
      }
    } finally {
      setSaving(false)
    }
  }

  const errFor = (field: string) => fieldErrors.find((f) => f.field === field)?.message
  const strength = passwordStrength(input.account.password)
  const errBanner = fieldErrors.length > 0 && (
    <div role="alert" className="mb-3 border border-vault-red/40 bg-vault-red/[0.08] px-3 py-2">
      <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-vault-red"><AlertTriangle size={11} /> {fieldErrors.length} field(s) need attention</div>
      <ul className="mt-1 list-inside list-disc font-mono text-[9.5px] text-vault-red/90">
        {fieldErrors.map((f) => <li key={f.field}>{f.message}</li>)}
      </ul>
    </div>
  )

  return (
    <form onSubmit={submit} className="vault-scroll min-h-full pb-24">
      {/* NLP command bar */}
      {mode === 'create' && (
        <div className="border-b border-vault-border-soft bg-vault-red/[0.035] px-6 py-4">
          <div className="flex items-center gap-2">
            <Wand2 size={14} className="text-vault-red" />
            <label htmlFor="nlp-command" className="micro-label !text-vault-red/90">NLP Field Extraction</label>
            <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.25em] text-vault-muted">Deterministic · Offline · No data leaves this machine</span>
          </div>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row">
            <textarea
              id="nlp-command"
              className="vault-textarea h-16 flex-1 resize-none px-3 py-2 font-mono text-[11px]"
              placeholder='Describe the dossier… e.g. "Create a profile for Ethan James Mitchell. He is 28 years old, lives in Austin Texas, United States. His username is ethan.mitchell27, email is ethan@example.com and his phone number is +1 202-555-0147."'
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
            />
            <div className="flex shrink-0 flex-col gap-2">
              <button type="button" className="vault-btn vault-btn-primary !h-8" onClick={() => void runNlp()} disabled={nlpBusy || !nlpText.trim()}>
                <Sparkles size={12} /> {nlpBusy ? 'Extracting…' : 'Extract Fields'}
              </button>
              {nlpResult && (
                <button type="button" className="vault-btn !h-8" onClick={applyNlp}>
                  <Check size={12} /> Apply to Form
                </button>
              )}
            </div>
          </div>
          {nlpResult && (
            <div className="mt-3 border border-white/[0.08] bg-[#0D0F12] p-3">
              <div className="micro-label mb-2">Recognized fields - review before applying</div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
                {nlpResult.fields.map((f) => (
                  <div key={f.key} className="flex items-baseline gap-2 border-b border-white/[0.04] py-1">
                    <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${f.confidence === 'certain' ? 'bg-vault-green' : f.confidence === 'inferred' ? 'bg-vault-amber' : 'bg-vault-red'}`} title={f.confidence} />
                    <span className="micro-label !text-[8px]">{f.label}</span>
                    <span className="font-mono text-[7px] uppercase tracking-[0.15em] text-vault-muted">{f.category}</span>
                    <span className="min-w-0 flex-1 truncate text-right font-mono text-[9.5px] text-vault-text" title={f.value}>{f.value}</span>
                  </div>
                ))}
                {!nlpResult.fields.length && <div className="font-mono text-[9px] text-vault-muted">No fields recognized - try "Name is …", "Email: …", "Phone: …"</div>}
              </div>
              {nlpWarnings.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-vault-amber/20 pt-2">
                  {nlpWarnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 font-mono text-[9px] leading-snug text-vault-amber"><AlertTriangle size={10} className="mt-0.5 shrink-0" />{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mx-auto max-w-6xl p-4 md:p-6">
        {errBanner}
        <div className="flex flex-col gap-4 xl:flex-row">
          {/* LEFT column - sections 01-03 */}
          <div className="flex-1 space-y-3">
            <Section index="01" title="Basic Information">
              <div className="flex flex-col gap-4 sm:flex-row">
                {/* Photo */}
                <div className="shrink-0">
                  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onAvatarFile(f); e.target.value = '' }} />
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onAvatarDrop}
                    className={`flex h-32 w-32 flex-col items-center justify-center gap-1.5 border border-dashed transition-colors ${dragOver ? 'border-vault-red bg-vault-red/[0.08]' : 'border-white/[0.15] bg-white/[0.02] hover:border-white/25'}`}
                  >
                    {avatar ? (
                      <img src={avatar} alt="Profile photograph" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <>
                        <ImageIcon size={20} strokeWidth={1.25} className="text-vault-muted" />
                        <span className="px-2 text-center font-mono text-[8px] uppercase leading-snug tracking-[0.18em] text-vault-muted">Drop photo<br />or click to upload</span>
                      </>
                    )}
                  </button>
                  {avatar && (
                    <button type="button" className="mt-1.5 w-32 text-center font-mono text-[8px] uppercase tracking-[0.2em] text-vault-muted hover:text-vault-red" onClick={() => setAvatar(null)}>
                      Remove photo
                    </button>
                  )}
                  <div className="mt-1.5 text-center font-mono text-[7.5px] uppercase tracking-[0.2em] text-vault-muted">JPG · PNG · WebP · 2 MB</div>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Full Name *" error={errFor('fullName')} className="sm:col-span-2">
                    <input className={inputClass(!!errFor('fullName'))} value={input.basic.fullName} onChange={(e) => setBasic({ fullName: e.target.value })} placeholder="Ethan James Mitchell" />
                  </Field>
                  <Field label="Username">
                    <input className={inputClass(false) + ' font-mono'} value={input.basic.username} onChange={(e) => setBasic({ username: e.target.value })} placeholder="ethan.mitchell27" />
                  </Field>
                  <Field label="Date of Birth" error={errFor('dob')}>
                    <div className="flex items-center gap-2">
                      <input type="date" className={inputClass(!!errFor('dob'))} value={input.basic.dob} onChange={(e) => setBasic({ dob: e.target.value })} />
                      {age !== null && <span className="chip shrink-0 !border-vault-amber/40 !text-vault-amber">AGE {age}</span>}
                    </div>
                  </Field>
                  <Field label="Gender">
                    <select className={inputClass(false)} value={input.basic.gender} onChange={(e) => setBasic({ gender: e.target.value })}>
                      <option value=""> - </option>
                      {GENDERS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </Field>
                  <Field label="Nationality">
                    <input className={inputClass(false)} value={input.basic.nationality} onChange={(e) => setBasic({ nationality: e.target.value })} placeholder="American" />
                  </Field>
                  <Field label="Country" className="sm:col-span-2">
                    <select className={inputClass(false)} value={input.basic.countryIso2} onChange={(e) => onCountrySelect(e.target.value)}>
                      <option value="">Select country…</option>
                      {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name} ({c.dial})</option>)}
                    </select>
                  </Field>
                  <Field label="State / Province">
                    <input className={inputClass(false)} value={input.basic.state} onChange={(e) => setBasic({ state: e.target.value })} placeholder="Texas" />
                  </Field>
                  <Field label="City">
                    <input className={inputClass(false)} value={input.basic.city} onChange={(e) => setBasic({ city: e.target.value })} placeholder="Austin" />
                  </Field>
                  <Field label="Preferred Language">
                    <select className={inputClass(false)} value={input.basic.preferredLanguage} onChange={(e) => setBasic({ preferredLanguage: e.target.value })}>
                      <option value=""> - </option>
                      {LANGUAGES.map((l) => <option key={l.code} value={l.name}>{l.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Timezone">
                    <select className={inputClass(false)} value={input.basic.timezone} onChange={(e) => setBasic({ timezone: e.target.value })}>
                      {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Profile Status">
                    <select className={inputClass(false)} value={input.basic.profileStatus} onChange={(e) => setBasic({ profileStatus: e.target.value })}>
                      {PROFILE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Category">
                    <select className={inputClass(false)} value={input.basic.categoryId ?? ''} onChange={(e) => setBasic({ categoryId: e.target.value || null })}>
                      <option value="">Uncategorized</option>
                      {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Tags (comma-separated)" className="sm:col-span-2">
                    <input className={inputClass(false) + ' font-mono'} value={input.basic.tags.join(', ')} onChange={(e) => setBasic({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="priority, q4, retainer" />
                  </Field>
                  <Field label="Notes" className="sm:col-span-2">
                    <textarea className={inputClass(false) + ' h-16 w-full resize-none px-2.5 py-2'} value={input.basic.notes} onChange={(e) => setBasic({ notes: e.target.value })} placeholder="Handler observations…" />
                  </Field>
                </div>
              </div>
            </Section>

            <Section index="02" title="Contact Information">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Phone Country Code">
                  <input className={inputClass(false) + ' font-mono'} value={input.contact.phoneCountryCode} onChange={(e) => setContact({ phoneCountryCode: e.target.value })} placeholder="+1" />
                </Field>
                <Field label="Primary Phone" error={errFor('primaryPhone')}>
                  <input className={inputClass(!!errFor('primaryPhone')) + ' font-mono'} value={input.contact.primaryPhone} onChange={(e) => setContact({ primaryPhone: e.target.value })} placeholder="+1 202-555-0147" />
                </Field>
                <Field label="Secondary Phone" error={errFor('secondaryPhone')}>
                  <input className={inputClass(!!errFor('secondaryPhone')) + ' font-mono'} value={input.contact.secondaryPhone} onChange={(e) => setContact({ secondaryPhone: e.target.value })} placeholder="+1 202-555-0188" />
                </Field>
                <Field label="Contact Preference">
                  <input className={inputClass(false)} value={input.contact.contactPreference} onChange={(e) => setContact({ contactPreference: e.target.value })} placeholder="Email · Phone · Secure channel" />
                </Field>
                <Field label="Primary Email" error={errFor('primaryEmail')}>
                  <input className={inputClass(!!errFor('primaryEmail')) + ' font-mono'} value={input.contact.primaryEmail} onChange={(e) => setContact({ primaryEmail: e.target.value })} placeholder="name@example.com" />
                </Field>
                <Field label="Secondary Email" error={errFor('secondaryEmail')}>
                  <input className={inputClass(!!errFor('secondaryEmail')) + ' font-mono'} value={input.contact.secondaryEmail} onChange={(e) => setContact({ secondaryEmail: e.target.value })} placeholder="alt@example.com" />
                </Field>
                <Field label="Alternative Email" error={errFor('altEmail')}>
                  <input className={inputClass(!!errFor('altEmail')) + ' font-mono'} value={input.contact.altEmail} onChange={(e) => setContact({ altEmail: e.target.value })} placeholder="backup@example.com" />
                </Field>
                <Field label="Website">
                  <input className={inputClass(false) + ' font-mono'} value={input.contact.website} onChange={(e) => setContact({ website: e.target.value })} placeholder="https://…" />
                </Field>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="micro-label">Social Channels</span>
                  <button type="button" className="vault-btn vault-btn-ghost !px-1.5 !py-1" onClick={() => setContact({ socialLinks: [...input.contact.socialLinks, { id: crypto.randomUUID(), label: '', url: '' }] })}>
                    <Plus size={11} /> Add
                  </button>
                </div>
                {input.contact.socialLinks.map((s, i) => (
                  <div key={s.id ?? i} className="mb-1.5 flex items-center gap-2">
                    <input className="vault-input h-8 w-32 px-2 text-[10px]" placeholder="Platform" value={s.label} onChange={(e) => setContact({ socialLinks: input.contact.socialLinks.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                    <input className="vault-input h-8 flex-1 px-2 font-mono text-[10px]" placeholder="https://…" value={s.url} onChange={(e) => setContact({ socialLinks: input.contact.socialLinks.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} />
                    <button type="button" className="text-vault-muted hover:text-vault-red" onClick={() => setContact({ socialLinks: input.contact.socialLinks.filter((_, j) => j !== i) })} aria-label="Remove link"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </Section>

            <Section index="03" title="Address Information">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Street Address" className="sm:col-span-2">
                  <input className={inputClass(false)} value={input.address.street} onChange={(e) => setAddress({ street: e.target.value })} placeholder="482 Meridian Avenue" />
                </Field>
                <Field label="Apartment / Suite">
                  <input className={inputClass(false)} value={input.address.apartment} onChange={(e) => setAddress({ apartment: e.target.value })} placeholder="Suite 900" />
                </Field>
                <Field label="City">
                  <input className={inputClass(false)} value={input.address.city} onChange={(e) => setAddress({ city: e.target.value })} placeholder="Austin" />
                </Field>
                <Field label="State">
                  <input className={inputClass(false)} value={input.address.state} onChange={(e) => setAddress({ state: e.target.value })} placeholder="TX" />
                </Field>
                <Field label="ZIP / Postal Code">
                  <input className={inputClass(false) + ' font-mono'} value={input.address.postalCode} onChange={(e) => setAddress({ postalCode: e.target.value })} placeholder="78701" />
                </Field>
                <Field label="Country">
                  <select className={inputClass(false)} value={COUNTRIES.find((c) => c.name === input.address.country)?.iso2 ?? ''} onChange={(e) => { const c = COUNTRIES.find((x) => x.iso2 === e.target.value); setAddress({ country: c?.name ?? '', countryCode: c?.dial.replace('+', '') ?? '' }) }}>
                    <option value="">Select…</option>
                    {COUNTRIES.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Country Code">
                  <input className={inputClass(false) + ' font-mono'} value={input.address.countryCode} onChange={(e) => setAddress({ countryCode: e.target.value })} placeholder="1" />
                </Field>
              </div>
            </Section>
          </div>

          {/* RIGHT column - sections 04-06 */}
          <div className="flex-1 space-y-3">
            <Section index="04" title="Account Information" hint="AES-256-GCM at rest">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Login Username">
                  <input className={inputClass(false) + ' font-mono'} value={input.account.loginUsername} onChange={(e) => setAccount({ loginUsername: e.target.value })} />
                </Field>
                <Field label="Login Email" error={errFor('loginEmail')}>
                  <input className={inputClass(!!errFor('loginEmail')) + ' font-mono'} value={input.account.loginEmail} onChange={(e) => setAccount({ loginEmail: e.target.value })} />
                </Field>
                <Field label="Account Password" className="sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showPw ? 'text' : 'password'}
                        autoComplete="new-password"
                        className={inputClass(false) + ' w-full pr-9 font-mono'}
                        value={input.account.password}
                        onChange={(e) => setAccount({ password: e.target.value, clearPassword: false })}
                        placeholder={mode === 'edit' ? 'Leave blank to keep current' : 'Generate or enter…'}
                      />
                      <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vault-muted hover:text-vault-text" aria-label="Toggle visibility">
                        {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <button type="button" className="vault-btn !px-2" title="Generate password" onClick={() => setAccount({ password: generatePasswordLocal(20), clearPassword: false })}>
                      <KeyRound size={12} />
                    </button>
                  </div>
                  {input.account.password && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex h-1 flex-1 gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div key={i} className={`h-full flex-1 rounded-full transition-colors ${i < strength.score + 1 ? strength.score < 2 ? 'bg-vault-red' : strength.score < 3 ? 'bg-vault-amber' : 'bg-vault-green' : 'bg-white/10'}`} />
                        ))}
                      </div>
                      <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-vault-text2">{strength.label} · {strength.entropy} bits</span>
                    </div>
                  )}
                  {mode === 'edit' && (
                    <label className="mt-1.5 flex cursor-pointer items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.18em] text-vault-muted">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-[#E34B64]" checked={input.account.clearPassword} onChange={(e) => setAccount({ clearPassword: e.target.checked, password: '' })} />
                      Clear stored password
                    </label>
                  )}
                </Field>
                <Field label="Account Provider">
                  <input className={inputClass(false)} value={input.account.accountProvider} onChange={(e) => setAccount({ accountProvider: e.target.value })} placeholder="ExampleID · OAuth · SAML" />
                </Field>
                <Field label="Account Status">
                  <select className={inputClass(false)} value={input.account.status} onChange={(e) => setAccount({ status: e.target.value })}>
                    {ACCOUNT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Account Creation Date">
                  <input type="date" className={inputClass(false)} value={input.account.accountCreatedAt} onChange={(e) => setAccount({ accountCreatedAt: e.target.value })} />
                </Field>
                <Field label="Last Login">
                  <input type="date" className={inputClass(false)} value={input.account.lastLogin} onChange={(e) => setAccount({ lastLogin: e.target.value })} />
                </Field>
                <Field label="Recovery Information" className="sm:col-span-2">
                  <input className={inputClass(false) + ' font-mono'} value={input.account.recoveryInfo} onChange={(e) => setAccount({ recoveryInfo: e.target.value })} placeholder={mode === 'edit' ? 'Leave blank to keep current recovery info' : 'Backup codes, recovery email…'} />
                </Field>
                <Field label="Account Notes" className="sm:col-span-2">
                  <textarea className={inputClass(false) + ' h-14 w-full resize-none px-2.5 py-2'} value={input.account.notes} onChange={(e) => setAccount({ notes: e.target.value })} />
                </Field>
              </div>
            </Section>

            <Section index="05" title="Professional Information">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Occupation"><input className={inputClass(false)} value={input.professional.occupation} onChange={(e) => setProfessional({ occupation: e.target.value })} /></Field>
                <Field label="Job Title"><input className={inputClass(false)} value={input.professional.jobTitle} onChange={(e) => setProfessional({ jobTitle: e.target.value })} /></Field>
                <Field label="Company"><input className={inputClass(false)} value={input.professional.company} onChange={(e) => setProfessional({ company: e.target.value })} /></Field>
                <Field label="Industry"><input className={inputClass(false)} value={input.professional.industry} onChange={(e) => setProfessional({ industry: e.target.value })} placeholder="Technology · Finance · Logistics" /></Field>
                <Field label="Professional Website"><input className={inputClass(false) + ' font-mono'} value={input.professional.website} onChange={(e) => setProfessional({ website: e.target.value })} /></Field>
                <Field label="Work Email" error={errFor('workEmail')}><input className={inputClass(!!errFor('workEmail')) + ' font-mono'} value={input.professional.workEmail} onChange={(e) => setProfessional({ workEmail: e.target.value })} /></Field>
                <Field label="Work Phone" error={errFor('workPhone')}><input className={inputClass(!!errFor('workPhone')) + ' font-mono'} value={input.professional.workPhone} onChange={(e) => setProfessional({ workPhone: e.target.value })} /></Field>
                <Field label="Professional Notes" className="sm:col-span-2"><textarea className={inputClass(false) + ' h-14 w-full resize-none px-2.5 py-2'} value={input.professional.notes} onChange={(e) => setProfessional({ notes: e.target.value })} /></Field>
              </div>
            </Section>

            <Section index="06" title="Custom Fields & Notes" actions={
              <button type="button" className="vault-btn !px-2 !py-1.5" onClick={() => setCustom({ fields: [...input.custom.fields, { label: '', value: '', type: 'text' }] })}>
                <Plus size={11} /><span className="hidden sm:inline">Field</span>
              </button>
            }>
              {input.custom.fields.length > 0 && (
                <div className="mb-2 space-y-2">
                  {input.custom.fields.map((f, i) => (
                    <div key={f.id ?? i} className="flex items-center gap-1.5">
                      <input className="vault-input h-8 w-36 px-2 text-[10px]" placeholder="Field label" value={f.label} onChange={(e) => setCustom({ fields: input.custom.fields.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                      <input className="vault-input h-8 flex-1 px-2 font-mono text-[10px]" placeholder="Value" type={f.type === 'secret' ? 'password' : 'text'} value={f.value} onChange={(e) => setCustom({ fields: input.custom.fields.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                      <select className="vault-select h-8 w-24 px-1.5 text-[9px]" value={f.type} onChange={(e) => setCustom({ fields: input.custom.fields.map((x, j) => j === i ? { ...x, type: e.target.value as CustomField['type'] } : x) })}>
                        {['text', 'number', 'date', 'url', 'secret'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <button type="button" className="text-vault-muted hover:text-vault-red" onClick={() => setCustom({ fields: input.custom.fields.filter((_, j) => j !== i) })} aria-label="Remove field"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              <Field label="Personal Notes">
                <textarea className={inputClass(false) + ' h-16 w-full resize-none px-2.5 py-2'} value={input.custom.personalNotes} onChange={(e) => setCustom({ personalNotes: e.target.value })} />
              </Field>
              <Field label="Internal Notes" className="mt-2">
                <textarea className={inputClass(false) + ' h-16 w-full resize-none px-2.5 py-2'} value={input.custom.internalNotes} onChange={(e) => setCustom({ internalNotes: e.target.value })} placeholder="Handler-only. Never exported by default." />
              </Field>
            </Section>
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-[228px] right-0 z-20 border-t border-vault-border-soft bg-[#0C0E11]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <span className="hidden font-mono text-[8.5px] uppercase tracking-[0.25em] text-vault-muted md:inline">
            {mode === 'create' ? 'New dossier - unverified until saved' : `Editing ${id ? 'existing record' : ''}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="vault-btn vault-btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
            <button type="submit" disabled={saving} className="vault-btn vault-btn-primary h-10 !px-6">
              {saving ? 'Encrypting & saving…' : mode === 'create' ? 'Create Dossier' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

const inputClass = (error: boolean) =>
  `h-9 w-full rounded-[3px] border px-2.5 text-[12px] outline-none transition-shadow placeholder:text-vault-muted focus:border-vault-red/60 focus:shadow-[0_0_0_3px_rgba(227,75,100,0.12)] ${error ? 'border-vault-red/60 bg-vault-red/[0.05]' : 'border-white/10 bg-[#0D0F12]'} text-vault-text`

function Field({
  label,
  children,
  error,
  className,
}: {
  label: string
  children: React.ReactNode
  error?: string
  className?: string
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="micro-label mb-1 block">{label}</span>
      {children}
      {error && <span className="mt-1 block font-mono text-[8.5px] uppercase tracking-[0.14em] text-vault-red">{error}</span>}
    </label>
  )
}
