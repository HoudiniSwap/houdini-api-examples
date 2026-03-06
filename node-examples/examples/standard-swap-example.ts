/**
 * Houdini Standard Swap - Complete Example (TypeScript)
 *
 * This script demonstrates a complete standard swap flow:
 * 1. Get a quote for ETH → USDC
 * 2. Create a swap order
 * 3. Monitor the swap status
 *
 * Requirements:
 * - Node.js 18+ (for native fetch support)
 * - Valid Houdini API credentials in .env file
 *
 * Usage:
 * 1. Copy .env.example to .env and set your API credentials
 * 2. Run: yarn run:standard
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

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

interface StandardSwapConfig {
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

const CONFIG: StandardSwapConfig = {
  API_BASE_URL: 'https://api-partner.houdiniswap.com',
  API_KEY: process.env.HOUDINI_API_KEY || '',
  API_SECRET: process.env.HOUDINI_API_SECRET || '',

  // Swap parameters
  SWAP: {
    amount: '1',                   // Amount to swap (0.01 ETH)
    from: 'ETH',                      // Source token symbol
    to: 'USDC',                       // Destination token symbol
    addressTo: '0xb7dE6b6eEBF7401aFea5a49D6405C9048fEf2d40', // Destination address
    receiverTag: '',                  // Memo/tag if required (empty for most tokens)
    anonymous: false,
  },

  // User context (required headers)
  USER: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timezone: 'America/New_York'
  },

  // Polling configuration
  STATUS_POLL_INTERVAL: 10000,        // Check status every 10 seconds
  MAX_POLL_ATTEMPTS: 180,             // Max 30 minutes of polling (180 * 10s)
};

// ============================================================================
// MAIN SWAP FLOW
// ============================================================================

async function executeStandardSwap(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        Houdini Standard Swap - Complete Example               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // ========================================================================
    // STEP 1: Get Quote
    // ========================================================================
    console.log('📊 STEP 1: Requesting quote...');
    console.log(`   Swapping: ${CONFIG.SWAP.amount} ${CONFIG.SWAP.from} → ${CONFIG.SWAP.to}\n`);

    const quote = await fetchFromHoudini<QuoteResponse>('/quote', {
      params: CONFIG.SWAP
    });

    console.log('✅ Quote received:');
    console.log(`   Amount In:  ${quote.amountIn} ${CONFIG.SWAP.from}`);
    console.log(`   Amount Out: ${quote.amountOut} ${CONFIG.SWAP.to}`);
    console.log(`   USD Value:  $${quote.amountOutUsd.toFixed(2)}`);
    console.log(`   Type:       ${quote.type}`);
    console.log(`   ETA:        ${quote.duration} minutes`);
    console.log(`   Quote ID:   ${quote.quoteId}\n`);

    // ========================================================================
    // STEP 2: Create Swap Order
    // ========================================================================
    console.log('🔄 STEP 2: Creating swap order...\n');

    const swapRequest = {
      amount: parseFloat(CONFIG.SWAP.amount),
      from: CONFIG.SWAP.from,
      to: CONFIG.SWAP.to,
      addressTo: CONFIG.SWAP.addressTo,
      receiverTag: CONFIG.SWAP.receiverTag,
      anonymous: false,  // Standard swap (not private)
      ip: CONFIG.USER.ip,
      userAgent: CONFIG.USER.userAgent,
      timezone: CONFIG.USER.timezone,
    };

    const swap = await fetchFromHoudini<SwapOrder>('/exchange', {
      method: 'POST',
      body: swapRequest,
    });

    console.log('✅ Swap order created:');
    console.log(`   Houdini ID:     ${swap.houdiniId}`);
    console.log(`   Status:         ${getStatusName(swap.status)} (${swap.status})`);
    console.log(`   Created:        ${formatTime(swap.created)}`);
    console.log(`   Expires:        ${formatTime(swap.expires)}\n`);

    console.log('💰 DEPOSIT INSTRUCTIONS:');
    console.log(`   ┌─────────────────────────────────────────────────────────┐`);
    console.log(`   │ Send EXACTLY ${swap.inAmount} ${swap.inSymbol} to:                    │`);
    console.log(`   │ ${swap.senderAddress}         │`);
    console.log(`   │                                                         │`);
    console.log(`   │ ⚠️  IMPORTANT:                                          │`);
    console.log(`   │ • Send exact amount: ${swap.inAmount} ${swap.inSymbol}                │`);
    console.log(`   │ • Before expiration: ${formatTime(swap.expires)}       │`);
    console.log(`   │ • Wrong amount or late deposit will cause issues       │`);
    console.log(`   └─────────────────────────────────────────────────────────┘\n`);

    console.log(`   You will receive: ${swap.outAmount} ${swap.outSymbol}`);
    console.log(`   Destination:      ${swap.receiverAddress}\n`);

    // ========================================================================
    // STEP 3: Monitor Swap Status
    // ========================================================================
    console.log('👀 STEP 3: Monitoring swap status...');
    console.log('   (Polling every 10 seconds until completion)\n');

    let attempts = 0;
    let currentStatus = swap.status;
    let lastStatus: number | null = null;

    while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
      attempts++;

      // Fetch current status
      const status = await fetchFromHoudini<SwapStatus>('/status', {
        params: { id: swap.houdiniId }
      });

      currentStatus = status.status;

      // Only log if status changed
      if (currentStatus !== lastStatus) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Status: ${getStatusName(currentStatus)} (${currentStatus})`);

        // Show detailed status for active swaps
        if (status.inStatus !== undefined) {
          console.log(`              Input leg: ${status.inStatus}`);
        }
        if (status.outStatus !== undefined) {
          console.log(`              Output leg: ${status.outStatus}`);
        }

        lastStatus = currentStatus;
      }

      // Check for terminal states
      if (currentStatus === 4) {
        // COMPLETED
        console.log('\n✅ SUCCESS! Swap completed successfully!');
        console.log(`   Final amount: ${status.outAmount} ${status.outSymbol}`);
        console.log(`   Destination:  ${status.receiverAddress}`);
        if (status.txHash) {
          console.log(`   TX Hash:      ${status.txHash}`);
        }
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
        console.log('   Please contact support for assistance.');
        break;
      } else if (currentStatus === 7) {
        // REFUNDED
        console.log('\n💰 Swap was refunded.');
        if (status.message) {
          console.log(`   Reason: ${status.message}`);
        }
        break;
      } else if (currentStatus === 8) {
        // DELETED
        console.log('\n⚠️  Order was deleted from the system.');
        break;
      }

      // Wait before next poll (only if not terminal state)
      if (currentStatus < 4) {
        await sleep(CONFIG.STATUS_POLL_INTERVAL);
      }
    }

    if (attempts >= CONFIG.MAX_POLL_ATTEMPTS && currentStatus < 4) {
      console.log('\n⏱️  Polling timeout reached.');
      console.log('   The swap is still in progress. You can continue monitoring using:');
      console.log(`   Houdini ID: ${swap.houdiniId}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
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

// Execute the swap flow
executeStandardSwap();
