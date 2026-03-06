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

---

## Swap Types

| Type | Description |
|------|-------------|
| **Standard** | CEX swap with fast execution |
| **Private** | Multi-hop routing for enhanced privacy (15–45 min) |
| **DEX** | On-chain swap via DEX aggregators (Uniswap, CowSwap, SushiSwap, etc.) |
