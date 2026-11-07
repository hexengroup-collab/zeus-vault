# Zeus Vault 1.0.0 - Release Notes

**Release type:** First public release
**License:** MIT
**Platforms:** Windows (primary), Linux-ready

## Highlights

- **Fully offline encrypted vault.** Argon2id authentication with lockout and single-session enforcement. AES-256-GCM encryption of sensitive fields with the master key wrapped by the OS secure keychain and bound to the database fingerprint.
- **Dossier intelligence workspace.** Structured profiles, B2B companies contact book, hover previews, per-field copy buttons, per-field change history.
- **Natural language layer.** Deterministic, offline field extraction for people and businesses (name, email, phones, address, company, industry) plus a natural language query interpreter with structured output filters.
- **Tamper-evident audit ledger** with hash chaining enforced by database triggers, plus one-click Security Center verification and integrity checks.
- **MCP server + API keys.** Loopback-only MCP endpoint authenticated by dashboard-generated keys; 22 tools over the same typed API with full role enforcement and immediate revocation.
- **Import/export and backups.** CSV/JSON/XLSX import wizard with column mapping and duplicate detection; CSV/JSON/XLSX/PDF exports with a save dialog; encrypted/plain snapshots with restore.
- **Proper Windows installer.** Frameless custom top bar, per-user install location chooser, Desktop and Start Menu shortcuts, uninstall entry in Apps and Features, and a clean uninstall that also removes user data when requested.

## First run

1. Double-click `ZeusVault-1.0.0-Setup.exe` and pick your install location.
2. Finish the wizard to install and launch the app.
3. The first-run setup appears before login: it mints the master key, initializes the encrypted database, and asks you to create the **master administrator account**.
4. Sign in with those credentials. The vault seals automatically after inactivity; re-enter your password to unseal.

## Security notes

- The installer is currently unsigned. Windows SmartScreen may warn on first launch ("More info" > "Run anyway").
- Secrets (session tokens, trusted-device keys) are not stored inside the database. They live in an encrypted file outside the vault.
- No telemetry, no ads, no account sync, no cloud dependency.

## Downloads

| File | What for |
| --- | --- |
| `ZeusVault-1.0.0-Setup.exe` | Windows installer (self-contained; includes Electron runtime and all DLLs) |

### Verify the download (SHA-256)

After downloading, verify the installer matches the published checksum:

```powershell
certutil -hashfile .\ZeusVault-1.0.0-Setup.exe SHA256
```

Compare to the hash published on the release page. If the hash differs, do not run the file.
