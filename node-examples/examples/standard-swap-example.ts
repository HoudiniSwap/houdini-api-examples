/**
 * Houdini Standard Swap - Complete Example (TypeScript, API v2)
 *
 * Flow:
 * 1. GET /v2/quotes — select quote with type: "standard"
 * 2. POST /v2/exchanges — create order with quoteId + addressTo
 * 3. Send deposit to depositAddress
 * 4. GET /v2/orders/{houdiniId} — poll until FINISHED
 *
 * Usage: yarn run:standard
 */

import dotenv from 'dotenv';
import { sleep, fetchFromHoudini, formatTime } from '../src/helpers';

dotenv.config();

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  SWAP: {
    amount: '1',
    // Use token IDs from GET /v2/tokens — not symbols.
    fromTokenId: '6689b73ec90e45f3b3e51566',  // ETH
    toTokenId:   '6689b73ec90e45f3b3e51558',  // USDC
    addressTo: '0xb7dE6b6eEBF7401aFea5a49D6405C9048fEf2d40',
  },
  STATUS_POLL_INTERVAL: 30_000,  // 30 seconds
  MAX_POLL_ATTEMPTS: 60,         // up to 30 minutes
};

// ============================================================================
// V2 TYPES
// ============================================================================

interface V2Quote {
  quoteId: string;
  type: 'standard' | 'private' | 'dex';
  swap: string;
  swapName?: string;
  amountIn: number;
  amountOut: number;
  amountOutUsd?: number;
  duration: number;
  error?: string;
}

interface V2Order {
  houdiniId: string;
  created: string;
  expires: string;
  depositAddress: string;
  depositTag?: string;
  receiverAddress: string;
  status: number;
  statusLabel: string;
  inAmount: number;
  inSymbol: string;
  inStatus: number;
  inStatusLabel: string;
  outAmount: number;
  outSymbol: string;
  outStatus: number;
  outStatusLabel: string;
  eta: number;
  swapName?: string;
  transactionHash?: string;
  hashUrl?: string;
}

// ============================================================================
// MAIN FLOW
// ============================================================================

async function executeStandardSwap(): Promise<void> {
  console.log('Houdini Standard Swap (API v2)\n');

  try {
    // ========================================================================
    // STEP 1: Get Quotes — select standard quote
    // ========================================================================
    console.log('STEP 1: Requesting quotes...');

    const { quotes } = await fetchFromHoudini<{ quotes: V2Quote[] }>('/v2/quotes', {
      params: {
        amount: CONFIG.SWAP.amount,
        from: CONFIG.SWAP.fromTokenId,
        to: CONFIG.SWAP.toTokenId,
      },
    });

    const quote = quotes.find(q => q.type === 'standard' && !q.error);
    if (!quote) throw new Error('No standard quote available for this pair.');
    
    console.log('Quote received:');
    console.log(`   Provider:   ${quote.swapName ?? quote.swap}`);
    console.log(`   Amount In:  ${quote.amountIn}`);
    console.log(`   Amount Out: ${quote.amountOut}`);
    if (quote.amountOutUsd != null) console.log(`   USD Value:  $${quote.amountOutUsd.toFixed(2)}`);
    console.log(`   ETA:        ${quote.duration} minutes`);
    console.log(`   Quote ID:   ${quote.quoteId}\n`);

    // ========================================================================
    // STEP 2: Create Order
    // ========================================================================
    console.log('STEP 2: Creating swap order...');

    const order = await fetchFromHoudini<V2Order>('/v2/exchanges', {
      method: 'POST',
      body: {
        quoteId: quote.quoteId,
        addressTo: CONFIG.SWAP.addressTo,
      },
    });

    console.log('Order created:');
    console.log(`   Houdini ID: ${order.houdiniId}`);
    console.log(`   Status:     ${order.statusLabel}`);
    console.log(`   Provider:   ${order.swapName ?? quote.swap}`);
    console.log(`   Created:    ${formatTime(order.created)}`);
    console.log(`   Expires:    ${formatTime(order.expires)}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                    DEPOSIT INSTRUCTIONS                        ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Send EXACTLY: ${order.inAmount} ${order.inSymbol}`);
    console.log(`   To Address:   ${order.depositAddress}`);
    if (order.depositTag) console.log(`   MEMO/TAG:     ${order.depositTag}  <-- REQUIRED`);
    console.log(`\n   You will receive: ~${order.outAmount} ${order.outSymbol}`);
    console.log(`   At address:       ${order.receiverAddress}`);
    console.log(`   Before:           ${formatTime(order.expires)}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ========================================================================
    // STEP 3: Poll Order Status
    // ========================================================================
    console.log('STEP 3: Monitoring swap status...');
    console.log('   (Polling every 30 seconds)\n');

    let attempts = 0;
    let lastStatusLabel = '';

    while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
      attempts++;

      const current = await fetchFromHoudini<V2Order>(`/v2/orders/${order.houdiniId}`);

      if (current.statusLabel !== lastStatusLabel) {
        const ts = new Date().toLocaleTimeString();
        console.log(`[${ts}] ${current.statusLabel}`);
        lastStatusLabel = current.statusLabel;
      }

      if (current.status === 4) {
        console.log('\nSUCCESS! Swap completed.');
        console.log(`   Received: ${current.outAmount} ${current.outSymbol}`);
        console.log(`   To:       ${current.receiverAddress}`);
        if (current.transactionHash) {
          console.log(`   Tx Hash:  ${current.transactionHash}`);
          if (current.hashUrl) console.log(`   Explorer: ${current.hashUrl}`);
        }
        break;
      } else if (current.status === 5) {
        console.log('\nOrder expired — deposit not received in time.');
        break;
      } else if (current.status === 6) {
        console.log('\nSwap failed.');
        console.log(`   Contact support with Houdini ID: ${order.houdiniId}`);
        break;
      } else if (current.status === 7) {
        console.log('\nSwap was refunded.');
        break;
      } else if (current.status === 8) {
        console.log('\nOrder deleted.');
        break;
      }

      await sleep(CONFIG.STATUS_POLL_INTERVAL);
    }

    if (attempts >= CONFIG.MAX_POLL_ATTEMPTS) {
      console.log('\nPolling timeout reached. Swap may still be in progress.');
      console.log(`   Check manually: GET /v2/orders/${order.houdiniId}`);
    }

  } catch (error) {
    console.error('\nERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log('\nScript completed.\n');
}

// ============================================================================
// VALIDATION + ENTRY POINT
// ============================================================================

function validateConfig(): void {
  const errors: string[] = [];
  if (!process.env.HOUDINI_API_KEY)    errors.push('HOUDINI_API_KEY not set in .env');
  if (!process.env.HOUDINI_API_SECRET) errors.push('HOUDINI_API_SECRET not set in .env');
  if (!CONFIG.SWAP.amount || parseFloat(CONFIG.SWAP.amount) <= 0) errors.push('Invalid swap amount');
  if (!CONFIG.SWAP.addressTo) errors.push('addressTo is required');
  if (errors.length > 0) {
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}

validateConfig();
executeStandardSwap();
