/**
 * Houdini Private Swap - Complete Example (TypeScript)
 *
 * This script demonstrates a complete private swap flow:
 * 1. Get a quote for ETH → USDC with maximum privacy
 * 2. Create a private swap order (multi-hop routing)
 * 3. Display deposit instructions
 * 4. Monitor the swap status through both hops
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
import type {
  FetchOptions,
  QuoteResponse,
  SwapOrder,
  SwapStatus,
} from '../src/types';
import { 
  getStatusName, 
  sleep, 
  fetchFromHoudini, 
  formatTime 
} from '../src/helpers';

dotenv.config();

interface PrivateSwapConfig {
  API_BASE_URL: string;
  API_KEY: string;
  API_SECRET: string;
  SWAP: {
    amount: string;
    from: string;
    to: string;
    addressTo: string;
    receiverTag: string;
    anonymous: boolean;
  };
  USER: {
    ip: string;
    userAgent: string;
    timezone: string;
  };
  STATUS_POLL_INTERVAL: number;
  MAX_POLL_ATTEMPTS: number;
}

const CONFIG: PrivateSwapConfig = {
  API_BASE_URL: 'https://api-partner.houdiniswap.com',
  API_KEY: process.env.HOUDINI_API_KEY || '',
  API_SECRET: process.env.HOUDINI_API_SECRET || '',

  // Swap parameters
  SWAP: {
    amount: '1',                    // Amount to swap (1 ETH)
    from: 'ETH',                      // Source token symbol
    to: 'USDC',                       // Destination token symbol
    addressTo: '0xb7dE6b6eEBF7401aFea5a49D6405C9048fEf2d40', // Destination address
    receiverTag: '',                  // Memo/tag if required (empty for most tokens)
    anonymous: true,                  // Private swap (multi-hop routing)
  },

  // User context (required headers)
  USER: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timezone: 'America/New_York'
  },

  // Polling configuration
  STATUS_POLL_INTERVAL: 30000,        // Check status every 30 seconds (private swaps are slower)
  MAX_POLL_ATTEMPTS: 240,             // Max 120 minutes of polling (240 * 30s)
};

/**
 * Format inStatus/outStatus for private swaps
 */
function getHopStatus(statusCode: number): string {
  const hopStatuses: Record<number, string> = {
    1: 'Waiting for deposit',
    2: 'Deposit detected',
    3: 'Swapping',
    4: 'Sending to next hop',
    5: 'Completed',
  };
  return hopStatuses[statusCode] || `Status ${statusCode}`;
}

