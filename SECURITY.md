# Security Policy

## Reporting a vulnerability

**Recommended:** use GitHub private vulnerability reporting on the repository (Settings > Code security or the Report a vulnerability button on the Security tab). It opens a private channel directly with the maintainers.

If you prefer email, you can use the security contact below. For encrypted reports, include your report in the message and request a PGP key.

### Maintainers' security contact

- Security contact: **hello@hexengroup.com**
- Response target: acknowledge within 2 business days and provide a triage timeline within one week.
- If no contact responds after 14 days, you may disclose the report on the issue tracker with a `security` label.

## What is in scope

- Authentication, session, and lock bypass
- Encryption and key management flaws
- Authentication or authorization bypasses in IPC, MCP, or the UI
- Audit ledger tampering vectors
- Backup and restore weaknesses

## What is not in scope

- Reports about unsigned installer SmartScreen warnings (documented known limitation until a certificate is purchased)
- Dependency advisories that have no practical exploit path in this application (the audit notes them in the release checklist)
- Social engineering against maintainers or users

## Disclosure timeline

1. Maintainers acknowledge and investigate.
2. A fix is prepared and verified with the full test suite and a clean production build.
3. The fix lands in a release. A brief advisory is appended to [PRE_PUSH_AUDIT_REPORT.md](PRE_PUSH_AUDIT_REPORT.md) and the release notes.
4. Public disclosure follows the release by at least 7 days, coordinated with the reporter.

## Supported versions

Only the latest release is supported. Older installs are encouraged to upgrade.
