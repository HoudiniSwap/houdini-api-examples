# Security review

## When a PR needs one

Integrators copy these examples into production, so a pull request needs a security review before merge when it touches any of:

- code that signs or sends anything: approvals, permits, EIP-712 data, swap transactions (`node-examples/examples/`, `nextjs-example/components/`)
- the checks run before signing, in either project
- the Next.js API routes (`nextjs-example/app/api/`), which hold the partner credentials
- how keys and secrets are loaded (`.env` handling, `WALLET_PRIVATE_KEY`, `HOUDINI_API_SECRET`)
- `.github/` (workflows, the scan scripts and `allowed-install-scripts.txt`)
- a new dependency, especially one with an install script

The reviewer goes through the checklist below and says in the review which items they checked. The Security Scan workflow runs on every PR, but it only catches leaked secrets, known-bad code patterns and workflow mistakes; it does not catch a missing check before signing.

## Checklist

1. **Never sign a value only because the API returned it.** Approval target, spender, amount, permit fields, EIP-712 chain and receiver, swap value and target are checked against what the user selected, before the wallet is asked.
2. **Fail closed.** Missing data (decimals, chain, receiver) stops the flow instead of falling back to a default.
3. **No unattended signing.** The node example must ask before it signs or sends, unless explicitly told not to.
4. **Credentials stay on the server.** The partner key and secret never reach the browser, and the API routes are not an open proxy.
5. **Keep the copies in sync.** The checks exist in both projects; change both, and their tests. CI runs the node tests on every PR.
6. **New dependencies.** Integrators run these examples with wallet keys: is the package needed, maintained, and free of install scripts? An install script needs an entry in `.github/allowed-install-scripts.txt`, added in its own PR.

## Running the scanners locally

The Security Scan workflow (`.github/workflows/security-scan.yml`) runs these on a PR. To run them before pushing:

```bash
gitleaks git --log-opts="origin/main..HEAD" --config .gitleaks.toml
semgrep scan --config p/typescript --config p/nodejs --config p/react --config p/nextjs --config p/secrets --baseline-commit origin/main
actionlint .github/workflows/*.yml
zizmor .github/workflows/
```
