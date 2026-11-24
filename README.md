# Houdini Swap API — Examples

TypeScript examples for integrating with the Houdini Swap API.

This repo contains two standalone projects:

| Project | Description |
|---------|-------------|
| [`node-examples/`](./node-examples/) | Node.js scripts for all three swap types (DEX, Standard, Private) |
| [`nextjs-example/`](./nextjs-example/) | Next.js app scaffold with API routes and wallet connect setup |

---

## node-examples

Server-side TypeScript scripts — good for backend integrations, bots, or testing the API directly.

```bash
cd node-examples
yarn install
cp .env.example .env   # add your API key/secret
yarn run:standard      # run standard swap example
yarn run:private       # run private swap example
yarn run:dex           # run DEX swap example
```

---

## nextjs-example

A Next.js 14 app with App Router, Tailwind CSS, wagmi, and RainbowKit — good as a starting point for a browser-based swap integration.

```bash
cd nextjs-example
npm install
cp .env.example .env.local   # add your API key/secret
npm run dev
```

> **Before you deploy:** the routes under `app/api/` call Houdini with your API key and secret, and they accept requests from anyone who can reach them. As written they are for local development. Before putting the app on a public URL, put your own user authentication and rate limiting in front of them, or anyone can use your partner account through them.

---

## Swap Types

| Type | Description |
|------|-------------|
| **Standard** | CEX swap with fast execution |
| **Private** | Multi-hop routing for enhanced privacy (15–45 min) |
| **DEX** | On-chain swap via DEX aggregators (Uniswap, CowSwap, SushiSwap, etc.) |

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Changes to signing, the checks before signing, the API routes or key handling need a security review before merge: see [docs/security-review.md](docs/security-review.md).
