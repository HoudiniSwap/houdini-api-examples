/**
 * Houdini Private Swap - Complete Example (TypeScript, API v2)
 *
 * This script demonstrates a complete private swap flow using the v2 API:
 * 1. Get quotes (select the one with type: "private")
 * 2. Create a private swap order via /v2/exchanges
 * 3. Display deposit instructions
 * 4. Monitor the swap status via /v2/orders/{houdiniId}
 *
 * Requirements:
 * - Node.js 18+ (for native fetch support)
 * - Valid Houdini API credentials in .env file
 *
 * Usage:
 * 1. Copy .env.example to .env and set your API credentials
 * 2. Run: yarn run:private
 *
 * NOTE: Private swaps use multi-hop routing through CEX exchanges
 * for maximum privacy. Completion time: 15-45 minutes.
 */

import dotenv from 'dotenv';
import type { FetchOptions } from '../src/types';
import { sleep, fetchFromHoudini, formatTime } from '../src/helpers';

dotenv.config();

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  SWAP: {
    amount: '1',
    // Use token IDs from GET /v2/tokens — not symbols.
    // Example IDs below are for ETH and SOL; replace with your desired pair.
    fromTokenId: '6689b73ec90e45f3b3e51566',  // ETH
    toTokenId:   '6689b73ec90e45f3b3e51577',  // SOL
    addressTo: '7A2Hz1fVDf7hPEah4Rtnqos2G22RUbSEtmpUFFWTfFQb',
  },
  STATUS_POLL_INTERVAL: 30_000,   // 30 seconds (private swaps are slower)
  MAX_POLL_ATTEMPTS: 240,         // up to 120 minutes
};

// ============================================================================
// V2 TYPES (inline — not yet in src/types.ts)
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
  min?: number;
  max?: number;
  error?: string;
}

interface V2QuotesResponse {
  quotes: V2Quote[];
  total: number;
}

interface V2Order {
  houdiniId: string;
  created: string;
  expires: string;
  depositAddress: string;
  depositTag?: string;
  receiverAddress: string;
  anonymous: boolean;
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
// HELPERS
// ============================================================================

function displayMultiHopStatus(order: V2Order): void {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] Overall:    ${order.statusLabel} (${order.status})`);
  console.log(`              First Hop:  ${order.inStatusLabel} (${order.inStatus})`);
  console.log(`              Second Hop: ${order.outStatusLabel} (${order.outStatus})`);
}

// ============================================================================
// MAIN FLOW
// ============================================================================

async function executePrivateSwap(): Promise<void> {
  console.log('Private Swap Mode: Multi-hop routing for maximum privacy');
  console.log('Expected completion: 15-45 minutes\n');

  try {
    // ========================================================================
    // STEP 1: Get Quotes — select private quote
    // ========================================================================
    console.log('STEP 1: Requesting quotes...');
    console.log(`   Swapping: ${CONFIG.SWAP.amount} (from token ${CONFIG.SWAP.fromTokenId}) -> (to token ${CONFIG.SWAP.toTokenId})\n`);

    const { quotes } = await fetchFromHoudini<V2QuotesResponse>('/v2/quotes', {
      params: {
        amount: CONFIG.SWAP.amount,
        from: CONFIG.SWAP.fromTokenId,
        to: CONFIG.SWAP.toTokenId,
      },
    });

    const privateQuote = quotes.find(q => q.type === 'private' && !q.error);
    if (!privateQuote) {
      throw new Error('No private quote available for this pair. Try a different token pair or amount.');
    }
    console.log('Private quote received:');
    console.log(`   Amount In:  ${privateQuote.amountIn}`);
    console.log(`   Amount Out: ${privateQuote.amountOut}`);
    if (privateQuote.amountOutUsd != null) {
      console.log(`   USD Value:  $${privateQuote.amountOutUsd.toFixed(2)}`);
    }
    console.log(`   ETA:        ${privateQuote.duration} minutes`);
    console.log(`   Quote ID:   ${privateQuote.quoteId}\n`);

    // ========================================================================
    // STEP 2: Create Private Swap Order
    // ========================================================================
    console.log('STEP 2: Creating private swap order...\n');

    const order = await fetchFromHoudini<V2Order>('/v2/exchanges', {
      method: 'POST',
      body: {
        quoteId: privateQuote.quoteId,
        addressTo: CONFIG.SWAP.addressTo,
      },
    });

    console.log('Private swap order created:');
    console.log(`   Houdini ID:  ${order.houdiniId}`);
    console.log(`   Status:      ${order.statusLabel} (${order.status})`);
    console.log(`   Routing:     ${order.swapName ?? 'Multi-hop'}`);
    console.log(`   Created:     ${formatTime(order.created)}`);
    console.log(`   Expires:     ${formatTime(order.expires)}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                    DEPOSIT INSTRUCTIONS                        ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Send EXACTLY: ${order.inAmount} ${order.inSymbol}`);
    console.log(`   To Address:   ${order.depositAddress}`);
    if (order.depositTag) {
      console.log(`   MEMO/TAG:     ${order.depositTag}  <-- REQUIRED`);
    }
    console.log(`\n   You will receive: ~${order.outAmount} ${order.outSymbol}`);
    console.log(`   At address:       ${order.receiverAddress}`);
    console.log(`   Before:           ${formatTime(order.expires)}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ========================================================================
    // STEP 3: Poll Order Status via /v2/orders/{houdiniId}
    // ========================================================================
    console.log('STEP 3: Monitoring private swap status...');
    console.log('   (Polling every 30 seconds — private swaps take 15-45 minutes)\n');

