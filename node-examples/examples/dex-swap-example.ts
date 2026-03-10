/**
 * Houdini DEX Swap - Complete Example (TypeScript, API v2)
 *
 * Flow:
 * 1. GET /v2/quotes — select quote with type: "dex"
 * 2. If requiresApproval: POST /v2/dex/approve — get approval txs + signatures
 *    a. Broadcast each approval transaction
 *    b. Re-poll /v2/dex/approve until approvals array is empty (allowance confirmed)
 *    c. Sign each EIP-712 signature (including chained signatures)
 * 3. POST /v2/exchanges — create order with quoteId, addresses, signatures
 * 4. Broadcast transaction (order.tx.to/data/value) or let Houdini handle (offChain)
 * 5. POST /v2/dex/confirmTx — notify Houdini of tx hash
 * 6. GET /v2/orders/{houdiniId} — poll until FINISHED
 *
 * Usage: yarn run:dex
 */

import dotenv from 'dotenv';
import type { Hex } from 'viem';
import {
  createWallet,
  sendTransaction,
  getExplorerUrl,
  validatePrivateKey,
} from '../src/wallet';
import { sleep, fetchFromHoudini, formatTime } from '../src/helpers';

dotenv.config();

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  SWAP: {
    amount: '15',
    // Use token IDs from GET /v2/tokens — not symbols.
    fromTokenId: '6689b757c90e45f3b3e51805',  // USDC on Base
    toTokenId:   '6689b73ec90e45f3b3e51590',  // ETH on Base
    addressFrom: process.env.EVM_WALLET_ADDRESS || '',
    addressTo:   process.env.EVM_WALLET_ADDRESS || '',
    slippage: 0.5,
    chainId: 8453,  // Base
  },
  STATUS_POLL_INTERVAL: 10_000,  // 10 seconds
  MAX_POLL_ATTEMPTS: 180,        // up to 30 minutes
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
  requiresApproval?: boolean;
  supportsSignatures?: boolean;
  filtered?: boolean;
  offChain?: boolean;
  error?: string;
}

interface ApprovalTx {
  to: string;
  data: string;
  value?: string;
}

interface Signature {
  type: string;
  key: string;
  step?: number;
  totalSteps?: number;
  isComplete?: boolean;
  swapRequiredMetadata?: any;
  data: {
    domain: any;
    types: any;
    primaryType: string;
    message: any;
  };
}

interface SignatureObject {
  signature: string;
  key: string;
  swapRequiredMetadata?: any;
}

interface V2ApproveResponse {
  approvals: ApprovalTx[];
  signatures: Signature[];
}

