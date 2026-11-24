# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability** ([direct link](https://github.com/HoudiniSwap/houdini-api-examples/security/advisories/new)). Do not open a public issue or pull request for a vulnerability.

Include the affected example and file, the steps to reproduce, and what an attacker gains. We will acknowledge the report, keep you updated while we work on a fix, and credit you in the advisory if you want.

When testing, use your own wallets and API keys, and do not run tests that move other people's funds or disrupt the HoudiniSwap API.

## Scope

In scope: the code in this repository (`node-examples`, `nextjs-example`), in particular the checks the examples run before signing or sending a transaction.

These are reference examples. Review them before copying them into production, and never deploy the Next.js example with real partner credentials without adding your own authentication and rate limiting.

Out of scope here: the HoudiniSwap API and website themselves. You can still use the private report link above for them, and we will route the report.
