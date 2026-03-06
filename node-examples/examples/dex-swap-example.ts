/**
 * Houdini DEX Swap - Complete Example (TypeScript)
 *
 * This script demonstrates a complete DEX swap flow:
 * 1. Get a quote for ETH → USDT (on-chain)
 * 2. Check approvals and signatures needed
 * 3. Create a swap order
 * 4. Broadcast transactio=
 * 5. Confirm transaction with Houdini
 * 6. Monitor the swap status
 *
 * Requirements:
 * - Node.js 18+ (for native fetch support)
 * - Valid Houdini API credentials in .env file
 * - For real transactions: Wallet private key and sufficient funds
 *
 * Usage:
 * 1. Copy .env.example to .env and set your API credentials
 * 2. (Optional) Set WALLET_PRIVATE_KEY for real txs
 * 3. Run: yarn run:dex
 *
 */

import dotenv from 'dotenv';
import type { Hex } from 'viem';
import type {
  DexQuoteResponse,
  DexApproveResponse,
  DexExchangeResponse,
  SwapStatus,
  Signature,
  SignatureObject,
  ChainSignatureResponse,
  TransactionData,
} from '../src/types';
import {
  createWallet,
  sendTransaction,
  getExplorerUrl,
  validatePrivateKey,
} from '../src/wallet';
import { 
  getStatusName, 
  sleep, 
  fetchFromHoudini, 
} from '../src/helpers';

dotenv.config();

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

interface DexSwapConfig {
  API_BASE_URL: string;
  API_KEY: string;
  API_SECRET: string;
  WALLET_PRIVATE_KEY: string;
  USER: {
    ip: string;
    userAgent: string;
    timezone: string;
  };
  DEVICE: {
    deviceInfo: string;
    isMobile: boolean;
    walletInfo: string;
  };
  STATUS_POLL_INTERVAL: number;
  MAX_POLL_ATTEMPTS: number;
}

const CONFIG: DexSwapConfig = {
  API_BASE_URL: 'https://api-partner.houdiniswap.com',
  API_KEY: process.env.HOUDINI_API_KEY || '',
  API_SECRET: process.env.HOUDINI_API_SECRET || '',
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || '',

  // User context (required headers)
  USER: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timezone: 'America/New_York'
  },

  // Device/wallet info
  DEVICE: {
    deviceInfo: 'web',
    isMobile: false,
    walletInfo: 'MetaMask',
  },

  // Polling configuration
  STATUS_POLL_INTERVAL: 10000,        // Check status every 10 seconds
  MAX_POLL_ATTEMPTS: 180,             // Max 30 minutes of polling

};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Broadcast transaction
 */
async function broadcastTransaction(txData: TransactionData, chainId: number): Promise<string> {
  try {
    // Validate and create wallet
    const privateKey = validatePrivateKey(CONFIG.WALLET_PRIVATE_KEY);
    const { walletClient, publicClient, account, chain } = createWallet(privateKey, chainId);

    console.log(`      • From: ${account.address}`);
    console.log(`      • To: ${txData.to}`);
    console.log(`      • Chain ID: ${chainId}`);
    console.log(`      • Data: ${txData.data.substring(0, 66)}...`);
    console.log(`      • Value: ${txData.value || '0'}`);
    console.log('');

    // Send transaction
    const { hash } = await sendTransaction(walletClient, publicClient, {
      to: txData.to as Hex,
      data: txData.data as Hex,
      value: 0n,
      account, // Pass the full account object, not just the address
      chain
    });

    // Show explorer link
    const explorerUrl = getExplorerUrl(chainId, hash);
    console.log(`\n      🔍 View on Explorer: ${explorerUrl}\n`);

    return hash;
  } catch (error) {
    console.error('   ❌ Transaction broadcast failed:', error);
    throw error;
  }
}

/**
 * Process signatures (including chained signatures)
 */
