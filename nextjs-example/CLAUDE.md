# Houdini Swap — Next.js Integration Guide

This file gives AI assistants full context to build any frontend integration with the Houdini Swap API using Next.js 14.

---

## Project Setup

```bash
yarn install
cp .env.example .env.local   # fill in your API key/secret
yarn dev
```

**Stack:** Next.js 14, App Router, TypeScript, Tailwind CSS, wagmi v2, RainbowKit, Viem

---

## Environment Variables

```env
# .env.local — server-side only, never expose to the browser
HOUDINI_API_KEY=your_key
HOUDINI_API_SECRET=your_secret

# Optional RPC overrides
ETHEREUM_RPC_URL=
BASE_RPC_URL=
ARBITRUM_RPC_URL=
POLYGON_RPC_URL=
OPTIMISM_RPC_URL=
```

Never use `NEXT_PUBLIC_` prefix for these — the API secret must stay server-side.

---

## Project Structure

```
nextjs-example/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/                      ← all Houdini calls go here (server-side proxy)
│       └── tokens/route.ts       ← token search proxy (already built)
├── components/
│   ├── SwapForm.tsx               ← swap UI with two token boxes (already built)
│   └── TokenSelector.tsx          ← token picker modal with search (already built)
└── lib/
    ├── types.ts                   ← all TypeScript types for the API
    └── helpers.ts                 ← fetchFromHoudini(), getStatusName(), sleep()
```

**Key rule:** Client components (`'use client'`) never call the Houdini API directly. They call your own `/api/*` routes, which then call Houdini with the secret.

---

## Existing Utilities — Reuse These

### `lib/helpers.ts`

```typescript
// Server-side authenticated fetch — use ONLY inside app/api/ routes
fetchFromHoudini<T>(endpoint: string, options?: FetchOptions): Promise<T>

// Client-safe utilities
getStatusName(code: number): string   // 0 → "WAITING", 4 → "COMPLETED", etc.
getHopStatus(code: number): string    // for private swap hop tracking
formatTime(isoString: string): string
sleep(ms: number): Promise<void>
```

### `lib/types.ts`

All TypeScript types: `Token`, `QuoteResponse`, `SwapOrder`, `SwapStatus`, `DexQuoteResponse`, `DexApproveResponse`, `DexExchangeResponse`, `Signature`, `SignatureObject`, `SwapStatusCode`, `HopStatusCode`. Always import from here — never redefine types.

---

## API Reference

### Base URLs (server-side only)

- Swap API: `https://api-partner.houdiniswap.com`
- Token Search: `https://api-dev-partner.houdiniswap.com/v2`

### Authentication (handled by `fetchFromHoudini`)

```
Authorization: API_KEY:API_SECRET
x-user-ip: <user IP>
x-user-agent: <browser agent>
x-user-timezone: America/New_York
```

---

### Token Search — `GET /v2/tokens`

Already proxied at `app/api/tokens/route.ts`. Call from the client as:

```typescript
const res = await fetch('/api/tokens?term=eth&pageSize=20');
const { tokens } = await res.json();
// tokens[i]: { id, symbol, name, icon, chainData: { shortName, name }, price, hasDex, hasCex }
```

---

### Quote — `GET /quote`

Create `app/api/quote/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { fetchFromHoudini } from '@/lib/helpers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const data = await fetchFromHoudini('/quote', {
    params: {
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      amount: searchParams.get('amount'),
      anonymous: searchParams.get('anonymous') ?? 'false',
    }
  });
  return NextResponse.json(data);
}
// Response: { amountIn, amountOut, amountOutUsd, type, duration, quoteId }
```

Call from client: `fetch('/api/quote?from=ETH&to=USDC&amount=1')`

---

### Create Swap — `POST /exchange`

Create `app/api/exchange/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { fetchFromHoudini } from '@/lib/helpers';
import type { SwapOrder } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const order = await fetchFromHoudini<SwapOrder>('/exchange', {
    method: 'POST',
    body: {
      ...body,
      ip: request.headers.get('x-forwarded-for') ?? '127.0.0.1',
      userAgent: request.headers.get('user-agent') ?? '',
      timezone: body.timezone ?? 'America/New_York',
    }
  });
  return NextResponse.json(order);
}
```

Response includes `order.senderAddress` (deposit address) and `order.houdiniId` for status polling.

---

### Swap Status — `GET /status/[id]`

Create `app/api/status/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { fetchFromHoudini } from '@/lib/helpers';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const data = await fetchFromHoudini('/status', { params: { houdiniId: params.id } });
  return NextResponse.json(data);
}
```

