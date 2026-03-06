/**
 * Wallet utilities for DEX swaps using Viem
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Hash,
  type TransactionReceipt,
  type Chain,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, base, arbitrum, polygon, optimism } from 'viem/chains';

// ============================================================================
// Chain Configuration
// ============================================================================

/**
 * Get chain configuration by chain ID
 */
export function getChainById(chainId: number): Chain {
  const chains: Record<number, Chain> = {
    1: mainnet,
    8453: base,
    42161: arbitrum,
    137: polygon,
    10: optimism,
  };

  const chain = chains[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  return chain;
}

/**
 * Get RPC URL for a chain (from env or default public RPC)
 */
export function getRpcUrl(chainId: number): string {
  // Check environment variables first
  const envRpcUrls: Record<number, string | undefined> = {
    1: process.env.ETHEREUM_RPC_URL,
    8453: process.env.BASE_RPC_URL,
    42161: process.env.ARBITRUM_RPC_URL,
    137: process.env.POLYGON_RPC_URL,
    10: process.env.OPTIMISM_RPC_URL,
  };

  if (envRpcUrls[chainId]) {
    return envRpcUrls[chainId]!;
  }

  // Default public RPCs
  const defaultRpcUrls: Record<number, string> = {
    1: 'https://eth.llamarpc.com',
    8453: 'https://base-rpc.publicnode.com',
    42161: 'https://arb1.arbitrum.io/rpc',
    137: 'https://polygon-rpc.com',
    10: 'https://mainnet.optimism.io',
  };

  const rpcUrl = defaultRpcUrls[chainId];
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for chain ID: ${chainId}`);
  }

  return rpcUrl;
}

// ============================================================================
// Wallet Client Creation
// ============================================================================

/**
 * Create a wallet client from private key
 */
export function createWallet(privateKey: Hex, chainId: number): {
  walletClient: WalletClient;
  publicClient: PublicClient;
  account: ReturnType<typeof privateKeyToAccount>;
  chain: Chain;
} {
  const chain = getChainById(chainId);
  const rpcUrl = getRpcUrl(chainId);
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  return {
    walletClient,
    publicClient,
    account,
    chain
  };
}

// ============================================================================
// Transaction Functions
// ============================================================================

export interface TransactionParams {
  to: Hex;
  data: Hex;
  value?: bigint;
  gas?: bigint;
  account: any,
  chain: Chain
}

/**
 * Send a transaction and wait for confirmation
 */
export async function sendTransaction(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: TransactionParams
): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  const { to, data, value, gas, account, chain } = params;

  console.log('   📡 Sending transaction...');
  console.log(`      • To: ${to}`);
  console.log(`      • Data: ${data.substring(0, 66)}...`);
  console.log(`      • Value: ${value || 0n}`);

  // Send the transaction with account
  const hash = await walletClient.sendTransaction({
    account,
    to,
    data,
    value: value || 0n,
    gas,
    chain
  });

  console.log(`      • TX Hash: ${hash}`);
  console.log('   ⏳ Waiting for confirmation...\n');

  // Wait for transaction receipt
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  if (receipt.status === 'success') {
    console.log('   ✅ Transaction confirmed!');
    console.log(`      • Block: ${receipt.blockNumber}`);
    console.log(`      • Gas used: ${receipt.gasUsed}`);
  } else {
    console.log('   ❌ Transaction failed!');
    throw new Error('Transaction reverted');
  }

  return { hash, receipt };
}

/**
 * Monitor transaction status until confirmed
 */
export async function waitForTransaction(
  publicClient: PublicClient,
  hash: Hash,
  confirmations: number = 1
): Promise<TransactionReceipt> {
  console.log(`   ⏳ Monitoring transaction: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations,
  });

  if (receipt.status === 'success') {
    console.log('   ✅ Transaction confirmed!');
  } else {
    console.log('   ❌ Transaction failed!');
    throw new Error('Transaction reverted');
  }

  return receipt;
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  publicClient: PublicClient,
  account: Hex,
  params: Omit<TransactionParams, 'gas'>
): Promise<bigint> {
  const gas = await publicClient.estimateGas({
    account,
    to: params.to,
    data: params.data,
    value: params.value,
  });

  // Add 20% buffer
  return (gas * 120n) / 100n;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the current nonce for an account
 */
export async function getNonce(
  publicClient: PublicClient,
  address: Hex
): Promise<number> {
  return await publicClient.getTransactionCount({ address });
}

/**
 * Get the current gas price
 */
export async function getGasPrice(publicClient: PublicClient): Promise<bigint> {
  return await publicClient.getGasPrice();
}

/**
 * Get the balance of an account
 */
export async function getBalance(
  publicClient: PublicClient,
  address: Hex
): Promise<bigint> {
  return await publicClient.getBalance({ address });
}

/**
 * Format a blockchain explorer URL for a transaction
 */
export function getExplorerUrl(chainId: number, txHash: Hash): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io',
    8453: 'https://basescan.org',
    42161: 'https://arbiscan.io',
    137: 'https://polygonscan.com',
    10: 'https://optimistic.etherscan.io',
  };

  const explorerUrl = explorers[chainId];
  if (!explorerUrl) {
    return `Unknown chain ${chainId}`;
  }

  return `${explorerUrl}/tx/${txHash}`;
}

/**
 * Validate private key format
 */
export function validatePrivateKey(privateKey: string): Hex {
  // Remove 0x prefix if present
  const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

  // Check if it's a valid hex string of correct length (64 characters + 0x)
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('Invalid private key format. Must be a 64-character hex string.');
  }

  return key as Hex;
}