async function processSignatures(
  signatures: Signature[],
  quoteData: { route: any; swap: string },
  swapParams: { tokenIdFrom: string; tokenIdTo: string; addressFrom: string },
  chainId: number,
): Promise<SignatureObject[]> {
  if (!signatures || signatures.length === 0) return [];

  console.log(`   Found ${signatures.length} signature(s) to process\n`);
  const results: SignatureObject[] = [];
  console.log('signatures', signatures)
  // Create wallet for signing
  const privateKey = validatePrivateKey(CONFIG.WALLET_PRIVATE_KEY);
  const { walletClient, account } = createWallet(privateKey, chainId);

  for (const sig of signatures) {
    console.log(`   Processing ${sig.type} signature...`);

    // The signature data is nested under sig.data
    const typedData = sig.data;

    // Sign the typed data using the wallet
    const signature = await walletClient.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      account
    });

    console.log(`   ✅ Signed with signature: ${signature.substring(0, 20)}...`);

    const signatureObject: SignatureObject = {
      signature,
      key: sig.key,
      swapRequiredMetadata: sig.swapRequiredMetadata
    };

    // Handle CHAINED signatures (e.g., Cowswap)
    if (sig.type === 'CHAINED' && !sig.isComplete) {
      console.log('   ⛓️  Chained signature detected - fetching next...');

      const nextSigResponse = await fetchFromHoudini<ChainSignatureResponse>('/chainSignatures', {
        method: 'POST',
        body: {
          tokenIdFrom: swapParams.tokenIdFrom,
          tokenIdTo: swapParams.tokenIdTo,
          addressFrom: swapParams.addressFrom,
          route: quoteData.route,
          swap: quoteData.swap,
          previousSignature: signatureObject,
          signatureKey: sig.key,
          signatureStep: sig.step
        }
      });

      const { chainSignatures } = nextSigResponse;

      if (chainSignatures?.length) {
        const chainResults = await processSignatures(chainSignatures, quoteData, swapParams, chainId);
        if (chainResults.length > 0) {
          results.push(chainResults[chainResults.length - 1]);
        }
      }
    } else {
      results.push(signatureObject);
    }

    console.log('   ✅ Signature processed\n');
  }

  return results;
}

// ============================================================================
// MAIN DEX SWAP FLOW
// ============================================================================

interface SwapParams {
  tokenIdFrom: string;
  tokenIdTo: string;
  amount: number;
  addressFrom: string;
  addressTo: string;
  slippage: number;
  chainId: number;
  swap?: string; // Optional: Force a specific DEX provider
}