    let attempts = 0;
    let lastStatusLabel = '';
    let lastInStatusLabel = '';
    let lastOutStatusLabel = '';
    let depositDetected = false;
    let anonymizingLogged = false;

    while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
      attempts++;

      const current = await fetchFromHoudini<V2Order>(`/v2/orders/${order.houdiniId}`);

      const statusChanged =
        current.statusLabel !== lastStatusLabel ||
        current.inStatusLabel !== lastInStatusLabel ||
        current.outStatusLabel !== lastOutStatusLabel;

      if (statusChanged) {
        displayMultiHopStatus(current);

        if (current.inStatus >= 2 && !depositDetected) {
          console.log('   Deposit detected on blockchain!\n');
          depositDetected = true;
        }
        if (current.status === 3 && !anonymizingLogged) {
          console.log('   Anonymizing: Routing through XMR privacy layer...\n');
          anonymizingLogged = true;
        }

        lastStatusLabel = current.statusLabel;
        lastInStatusLabel = current.inStatusLabel;
        lastOutStatusLabel = current.outStatusLabel;
      }

      // Terminal states
      if (current.status === 4) {
        console.log('\nSUCCESS! Private swap completed.');
        console.log(`   Received: ${current.outAmount} ${current.outSymbol}`);
        console.log(`   To:       ${current.receiverAddress}`);
        if (current.transactionHash) {
          console.log(`   Tx Hash:  ${current.transactionHash}`);
          if (current.hashUrl) console.log(`   Explorer: ${current.hashUrl}`);
        }
        console.log('\nPrivacy achieved through multi-hop routing.');
        break;
      } else if (current.status === 5) {
        console.log('\nOrder expired — deposit not received in time.');
        console.log('   Create a new order if you still want to swap.');
        break;
      } else if (current.status === 6) {
        console.log('\nSwap failed.');
        console.log(`   Contact support with Houdini ID: ${order.houdiniId}`);
        break;
      } else if (current.status === 7) {
        console.log('\nSwap was refunded.');
        console.log('   Funds will be returned to your original address.');
        break;
      } else if (current.status === 8) {
        console.log('\nOrder was deleted from the system.');
        break;
      }

      await sleep(CONFIG.STATUS_POLL_INTERVAL);
    }

    if (attempts >= CONFIG.MAX_POLL_ATTEMPTS) {
      console.log('\nPolling timeout reached. The swap may still be in progress.');
      console.log(`   Houdini ID: ${order.houdiniId}`);
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
executePrivateSwap();
