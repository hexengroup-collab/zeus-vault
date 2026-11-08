import { Feather, Globe, ShieldCheck } from 'lucide-react'

export function About() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="micro-label">About</div>
      <h1 className="mt-1 font-condensed text-4xl font-bold leading-none tracking-tight text-vault-text">ABOUT</h1>

      <div className="mt-6 vault-panel p-6">
        <h2 className="font-condensed text-2xl font-semibold tracking-wide text-vault-text">What is Zeus Vault?</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-vault-text2">
          Zeus Vault is a private, encrypted desktop intelligence archive. Every profile is a structured dossier: searchable,
          filterable, copyable field by field, and protected by a wrapped master key, Argon2id credentials, and an
          append-only hash-chained audit ledger. It is built to be used offline, in your own hands, with no cloud dependency.
        </p>
      </div>

      <div className="mt-4 vault-panel p-6">
        <h2 className="font-condensed text-2xl font-semibold tracking-wide text-vault-text">Publisher</h2>
        <div className="mt-3">
          <Row icon={<Feather size={13} />} label="Company" value="Hexen" />
        </div>
        <div className="mt-3">
          <Row icon={<Globe size={13} />} label="Website" value="hexengroup.com" href="https://hexengroup.com" />
        </div>
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-[12px] leading-relaxed text-vault-text2">
          Hexen is a technology organization that builds focused tools for demanding users. Its work emphasizes local-first
          design, strong cryptography, and interfaces that treat every byte of user data as guarded. Zeus Vault is its
          encrypted profile intelligence system, carrying that same standard into desktop software.
        </p>
      </div>

      <div className="mt-4 vault-panel p-6">
        <h2 className="font-condensed text-2xl font-semibold tracking-wide text-vault-text">Why it is different</h2>
        <ul className="mt-3 space-y-1.5 text-[11.5px] leading-relaxed text-vault-text2">
          <li>Faces: on-device deep descriptors + 478-point biometrics, distance-verified verdicts, quality-aware precision, profiles and partial faces included.</li>
          <li>Five ways to find anything: text + NLP, semantic embeddings (TF-IDF), photographs (visual + QR), documents (OCR), and MCP tool access.</li>
          <li>Offline-first by design: every model ships inside the app. No cloud, no accounts, no telemetry — ever.</li>
        </ul>
      </div>

      <div className="mt-4 vault-panel flex items-start gap-3 p-6">
        <ShieldCheck size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-vault-green" />
        <p className="text-[11.5px] leading-relaxed text-vault-text2">
          Security model: the master key never rests beside the database. It is wrapped by your operating system's secure
          keychain, credentials are hashed with Argon2id, sensitive copyable values are AES-256-GCM encrypted, and every
          mutation writes a tamper-evident, hash-chained audit entry. For issues, contact the developer email above.
        </p>
      </div>

      <p className="mt-5 text-center font-mono text-[8.5px] uppercase tracking-[0.3em] text-vault-muted">
        Zeus Vault · Built and maintained by Hexen
      </p>
    </div>
  )
}

function Row({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const content = href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-vault-red hover:underline">{value}</a>
  ) : (
    <span className="text-vault-text">{value}</span>
  )
  return (
    <div className="flex items-center gap-3">
      <span className="text-vault-text2">{icon}</span>
      <span className="micro-label w-32 shrink-0">{label}</span>
      {content}
    </div>
  )
}