async function executeDexSwap(swapParams: SwapParams): Promise<void> {
  const params = swapParams;

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          Houdini DEX Swap - Complete Example                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (params.swap) {
    console.log(`🎯 Target DEX: ${params.swap}\n`);
  }

  try {
    // ========================================================================
    // STEP 1: Get DEX Quote
    // ========================================================================
    console.log('📊 STEP 1: Requesting DEX quote...');
    console.log(`   Amount: ${params.amount} (token swap)\n`);

    const quotes = await fetchFromHoudini<DexQuoteResponse[]>('/dexQuote', {
      params: {
        tokenIdFrom: params.tokenIdFrom,
        tokenIdTo: params.tokenIdTo,
        amount: params.amount,
      }
    });

    // Filter by specific DEX if requested
    let quote: DexQuoteResponse;
    if (params.swap) {
      const filtered = quotes.filter(q =>
        q.swap.toUpperCase() === params.swap!.toUpperCase()
      );
      if (filtered.length === 0) {
        throw new Error(`No quotes found for DEX: ${params.swap}`);
      }
      quote = filtered[0];
      console.log(`   ✓ Found quote for ${params.swap}`);
    } else {
      quote = quotes[0];
    }
    console.log('✅ Quote received:');
    console.log(`   DEX Provider: ${quote.swap}`);
    console.log(`   Amount Out:   ${quote.amountOut}`);
    console.log(`   USD Value:    $${quote.amountOutUsd?.toFixed(2) || 'N/A'}`);
    console.log(`   Quote ID:     ${quote.quoteId}\n`);

    // ========================================================================
    // STEP 2: Check Approvals and Signatures
    // ========================================================================
    console.log('🔍 STEP 2: Checking approvals and signatures...\n');

    const approvalCheck = await fetchFromHoudini<DexApproveResponse>('/dexApprove', {
      method: 'POST',
      body: {
        tokenIdFrom: params.tokenIdFrom,
        tokenIdTo: params.tokenIdTo,
        amount: params.amount,
        addressFrom: params.addressFrom,
        swap: quote.swap,
        route: quote.raw
      }
    });

    const { approvals, signatures } = approvalCheck;

    console.log('✅ Requirements checked:');
    console.log(`   Approvals needed: ${approvals?.length || 0}`);
    console.log(`   Signatures needed: ${signatures?.length || 0}\n`);

    // ========================================================================
    // STEP 3: Handle Approvals (if needed)
    // ========================================================================
    if (approvals && approvals.length > 0) {
      console.log('⚠️  STEP 3: Token approvals required\n');

      for (let i = 0; i < approvals.length; i++) {
        const approval = approvals[i];
        console.log(`   Approval ${i + 1}/${approvals.length}:`);
        console.log(`   • Token Contract: ${approval.to}`);
        console.log(`   • Data: ${approval.data.substring(0, 66)}...`);

        // Broadcast approval transaction
        const approvalTxHash = await broadcastTransaction({
          to: approval.to,
          data: approval.data,
          value: approval.value || '0'
        }, params.chainId);

        console.log(`   ✅ Approval transaction broadcast: ${approvalTxHash}\n`);
      }

      // Wait for approval confirmation
      console.log('   ⏱️  Checking allowance confirmation...\n');

      // Poll until allowance is confirmed
      let attempts = 0;
      const maxAttempts = 30; // Max 5 minutes (30 * 10 seconds)
      let hasAllowance = false;
      console.log('quote', quote, params)
      while (attempts < maxAttempts) {
        const allowanceCheck = await fetchFromHoudini<boolean>('/dexHasEnoughAllowance', {
          method: 'POST',
          body: {
            tokenIdFrom: params.tokenIdFrom,
            tokenIdTo: params.tokenIdTo,
            amount: params.amount,
            addressFrom: params.addressFrom,
            swap: quote.swap,
            route: quote.raw
          }
        });
        console.log('allowanceCheck', allowanceCheck)
        if (allowanceCheck === true) {
          hasAllowance = true;
          break;
        }

        attempts++;
        console.log(`   ⏳ Waiting for allowance confirmation (attempt ${attempts}/${maxAttempts})...`);
        await sleep(30000); // Wait 30 seconds before next check
      }

      if (hasAllowance) {
        console.log('   ✅ Allowance confirmed!\n');
      } else {
        throw new Error('Allowance confirmation timeout - please check transactions and try again');
      }
    } else {
      console.log('✅ STEP 3: No approvals needed - skipping\n');
    }

    // ========================================================================
    // STEP 4: Handle Signatures (if needed)
    // ========================================================================
    let collectedSignatures: SignatureObject[] = [];

    if (signatures && signatures.length > 0) {
      console.log('✍️  STEP 4: Processing signatures...\n');
      collectedSignatures = await processSignatures(signatures, {
        route: quote.raw,
        swap: quote.swap
      }, {
        tokenIdFrom: params.tokenIdFrom,
        tokenIdTo: params.tokenIdTo,
        addressFrom: params.addressFrom
      },
      params.chainId
    );
      console.log(`✅ Collected ${collectedSignatures.length} signature(s)\n`);
    } else {
      console.log('✅ STEP 4: No signatures needed - skipping\n');
    }

    // ========================================================================
    // STEP 5: Execute DEX Swap
    // ========================================================================
    console.log('🔄 STEP 5: Creating DEX swap order...\n');

    const swapRequest = {
      tokenIdFrom: params.tokenIdFrom,
      tokenIdTo: params.tokenIdTo,
      amount: params.amount,
      addressFrom: params.addressFrom,
      addressTo: params.addressTo,
      route: quote.raw,
      swap: quote.swap,
      quoteId: quote.quoteId,
      signatures: collectedSignatures,
      destinationTag: '',
      deviceInfo: CONFIG.DEVICE.deviceInfo,
      isMobile: CONFIG.DEVICE.isMobile,
      walletInfo: CONFIG.DEVICE.walletInfo,
      slippage: params.slippage,
    };

    const order = await fetchFromHoudini<DexExchangeResponse>('/dexExchange', {
      method: 'POST',
      body: swapRequest,
    });
    // const { order } = swapResponse;

    // console.log('✅ Swap order created:');
    // console.log(`   Houdini ID:  ${order.houdiniId}`);
    // console.log(`   Status:      ${getStatusName(order.status)} (${order.status})`);
    // console.log(`   Off-chain:   ${order.metadata.offChain}\n`);

    // // ========================================================================
    // STEP 6: Broadcast Transaction and Confirm
    // ========================================================================
    let txHash: string | undefined;

    if (order.metadata.offChain) {
      console.log('🌐 STEP 6: Off-chain swap detected (e.g., Cowswap)');
      console.log('   Backend will handle transaction execution\n');

      // Still need to confirm with Houdini
      await fetchFromHoudini('/dexConfirmTx', {
        method: 'POST',
        body: {
          id: order.houdiniId,
          txHash: undefined  // No txHash for off-chain swaps
        }
      });

      console.log('✅ Off-chain swap confirmed with Houdini\n');
    } else {
      console.log('⛓️  STEP 6: On-chain swap - broadcasting transaction...\n');

      // Broadcast transaction
      txHash = await broadcastTransaction({
        to: order.metadata.to!,
        data: order.metadata.data!,
        value: order.metadata.value || '0'
      }, params.chainId);

      console.log(`   ✅ Transaction broadcast: ${txHash}\n`);

      // Confirm with Houdini
      await fetchFromHoudini('/dexConfirmTx', {
        method: 'POST',
        body: {
          id: order.houdiniId,
          txHash: txHash
        }
      });

      console.log('   ✅ Transaction confirmed with Houdini\n');
    }

    // ========================================================================
    // STEP 7: Monitor Swap Status
    // ========================================================================
    console.log('👀 STEP 7: Monitoring swap status...');
    console.log('   (Polling every 10 seconds until completion)\n');

    let attempts = 0;
    let currentStatus = order.status;
    let lastStatus: number | null = null;

    while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
      attempts++;

      // Fetch current status
      const status = await fetchFromHoudini<SwapStatus>('/status', {
        params: { id: order.houdiniId }
      });

      currentStatus = status.status;

      // Only log if status changed
      if (currentStatus !== lastStatus) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Status: ${getStatusName(currentStatus)} (${currentStatus})`);

        if (status.txHash && status.txHash !== txHash) {
          console.log(`              TX Hash: ${status.txHash}`);
        }

        lastStatus = currentStatus;
      }

      // Check for terminal states
      if (currentStatus === 4) {
        // COMPLETED
        console.log('\n✅ SUCCESS! DEX swap completed!');
        if (status.txHash) {
          console.log(`   Transaction: ${status.txHash}`);
        }
        console.log(`   Amount received: ${status.outAmount || 'N/A'} ${status.outSymbol || ''}`);
        break;
      } else if (currentStatus === 6) {
        // FAILED
        console.log('\n❌ Swap failed!');
        if (status.message) {
          console.log(`   Error: ${status.message}`);
        }
        console.log('   Please check transaction and contact support if needed.');
        break;
      } else if (currentStatus === 5) {
        // EXPIRED
        console.log('\n⏰ Order expired.');
        break;
      }

      // Wait before next poll
      if (currentStatus < 4) {
        await sleep(CONFIG.STATUS_POLL_INTERVAL);
      }
    }

    if (attempts >= CONFIG.MAX_POLL_ATTEMPTS && currentStatus < 4) {
      console.log('\n⏱️  Polling timeout reached.');
      console.log('   Swap is still processing. Check status manually:');
      console.log(`   Houdini ID: ${order.houdiniId}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.message.includes('API Error')) {
      console.error('\nPossible causes:');
      console.error('• Invalid API credentials');
      console.error('• Invalid token IDs (verify with /dexTokens endpoint)');
      console.error('• Insufficient wallet balance');
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

  try {
    validatePrivateKey(CONFIG.WALLET_PRIVATE_KEY);
  } catch (error) {
    errors.push(`Invalid WALLET_PRIVATE_KEY format: ${error instanceof Error ? error.message : String(error)}`);
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
// HELPER FUNCTIONS FOR DIFFERENT DEX FLOWS
// ============================================================================

/**
 * Execute swap with CowSwap (off-chain flow)
 * CowSwap uses off-chain order matching, so no user transaction is needed
 */
async function executeCowSwapFlow(params: SwapParams): Promise<void> {
  console.log('🐮 CowSwap Flow - Off-chain order matching\n');
  await executeDexSwap({
    ...params,
    swap: 'cs', // Force CowSwap provider
  });
}

/**
 * Execute swap with Sushi (approval only flow)
 * Sushi typically requires token approval but no signatures
 */
async function executeSushiFlow(params: SwapParams): Promise<void> {
  await executeDexSwap({
    ...params,
    swap: 'su', // Force Sushi provider
  });
}

/**
 * Execute swap with Uniswap (approval + signature flow)
 * Uniswap may require both token approval and permit signatures
 */
async function executeUniswapFlow(params: SwapParams): Promise<void> {
  console.log('🦄 Uniswap Flow - Approval + Signature flow\n');
  await executeDexSwap({
    ...params,
    swap: 'un', // Force Uniswap provider
  });
}

/**
 * Execute swap with best available quote (auto-select DEX)
 * Lets the backend choose the best DEX based on price and liquidity
 */
async function executeBestQuoteFlow(params: SwapParams): Promise<void> {
  console.log('🎯 Best Quote Flow - Auto-selecting best DEX\n');
  await executeDexSwap(params); // Don't specify swap provider
}

// ============================================================================
// ENTRY POINT
// ============================================================================

// Validate configuration before running
validateConfig();

// ============================================================================
// EXAMPLE USAGE - Customize the parameters below
// ============================================================================

// Example: Sushi swap on Base chain (USDC -> ETH)
// executeSushiFlow({
//   amount: 15,
//   tokenIdFrom: '6689b757c90e45f3b3e51805', // USDC BASE
//   tokenIdTo: '6689b73ec90e45f3b3e51590',   // ETH BASE
//   addressFrom: process.env.EVM_WALLET_ADDRESS || '',
//   addressTo: process.env.EVM_WALLET_ADDRESS || '',
//   slippage: 0.5,
//   chainId: 8453, // Base chain
// });

// ============================================================================
// More examples (uncomment to use):
// ============================================================================

// Example: CowSwap (off-chain flow) on Base
executeCowSwapFlow({
  amount: 15,
  tokenIdFrom: '6689b757c90e45f3b3e51805', // USDC BASE
  tokenIdTo: '6689b73ec90e45f3b3e51590',   // ETH BASE
  addressFrom: process.env.EVM_WALLET_ADDRESS || '',
  addressTo: process.env.EVM_WALLET_ADDRESS || '',
  slippage: 0.5,
  chainId: 8453, // Base chain
});

// Example: Uniswap (approval + signature flow) on Base
// executeUniswapFlow({
//   amount: 15,
//   tokenIdFrom: '6689b757c90e45f3b3e51805', // USDC BASE
//   tokenIdTo: '6689b73ec90e45f3b3e51590',   // ETH BASE
//   addressFrom: process.env.EVM_WALLET_ADDRESS || '',
//   addressTo: process.env.EVM_WALLET_ADDRESS || '',
//   slippage: 0.5,
//   chainId: 8453, // Base chain
// });

// Example: Best quote (auto-select DEX)
// executeBestQuoteFlow({
//   amount: 0.01,
//   tokenIdFrom: '6689b73ec90e45f3b3e51566', // ETH
//   tokenIdTo: '6689b73ec90e45f3b3e51553',   // USDT
//   addressFrom: process.env.EVM_WALLET_ADDRESS || '',
//   addressTo: process.env.EVM_WALLET_ADDRESS || '',
//   slippage: 0.5,
//   chainId: 1, // Ethereum
// });

// Example: Direct call with custom DEX
// executeDexSwap({
//   amount: 0.01,
//   tokenIdFrom: '6689b73ec90e45f3b3e51566', // ETH
//   tokenIdTo: '6689b73ec90e45f3b3e51553',   // USDT
//   addressFrom: process.env.EVM_WALLET_ADDRESS || '',
//   addressTo: process.env.EVM_WALLET_ADDRESS || '',
//   slippage: 1.0,
//   chainId: 1, // Ethereum
//   swap: 'un', // Force Uniswap
// });