function displayMultiHopStatus(status: SwapStatus): void {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] Overall: ${getStatusName(status.status)} (${status.status})`);

  // Show hop-specific status for private swaps
  if (status.inStatus !== undefined) {
    console.log(`              First Hop (Input):  ${getHopStatus(status.inStatus)} (${status.inStatus})`);
  }
  if (status.outStatus !== undefined) {
    console.log(`              Second Hop (Output): ${getHopStatus(status.outStatus)} (${status.outStatus})`);
  }
}

async function executePrivateSwap(): Promise<void> {
  console.log('🔒 Private Swap Mode: Multi-hop routing for maximum privacy');
  console.log('⏱️  Expected completion: 15-45 minutes\n');

  try {
    // ========================================================================
    // STEP 1: Get Quote with Privacy
    // ========================================================================
    console.log('📊 STEP 1: Requesting private quote...');
    console.log(`   Swapping: ${CONFIG.SWAP.amount} ${CONFIG.SWAP.from} → ${CONFIG.SWAP.to}\n`);

    const quote = await fetchFromHoudini<QuoteResponse>('/quote', {
      params: {
        amount: CONFIG.SWAP.amount,
        from: CONFIG.SWAP.from,
        to: CONFIG.SWAP.to,
        anonymous: true,  // Enable private routing
      }
    });

    console.log('✅ Private quote received:');
    console.log(`   Amount In:  ${quote.amountIn} ${CONFIG.SWAP.from}`);
    console.log(`   Amount Out: ${quote.amountOut} ${CONFIG.SWAP.to}`);
    console.log(`   USD Value:  $${quote.amountOutUsd.toFixed(2)}`);
    console.log(`   Type:       ${quote.type} (multi-hop for privacy)`);
    console.log(`   ETA:        ${quote.duration} minutes`);
    console.log(`   Quote ID:   ${quote.quoteId}\n`);

    if (quote.type !== 'private') {
      console.warn('⚠️  Warning: Quote type is not "private". Route may not provide full privacy.\n');
    }

    // ========================================================================
    // STEP 2: Create Private Swap Order
    // ========================================================================
    console.log('🔄 STEP 2: Creating private swap order...\n');

    const swapRequest = {
      amount: parseFloat(CONFIG.SWAP.amount),
      from: CONFIG.SWAP.from,
      to: CONFIG.SWAP.to,
      addressTo: CONFIG.SWAP.addressTo,
      receiverTag: CONFIG.SWAP.receiverTag,
      anonymous: true,  // Enable private swap
      ip: CONFIG.USER.ip,
      userAgent: CONFIG.USER.userAgent,
      timezone: CONFIG.USER.timezone,
    };

    const swap = await fetchFromHoudini<SwapOrder>('/exchange', {
      method: 'POST',
      body: swapRequest,
    });

    console.log('✅ Private swap order created:');
    console.log(`   Houdini ID:     ${swap.houdiniId}`);
    console.log(`   Status:         ${getStatusName(swap.status)} (${swap.status})`);
    console.log(`   Created:        ${formatTime(swap.created)}`);
    console.log(`   Expires:        ${formatTime(swap.expires)}`);
    console.log(`   Routing:        Multi-hop (${swap.type})\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('                    💰 DEPOSIT INSTRUCTIONS                     ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Send EXACTLY: ${swap.inAmount} ${swap.inSymbol}`);
    console.log(`   To Address:   ${swap.senderAddress}\n`);

    if (swap.senderTag) {
      console.log(`   ⚠️  MEMO/TAG REQUIRED: ${swap.senderTag}\n`);
    }

    console.log('   ⚠️  CRITICAL REQUIREMENTS:');
    console.log(`   • Send exact amount: ${swap.inAmount} ${swap.inSymbol}`);
    console.log(`   • Before expiration: ${formatTime(swap.expires)}`);
    console.log('   • Send from a wallet you control (for potential refunds)');
    console.log('   • Wrong amount or late deposit will cause issues\n');

    console.log(`   You will receive: ~${swap.outAmount} ${swap.outSymbol}`);
    console.log(`   At address:       ${swap.receiverAddress}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ========================================================================
    // STEP 3: Monitor Multi-Hop Swap Status
    // ========================================================================
    console.log('👀 STEP 3: Monitoring private swap status...');
    console.log('   (Polling every 15 seconds - private swaps take longer)\n');

    let attempts = 0;
    let currentStatus = swap.status;
    let lastStatus: number | null = null;
    let lastInStatus: number | undefined = undefined;
    let lastOutStatus: number | undefined = undefined;
    let depositDetected = false;
    let anonymizingStarted = false;

    while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
      attempts++;

      // Fetch current status
      const status = await fetchFromHoudini<SwapStatus>('/status', {
        params: { id: swap.houdiniId }
      });

      currentStatus = status.status;

      // Check if any status changed
      const statusChanged = currentStatus !== lastStatus ||
                           status.inStatus !== lastInStatus ||
                           status.outStatus !== lastOutStatus;

      if (statusChanged) {
        displayMultiHopStatus(status);

        // Show milestone messages
        if (status.inStatus && status.inStatus >= 2 && !depositDetected) {
          console.log('   ✅ Deposit detected on blockchain!\n');
          depositDetected = true;
        }

        if (currentStatus === 3 && !anonymizingStarted) {
          console.log('   🔀 Anonymizing: Routing through privacy layer...\n');
          anonymizingStarted = true;
        }

        lastStatus = currentStatus;
        lastInStatus = status.inStatus;
        lastOutStatus = status.outStatus;
      }

      // Check for terminal states
      if (currentStatus === 4) {
        // COMPLETED
        console.log('\n✅ SUCCESS! Private swap completed successfully!');
        console.log(`   Final amount: ${status.outAmount} ${status.outSymbol}`);
        console.log(`   Destination:  ${status.receiverAddress}`);
        if (status.txHash) {
          console.log(`   TX Hash:      ${status.txHash}`);
        }
        console.log('\n🔒 Privacy achieved through multi-hop routing!');
        break;
      } else if (currentStatus === 5) {
        // EXPIRED
        console.log('\n❌ Order expired before deposit was received.');
        console.log('   Please create a new order if you still want to swap.');
        break;
      } else if (currentStatus === 6) {
        // FAILED
        console.log('\n❌ Swap failed!');
        if (status.message) {
          console.log(`   Error: ${status.message}`);
        }
        console.log('   Please contact support with your Houdini ID for assistance.');
        break;
      } else if (currentStatus === 7) {
        // REFUNDED
        console.log('\n💰 Swap was refunded.');
        if (status.message) {
          console.log(`   Reason: ${status.message}`);
        }
        console.log('   Funds should be returned to your original address.');
        break;
      } else if (currentStatus === 8) {
        // DELETED
        console.log('\n⚠️  Order was deleted from the system.');
        console.log('   This is normal cleanup for old orders.');
        break;
      }

      // Wait before next poll (only if not terminal state)
      if (currentStatus < 4) {
        await sleep(CONFIG.STATUS_POLL_INTERVAL);
      }
    }

    if (attempts >= CONFIG.MAX_POLL_ATTEMPTS && currentStatus < 4) {
      console.log('\n⏱️  Polling timeout reached.');
      console.log('   The swap is still in progress. Private swaps can take up to 45 minutes.');
      console.log('   You can continue monitoring using:');
      console.log(`   Houdini ID: ${swap.houdiniId}`);
      console.log('\n   Check status via API:');
      console.log(`   GET ${CONFIG.API_BASE_URL}/status?id=${swap.houdiniId}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.message.includes('API Error')) {
      console.error('\nPossible causes:');
      console.error('• Invalid API credentials');
      console.error('• Invalid token symbols');
      console.error('• Amount too small or too large');
      console.error('• Pair not available for private routing');
      console.error('• Network connectivity issues');
      console.error('• API service unavailable');
    }

    process.exit(1);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    Script Completed                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateConfig(): void {
  const errors: string[] = [];

  if (!CONFIG.API_KEY) {
    errors.push('HOUDINI_API_KEY not set in .env file');
  }

  if (!CONFIG.API_SECRET) {
    errors.push('HOUDINI_API_SECRET not set in .env file');
  }

  if (!CONFIG.SWAP.amount || parseFloat(CONFIG.SWAP.amount) <= 0) {
    errors.push('Invalid swap amount');
  }

  if (!CONFIG.SWAP.addressTo || CONFIG.SWAP.addressTo.length < 20) {
    errors.push('Invalid destination address');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration errors:\n');
    errors.forEach(err => console.error(`   • ${err}`));
    console.error('\nPlease create a .env file with your API credentials.');
    console.error('See .env.example for the required format.\n');
    process.exit(1);
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

// Validate configuration before running
validateConfig();

// Execute the private swap flow
executePrivateSwap();