**Status codes:**

| Code | Meaning |
|------|---------|
| 0 | WAITING — waiting for deposit |
| 1 | CONFIRMING |
| 2 | EXCHANGING |
| 3 | ANONYMIZING (private swaps) |
| 4 | COMPLETED ✓ |
| 5 | EXPIRED |
| 6 | FAILED |
| 7 | REFUNDED |
| 8 | DELETED |

Terminal states (stop polling): `>= 4`.

---

### DEX Quote — `GET /dexQuote`

Create `app/api/dex/quote/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const data = await fetchFromHoudini('/dexQuote', { params: Object.fromEntries(searchParams) });
  return NextResponse.json(data);
}
// Returns quotes from multiple DEX providers. Pick the best amountOut.
// swap field: "un" = Uniswap, "cs" = CowSwap, "su" = SushiSwap, etc.
```

---

### DEX Approve — `POST /dex/approve`

Check what ERC-20 approvals and EIP-712 signatures are needed:

```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await fetchFromHoudini('/dexApprove', { method: 'POST', body });
  return NextResponse.json(data);
}
// Response: { approvals: [{ to, data }], signatures: [{ type, key, step, totalSteps, data: { domain, types, primaryType, message } }] }
```

In the client:
1. If `approvals` is non-empty → use wagmi `useSendTransaction` to broadcast each approval tx
2. If `signatures` is non-empty → use wagmi `useSignTypedData` to sign each one

---

### DEX Exchange — `POST /dex/exchange`

Create `app/api/dex/exchange/route.ts`:

```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  const data = await fetchFromHoudini('/dexExchange', { method: 'POST', body });
  return NextResponse.json(data);
}
// Response: { houdiniId, status, metadata: { offChain, to, data, value } }
// If metadata.offChain = true (CowSwap): no tx needed
// Otherwise: broadcast tx with metadata.to, metadata.data, metadata.value
```

After broadcasting: `POST /api/dex/confirm` → `fetchFromHoudini('/dexConfirmTx', { body: { houdiniId, txHash } })`

---

## Component Patterns

### Status polling in a client component

```typescript
'use client';
import { useEffect, useState } from 'react';
import { getStatusName } from '@/lib/helpers';

function SwapStatus({ houdiniId }: { houdiniId: string }) {
  const [status, setStatus] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/status/${houdiniId}`);
      const data = await res.json();
      setStatus(data.status);
      if (data.status >= 4) clearInterval(interval); // terminal state
    }, 10_000);
    return () => clearInterval(interval);
  }, [houdiniId]);

  return <p>Status: {status !== null ? getStatusName(status) : 'Loading...'}</p>;
}
```

### DEX wallet signing (wagmi)

```typescript
'use client';
import { useSignTypedData, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';

// Sign EIP-712 (for permit/approval signatures)
const { signTypedDataAsync } = useSignTypedData();
const signature = await signTypedDataAsync({
  domain: sig.data.domain,
  types: sig.data.types,
  primaryType: sig.data.primaryType,
  message: sig.data.message,
});

// Broadcast a transaction (for ERC-20 approvals or the swap itself)
const { sendTransactionAsync } = useSendTransaction();
const hash = await sendTransactionAsync({ to, data, value });
```

### Token picker — already built

`components/TokenSelector.tsx` exports `TokenSelector` and the `Token` type.

```typescript
import { TokenSelector, type Token } from '@/components/TokenSelector';

<TokenSelector
  selected={token}           // Token | undefined
  onSelect={(t) => setToken(t)}
  excludeToken={otherToken}  // prevents selecting the same token on both sides
/>
```

Opening the selector fetches `/api/tokens` with debounced search.

---

## Common Tasks

| User asks for | What to build |
|---------------|---------------|
| Token search / picker | Already built — `components/TokenSelector.tsx` |
| Swap form with two tokens | Already built — `components/SwapForm.tsx` |
| Get a quote | `app/api/quote/route.ts` + call from client |
| Execute a swap | `app/api/exchange/route.ts` → show deposit address → poll status |
| Track swap status | `app/api/status/[id]/route.ts` + polling `useEffect` |
| DEX swap with wallet | wagmi + `app/api/dex/*` routes, handle approvals + sign + broadcast |
| Private swap | Same as standard, `anonymous: true`, also track `inStatus`/`outStatus` |
| Wallet connect | Already in deps: wagmi + RainbowKit — wrap layout with providers |
