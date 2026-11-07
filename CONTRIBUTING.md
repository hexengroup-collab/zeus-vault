# Contributing to ZEUS VAULT

ZEUS VAULT is built for maintainers and contributors who care about local-first security. Contributions that keep the codebase safe, offline, and boring are welcome.

## Development setup

```powershell
git clone https://github.com/hexengroup/zeus-vault.git
cd zeus-vault
npm install
npm run dev
```

Prerequisites: Node 20 or newer, npm, Git.

Commands:

```powershell
npm run build      # production build
npm run dist       # NSIS installer into release/
npm test           # typecheck + 16 unit tests (crypto, profile lifecycle, auth, NLP, audit)
```

## How to contribute

1. Fork the repository and create a short-lived branch.
2. Keep changes small and scoped. One logical change per pull request.
3. Add or update tests for security-critical behavior (authentication, encryption, session handling, API keys, MCP authorization).
4. Run `npm test` and `npm run typecheck` before requesting review.
5. Open a pull request explaining what changed and why. Include a risk note for anything touching authentication, encryption, IPC, or schema migrations.

## Conventions

- Do not introduce telemetry, analytics, account sync, or any network dependency into the core vault.
- Do not weaken security defaults (password policy, lock behavior, single-session enforcement, audit append-only) without a maintainer review.
- Do not store secrets, tokens, or user data in the repository. Tests use in-memory databases.
- Respect the design language: dark intelligence terminal, fine dotted backgrounds, thin separators, micro typography. No generic SaaS dashboard patterns.
- The project uses MIT licensing. Contributions are accepted under the same license.

## Reporting issues

Open a GitHub issue with a title, steps to reproduce, expected behavior, and the version/branch/commit you tested. For security issues, do not file a public issue. See [SECURITY.md](SECURITY.md) for the responsible disclosure process.
