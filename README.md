<div align="center">

<img src="docs/assets/zeus-emblem.png" alt="Zeus Vault emblem" width="220" height="220" />

# ZEUS VAULT

### YOUR DATA. YOUR VAULT. YOUR CONTROL.

**Encrypted Desktop Intelligence Profile Management**

<div align="center">

[![Version](https://img.shields.io/badge/version-1.0.0-e34b64?style=for-the-badge)](.)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-critical?style=for-the-badge)](.)
[![Encryption](https://img.shields.io/badge/encryption-AES--256--GCM-d97757?style=for-the-badge)](#security-model)
[![Hashing](https://img.shields.io/badge/hashing-Argon2id-d97757?style=for-the-badge)](#security-model)
[![Keychain](https://img.shields.io/badge/keychain-OS--keychain-4F8A6B?style=for-the-badge)](#security-model)
[![Audit](https://img.shields.io/badge/audit-hash--chained-4F8A6B?style=for-the-badge)](#security-model)
[![Sessions](https://img.shields.io/badge/sessions-single--active--login-4F8A6B?style=for-the-badge)](#security-model)
[![Telemetry](https://img.shields.io/badge/telemetry-none-black?style=for-the-badge)](#security-model)
[![MCP](https://img.shields.io/badge/MCP-ready-d97757?style=for-the-badge)](#mcp-and-api-keys)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

</div>

A private encrypted dossier workstation for the desktop. Every profile is a structured record, every change is attributed, every field is copyable, and every paragraph of personal information is protected by machine-verified cryptography.

</div>

---

## Security Dashboard

| Icon | Component | Implementation | Verified by |
| --- | --- | --- | --- |
| <img src="docs/assets/encryption-lock.png" alt="Encryption" width="64" /> | AES-256-GCM encryption | Field-level authenticated encryption with per-value random IVs and domain-separated associated data | Security Center: encryption card |
| <img src="docs/assets/fingerprint-security.png" alt="Password hashing" width="64" /> | Argon2id password hashing | m=32MB, t=3, p=1, 32 byte output, never stored plaintext | Security Center, user management |
| <img src="docs/assets/identity-key.png" alt="OS secure keychain" width="64" /> | OS secure keychain | Master key wrapped by the platform credential store | Security Center: key protection row |
| <img src="docs/assets/secure-database.png" alt="Database binding" width="64" /> | Database binding | Key fingerprint must match the database, or the vault refuses to open | Opening a mismatched database |
| <img src="docs/assets/identity-key.png" alt="Session control" width="64" /> | Single active session | A newer login revokes the previous session instantly | My Account > Sessions |
| <img src="docs/assets/audit-ledger.png" alt="Hash-chained audit ledger" width="64" /> | Hash-chained audit ledger | Every event links to the previous entry hash; the chain is verified on demand | Security Center > Verify Audit Chain |
| <img src="docs/assets/offline-infrastructure.png" alt="Local-first storage" width="64" /> | Local-first storage | Offline SQLite database, exportable backups, no cloud account | Settings > Database |
| <img src="docs/assets/integrity-verification.png" alt="Integrity verification" width="64" /> | Integrity verification | PRAGMA quick_check, foreign key sweep, decrypt spot-check | Security Center > Run Integrity Check |
| <img src="docs/assets/mcp-network.png" alt="MCP agent access" width="64" /> | MCP agent access | Loopback-only MCP server with dashboard API keys | Settings > MCP Layer, Overview API Keys |
| <img src="docs/assets/security-shield.png" alt="Inactivity lock" width="64" /> | Inactivity lock | Vault seals after a configurable idle window; the seal survives refreshes | Lock the vault and reload the page |

**Design principles**

- Silence is the default. Anything sensitive is masked until you explicitly reveal it.
- Attribution is mandatory. You always see who created a record and who modified it last.
- The chain is evidence, not decoration. It can be re-verified with one click in Security Center.
- The app validates itself. If the audit chain or database integrity fails, the vault reports it loudly instead of pretending.

---

## Feature Highlights

| Icon | Feature | What it does |
| --- | --- | --- |
| <img src="docs/assets/security-shield.png" alt="Shield" width="48" /> | Encrypted Profile Management | Unlimited structured dossiers with single-field name, auto-generated `ZV-YYYY-NNNNNN` IDs, custom fields, tags, categories, and per-field history |
| <img src="docs/assets/mcp-network.png" alt="Network" width="48" /> | Natural Language Search | Type sentences like "people from Bangladesh who work in technology" and get a structured interpretation with filters, or plain keywords with fuzzy matching |
| <img src="docs/assets/fingerprint-security.png" alt="Fingerprint" width="48" /> | Deterministic NLP Extraction | Paste free text and get typed fields with semantic category and confidence, verified before saving |
| <img src="docs/assets/identity-key.png" alt="Key" width="48" /> | B2B Contact Intelligence | Separate business contact book with industry, website, type of work needed, primary contact, and status (Lead / Active / Dormant) |
| <img src="docs/assets/integrity-verification.png" alt="Verification" width="48" /> | Security Center | Envelope encryption fingerprints, integrity checks, audit chain verification, sessions, login ledger |
| <img src="docs/assets/audit-ledger.png" alt="Ledger" width="48" /> | Audit Trail | Append-only hash-chained ledger with per-field change history for every profile |
| <img src="docs/assets/mcp-network.png" alt="MCP" width="48" /> | MCP Server Integration | Loopback-only MCP server with bearer API keys and 22 tools over the same typed API |
| <img src="docs/assets/identity-key.png" alt="API keys" width="48" /> | API Key Management | Issue named keys from the dashboard, copy once at creation, track last use, revoke any time |
| <img src="docs/assets/secure-database.png" alt="Database" width="48" /> | Import and Export | CSV, JSON, XLSX import wizard with column mapping and duplicate detection; annotated exports plus encrypted backups |
| <img src="docs/assets/secure-database.png" alt="Database" width="48" /> | Backup and Restore | Encrypted or plain point-in-time snapshots with verification before restore |
| <img src="docs/assets/security-shield.png" alt="Roles" width="48" /> | Role-Based Access | Administrator, Standard, Read-Only roles, enforced server-side |
| <img src="docs/assets/encryption-lock.png" alt="Session lock" width="48" /> | Lock and Sessions | Persisted manual lock, single active session per user, 90-day trusted device sessions, inactivity vault sealing |

---

## Screen Showcase

<table>
<tr>
  <td width="50%">

![Login](docs/screenshots/login.jpg)

  </td>
  <td width="50%">

![Dashboard](docs/screenshots/overview.jpg)

  </td>
</tr>
<tr>
  <td>

![Profiles](docs/screenshots/profiles.jpg)

  </td>
  <td>

![Dossier](docs/screenshots/dossier.jpg)

  </td>
</tr>
<tr>
  <td>

![Natural language search](docs/screenshots/search.jpg)

  </td>
  <td>

![B2B Contacts](docs/screenshots/b2b.jpg)

  </td>
</tr>
<tr>
  <td>

![Activity logs](docs/screenshots/activity.jpg)

  </td>
  <td>

![User Management](docs/screenshots/users.jpg)

  </td>
</tr>
<tr>
  <td>

![Security Center](docs/screenshots/security.jpg)

  </td>
  <td>

![Import and Export](docs/screenshots/import.jpg)

  </td>
</tr>
<tr>
  <td>

![Backup and Restore](docs/screenshots/backups.jpg)

  </td>
  <td>

![Settings](docs/screenshots/settings.jpg)

  </td>
</tr>
</table>

All captures are real product screens at 1920x1080. Source files live in [docs/screenshots](docs/screenshots).

---

## Security Architecture

```mermaid
flowchart TD
    USER["User"] --> AUTH["User Authentication"]
    AUTH --> ARGON["Argon2id Password Hashing"]
    AUTH --> LOCK["Vault Lock"]
    LOCK --> KEY["OS Secure Keychain"]
    KEY --> MASTER["Wrapped Master Key"]
    MASTER --> AES["AES-256-GCM Field Encryption"]
    AES --> DB[("Encrypted SQLite Database")]
    DB --> AUDIT["Hash-Chained Audit Ledger"]
    AUDIT --> VERIFY["Integrity Verification"]
    VERIFY --> CMD["Command Deck"]
    CMD --> NLP["NLP Extraction and Search"]
    CMD --> MCP["MCP Server (loopback)"]
```

Each box maps to a real subsystem in `src/main`:

- `services/auth.ts`: Argon2id, login throttling, single active session, 90-day trusted device, vault lock and inactivity sealing.
- `services/keyring.ts`: AES-256-GCM wrapping of the master key with an OS keychain reference.
- `lib/crypto.ts`: AES-256-GCM field encryption, hashing, strength estimation, masked secrets.
- `services/audit.ts`: SHA-256 hash chain with an append-only guard trigger.
- `services/security.ts`: PRAGMA quick_check, foreign key sweep, encrypted field spot decryption.
- `mcp/server.ts`: MCP tools over the same typed services, bearer API key gated, loopback only.

---

## Installation and Developer Documentation

### Use the standalone installer

A packaged Windows (or Linux) build ships with the release artifacts: `release/ZeusVault-1.0.0-Setup.exe`.

1. Run the installer.
2. The wizard lets you change the installation directory (default: `%LOCALAPPDATA%\Programs\Zeus Vault`), choose Desktop and Start Menu shortcuts, then press Install.
3. It finishes and launches the app. Uninstalling from Windows removes the app and its local data (the vault, keys, exports, and backups for that user) by design: every fresh install starts from a clean encrypted vault.

### First launch and master account

On first launch the app opens the first-run setup instead of the login:

1. Review the security guarantees the vault will initialize with.
2. Create the **master administrator account** (full name, username, email, password). The password must be at least 12 characters and contain uppercase, a digit, and a symbol.
3. Optionally seed the clearly labeled fictional demonstration profiles.
4. Process ends at the **login screen**. Sign in with the credentials you just created.

Storage locations the app manages:

| Location | Purpose |
| --- | --- |
| `%APPDATA%/Zeus Vault/vault-data/vault.db` | Encrypted local database (profiles, B2B contacts, audit ledger) |
| `%APPDATA%/Zeus Vault/vault-data/vault.key` | Master key wrapped by the OS credential store |
| `%APPDATA%/Zeus Vault/zv-secrets.json` | Session and trusted-device secrets, encrypted with the vault field key |
| `%APPDATA%/Zeus Vault/vault-data/exports` | Exports written by the Export Center |
| `%APPDATA%/Zeus Vault/vault-data/backups` | Vault snapshots created in Backup and Restore |

### Development

Prerequisites: Node 20 or newer, npm, Git.

**Try it locally**

```powershell
git clone https://github.com/anomalyco/zeus-vault.git
cd zeus-vault
npm install
npm run dev
```

**Build and package**

```powershell
npm run build      # renderer + main production build
npm run dist       # NSIS installer into release/
npm test           # typecheck plus 16 unit tests (crypto, profile lifecycle, auth lockdown, NLP)
```

**Verify the application shell**

```powershell
npx tsc -b --noEmit
npx tsc -p tsconfig.node.json --noEmit
```

### Project structure

```
src/
  main/
    main.ts            Electron main process, frameless window, lock timer
    ipc.ts             typed IPC surface for every channel
    services/
      auth.ts          login, lock/unlock, sessions, trusted devices
      profiles.ts      profile CRUD, search, FTS index, field history
      b2b.ts           B2B companies contact book
      dashboard.ts     real aggregates for the command overview
      users.ts         admin user management
      categories.ts    custom profile categories
      search.ts        NL query translation and saved searches
      transfer.ts      CSV/JSON/XLSX import, exports, dossier PDFs
      backup.ts        encrypted/plain snapshots, restore, retention
      security.ts      integrity checks and security center data
      seed.ts          fictional demo seeding (optional first-run)
      keyring.ts       AES-256-GCM master key wrapping
      vault.ts         SQLite open, migrations, encrypted snapshot creation
      audit.ts         hash-chained append-only audit ledger
      secrets.ts       encrypted secrets store outside the database
      settings.ts      typed app settings
    nlp/
      engine.ts        deterministic field extraction with semantic categories
      query.ts         natural language query interpreter
    db/
      sqlite.ts        DatabaseSync wrapper with transactions and FTS probe
      schema.ts        versioned migrations
  preload/
    preload.ts         contextBridge surface (window.zeus)
  renderer/
    src/
      App.tsx          router, boot state machine (splash/setup/lock/app)
      pages/           all twenty-one screens (Overview ... About)
      components/      Sidebar, TopBar, TitleBar, ProfileTable, Modal, FieldRow
      stores/          session and toast stores (Zustand)
      lib/             clipboard, images, format helpers, useAsync
  shared/
    api.ts             ZeusApi contract
    types.ts           domain types (profiles, B2B, audit, settings, NLP)
    countries.ts       250+ ISO countries with dial codes and regions
    locations.ts       US states, CA provinces, region matcher
    time.ts            military/UTC/relative timestamps
    constants.ts       default settings, roles, labels, event labels
docs/
  screenshots/         README screen captures
tests/core.test.ts     vitest: crypto, profile lifecycle, auth lockdown, NLP
resources/             generated icon PNGs, icon.ico, NSIS include script
```

---

## MCP and API Documentation

Zeus Vault exposes a Model Context Protocol server over loopback HTTP. Any agent that speaks MCP can connect while the vault is unlocked.

**Endpoint**

```
http://127.0.0.1:7421/mcp
```

Transport: Streamable HTTP (stateless). The server listens only on loopback and never on the network.

**API keys**

- Issue keys from the **Overview dashboard > 04 - Access / API Keys** card: pick a label, click Generate, copy the key **once** (it is shown one time only), paste it into your MCP client config.
- Keys are stored **hashed** (SHA-256) with a display hint of their last four characters, never in plaintext.
- Each key belongs to the user who issued it; tools run with that user's role. Revoke any time from the same card.
- The Settings MCP card shows state, port, endpoint, and client config template. Enabled state can be toggled there; key management stays on the dashboard.

**Client configuration**

```json
{
  "mcpServers": {
    "zeus-vault": {
      "type": "http",
      "url": "http://127.0.0.1:7421/mcp",
      "headers": { "Authorization": "Bearer <API KEY, generated on the Overview dashboard>" }
    }
  }
}
```

**STDIO mode** (for agents that spawn the binary):

```powershell
Zeus Vault.exe --mcp-serve
```

The stdio process mounts the same tool registry and honors the same locked/unlocked states.

**Available tools**

| Tool | Scope |
| --- | --- |
| `dashboard_overview` | Live vault statistics |
| `profiles_list`, `profiles_get`, `profiles_search` | Reads, with FTS and natural language query interpretation |
| `profiles_create`, `profiles_update` | Write access (standard role and up) |
| `profiles_lifecycle`, `profiles_duplicate`, `profiles_favorite` | Archive / restore / soft-delete, duplicate, favorite |
| `profiles_field_history`, `profiles_audit`, `audit_list` | Change history and audit trail |
| `nlp_extract` | Deterministic offline extraction (semantic categories plus confidence) |
| `categories_list` | Categories with profile counts |
| `b2b_list`, `b2b_create`, `b2b_update`, `b2b_delete` | B2B companies contact book |
| `users_list` | Administrative account listing |
| `security_integrity` | Database integrity report |
| `export_profiles` | CSV / JSON / XLSX / PDF export (sensitive fields need an explicit flag) |

**Authentication contract**

- Wrong key, missing header, or revoked key return an MCP error (-32001 Unauthorized).
- When the vault is locked, every tool call fails with a structured error telling the agent (and the operator) to unlock the app.
- Passwords are never returned by `profiles_get` unless `includeSensitive: true` is explicitly requested.

---

## Roles and Permissions

| Capability | Administrator | Standard | Read-Only |
| --- | --- | --- | --- |
| Create, edit, archive, delete profiles | Yes | Yes | No |
| B2B contacts CRUD | Yes | Yes | No |
| Import and export | Yes | Yes | No |
| Manage categories | Admin | Standard | No |
| Manage users and roles | Admin | No | No |
| Global settings | Admin | No | No |
| View all activity logs | Admin | Own activity only | Own activity only |
| View, search, copy | Admin | Standard | Yes |

Enforced in the main process on every IPC call, not only in the interface.

---

## Roadmap

Planned for upcoming versions:

- **Face match.** A local facial recognition model that detects faces inside profile photos and matches a photo against the whole archive without sending anything anywhere.
- **Image search through the database.** Reverse image lookup and perceptual-hash search across all dossiers, combined with structured field filters.
- **Model upgrades.** A wider deterministic NLP vocabulary, user-editable aliases, and optional local embeddings for semantic search inside the authorized vault.
- **Export destinations.** More folder choices and destination presets for exports and backups.

---

## About and Attribution

**Company:** Hexen

**Website:** [hexengroup.com](https://hexengroup.com)

Hexen is a technology organization that builds focused tools for demanding users. Its work emphasizes local-first design, strong cryptography, and interfaces that treat every byte of user data as guarded. Zeus Vault is its encrypted profile intelligence system, built to that same standard on the desktop.

---

## License

This project is released under the MIT License. See the LICENSE file for the full text.