interface V2Order {
  houdiniId: string;
  created: string;
  expires: string;
  depositAddress?: string;
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
  isDex?: boolean;
  offChain?: boolean;
  tx?: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function broadcastTx(txData: { to: string; data: string; value?: string }, chainId: number): Promise<string> {
  const privateKey = validatePrivateKey(process.env.WALLET_PRIVATE_KEY || '');
  const { walletClient, publicClient, account, chain } = createWallet(privateKey, chainId);

  console.log(`   From:  ${account.address}`);
  console.log(`   To:    ${txData.to}`);
  console.log(`   Value: ${txData.value || '0'}`);

  const { hash } = await sendTransaction(walletClient, publicClient, {
    to: txData.to as Hex,
    data: txData.data as Hex,
    value: BigInt(txData.value || '0'),
    account,
    chain,
  });

  const explorerUrl = getExplorerUrl(chainId, hash);
  console.log(`   Explorer: ${explorerUrl}\n`);
  return hash;
}

async function processSignatures(
  signatures: Signature[],
  quoteId: string,
  addressFrom: string,
  chainId: number,
): Promise<SignatureObject[]> {
  if (!signatures || signatures.length === 0) return [];

  console.log(`   Processing ${signatures.length} signature(s)...`);
  const privateKey = validatePrivateKey(process.env.WALLET_PRIVATE_KEY || '');
  const { walletClient, account } = createWallet(privateKey, chainId);
  const results: SignatureObject[] = [];

  for (const sig of signatures) {
    console.log(`   Signing ${sig.type} signature (key: ${sig.key})...`);

    const signature = await walletClient.signTypedData({
      domain: sig.data.domain,
      types: sig.data.types,
      primaryType: sig.data.primaryType,
      message: sig.data.message,
      account,
    });

    console.log(`   Signed: ${signature.substring(0, 20)}...`);

    const sigObject: SignatureObject = {
      signature,
      key: sig.key,
      swapRequiredMetadata: sig.swapRequiredMetadata,
    };

    // Handle chained signatures
    if (sig.type === 'CHAINED' && !sig.isComplete) {
      console.log('   Chained signature — fetching next step...');

      const { chainSignatures } = await fetchFromHoudini<{ chainSignatures: Signature[] }>('/v2/dex/chainSignatures', {
        method: 'POST',
        body: {
          quoteId,
          addressFrom,
          previousSignature: sigObject,
          signatureKey: sig.key,
          signatureStep: sig.step,
        },
      });

      if (chainSignatures?.length) {
        const chainResults = await processSignatures(chainSignatures, quoteId, addressFrom, chainId);
        if (chainResults.length > 0) {
          results.push(chainResults[chainResults.length - 1]);
          continue;
        }
      }
    }

    results.push(sigObject);
  }

  return results;
}

// ============================================================================
// MAIN DEX SWAP FLOW
// ============================================================================

async function executeDexSwap(): Promise<void> {
  console.log('Houdini DEX Swap (API v2)\n');

  try {
    // ========================================================================
    // STEP 1: Get Quotes — select dex quote
    // ========================================================================
    console.log('STEP 1: Requesting DEX quotes...');
    console.log(`   Amount: ${CONFIG.SWAP.amount} (from ${CONFIG.SWAP.fromTokenId} -> ${CONFIG.SWAP.toTokenId})\n`);

    const { quotes } = await fetchFromHoudini<{ quotes: V2Quote[] }>('/v2/quotes', {
      params: {
        amount: CONFIG.SWAP.amount,
        from: CONFIG.SWAP.fromTokenId,
        to: CONFIG.SWAP.toTokenId,
        slippage: String(CONFIG.SWAP.slippage),
      },
    });

    const dexQuotes = quotes.filter(q => q.type === 'dex' && !q.error && !q.filtered && q.amountOut > 0);
    if (dexQuotes.length === 0) {
      throw new Error('No DEX quotes available for this pair. Try a different token pair or amount.');
    }

    // Pick best quote (highest amountOut)
    const quote = dexQuotes.sort((a, b) => b.amountOut - a.amountOut)[0];

    console.log('DEX quote selected:', quote);
    console.log(`   Provider:    ${quote.swapName ?? quote.swap}`);
    console.log(`   Amount In:   ${quote.amountIn}`);
    console.log(`   Amount Out:  ${quote.amountOut}`);
    if (quote.amountOutUsd != null) console.log(`   USD Value:   $${quote.amountOutUsd.toFixed(2)}`);
    console.log(`   Quote ID:    ${quote.quoteId}`);
    console.log(`   Approval:    ${quote.requiresApproval ? 'Required' : 'Not required'}\n`);

    // ========================================================================
    // STEP 2: Approvals & Signatures (skip if requiresApproval is false)
    // ========================================================================
    let collectedSignatures: SignatureObject[] = [];

    if (quote.requiresApproval === false) {
      console.log('STEP 2: Approval not required — skipping\n');
    } else {
      console.log('STEP 2: Checking approvals and signatures...');

      const approveResponse = await fetchFromHoudini<V2ApproveResponse>('/v2/dex/approve', {
        method: 'POST',
        body: {
          quoteId: quote.quoteId,
          addressFrom: CONFIG.SWAP.addressFrom,
        },
      });

      const { approvals, signatures } = approveResponse;
      console.log(`   Approvals needed:  ${approvals?.length || 0}`);
      console.log(`   Signatures needed: ${signatures?.length || 0}\n`);

      // ======================================================================
      // STEP 2a: Broadcast approval transactions
      // ======================================================================
      if (approvals && approvals.length > 0) {
        console.log('STEP 2a: Broadcasting approval transactions...');

        for (let i = 0; i < approvals.length; i++) {
          const approval = approvals[i];
          console.log(`   Approval ${i + 1}/${approvals.length}:`);
          const txHash = await broadcastTx(approval, CONFIG.SWAP.chainId);
          console.log(`   Approval tx: ${txHash}\n`);
        }

        // ====================================================================
        // STEP 2b: Poll until allowance is confirmed (re-poll /v2/dex/approve)
        // ====================================================================
        console.log('STEP 2b: Waiting for allowance confirmation...');

        let allowanceConfirmed = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          await sleep(15_000);

          const recheckResponse = await fetchFromHoudini<V2ApproveResponse>('/v2/dex/approve', {
            method: 'POST',
            body: {
              quoteId: quote.quoteId,
              addressFrom: CONFIG.SWAP.addressFrom,
            },
          });

          if (!recheckResponse.approvals || recheckResponse.approvals.length === 0) {
            allowanceConfirmed = true;
            console.log('   Allowance confirmed!\n');
            break;
          }

          console.log(`   Still waiting... (attempt ${attempt + 1}/30)`);
        }

        if (!allowanceConfirmed) {
          throw new Error('Allowance confirmation timeout — check approval transactions and retry.');
        }
      }

      // ======================================================================
      // STEP 2c: Sign EIP-712 signatures
      // ======================================================================
      if (signatures && signatures.length > 0) {
        console.log('STEP 2c: Processing EIP-712 signatures...');
        collectedSignatures = await processSignatures(
          signatures,
          quote.quoteId,
          CONFIG.SWAP.addressFrom,
          CONFIG.SWAP.chainId,
        );
        console.log(`   Collected ${collectedSignatures.length} signature(s)\n`);
      } else {
        console.log('STEP 2c: No signatures needed — skipping\n');
      }
    }

    // ========================================================================
    // STEP 3: Create DEX Order
    // ========================================================================
    console.log('STEP 3: Creating DEX swap order...');

    const order = await fetchFromHoudini<V2Order>('/v2/exchanges', {
      method: 'POST',
      body: {
        quoteId: quote.quoteId,
        addressTo: CONFIG.SWAP.addressTo,
        addressFrom: CONFIG.SWAP.addressFrom,
        signatures: collectedSignatures,
      },
    });

    console.log('Order created:');
    console.log(`   Houdini ID: ${order.houdiniId}`);
    console.log(`   Status:     ${order.statusLabel}`);
    if (order.created) console.log(`   Created:    ${formatTime(order.created)}`);
    if (order.expires) console.log(`   Expires:    ${formatTime(order.expires)}\n`);

    // ========================================================================
    // STEP 4 & 5: Broadcast transaction + Confirm
    // ========================================================================
    let txHash: string | undefined;

    if (order.offChain) {
      console.log('STEP 4: Off-chain swap (e.g. CowSwap) — Houdini handles execution\n');
    } else if (order.tx) {
      console.log('STEP 4: Broadcasting on-chain transaction...');

      txHash = await broadcastTx(
        { to: order.tx.to, data: order.tx.data, value: order.tx.value },
        CONFIG.SWAP.chainId,
      );

      console.log(`   Tx hash: ${txHash}\n`);
    } else {
      console.log('STEP 4: No transaction data returned — skipping broadcast\n');
    }

    console.log('STEP 5: Confirming transaction with Houdini...');

    await fetchFromHoudini('/v2/dex/confirmTx', {
      method: 'POST',
      body: {
        id: order.houdiniId,
        txHash: txHash,
      },
    });

    console.log('   Confirmed!\n');

    // ========================================================================
    // STEP 6: Poll Order Status
    // ========================================================================
    console.log('STEP 6: Monitoring swap status...');
    console.log('   (Polling every 10 seconds)\n');

    let attempts = 0;
    let lastStatusLabel = '';

    while (attempts < CONFIG.MAX_POLL_ATTEMPTS) {
      attempts++;

      const current = await fetchFromHoudini<V2Order>(`/v2/orders/${order.houdiniId}`);

      if (current.statusLabel !== lastStatusLabel) {
        const ts = new Date().toLocaleTimeString();
        console.log(`[${ts}] ${current.statusLabel} (${current.status})`);
        lastStatusLabel = current.statusLabel;
      }

      if (current.status === 4) {
        console.log('\nSUCCESS! DEX swap completed.');
        console.log(`   Received: ${current.outAmount} ${current.outSymbol}`);
        console.log(`   To:       ${current.receiverAddress}`);
        if (current.transactionHash) {
          console.log(`   Tx Hash:  ${current.transactionHash}`);
          if (current.hashUrl) console.log(`   Explorer: ${current.hashUrl}`);
        }
        break;
      } else if (current.status === 5) {
        console.log('\nOrder expired.');
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
  if (!CONFIG.SWAP.addressFrom)        errors.push('EVM_WALLET_ADDRESS not set in .env (used as addressFrom/addressTo)');
  if (!CONFIG.SWAP.amount || parseFloat(CONFIG.SWAP.amount) <= 0) errors.push('Invalid swap amount');
  if (errors.length > 0) {
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}

validateConfig();
executeDexSwap();
