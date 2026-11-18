/**
 * Checks to run on what the API asks the wallet to send or sign, before the
 * wallet sends or signs it. Each one throws with a readable message.
 *
 * The API builds approvals, typed data and swap transactions for you. Your
 * integration should still confirm they match what the user asked for: the
 * right token, an amount no larger than the swap, the chain the user is on and
 * the receiver the user picked.
 */

import { decodeFunctionData, erc20Abi, parseUnits } from 'viem';

/** Uniswap's Permit2 contract, the same address on every EVM chain. */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export interface SwapIntent {
  /** Contract address of the token being sold. */
  fromTokenAddress: string;
  fromTokenDecimals: number;
  /** Amount being sold, in token units (e.g. "15" for 15 USDC). */
  amount: string;
  /** Chain the swap starts on. */
  chainId: number;
  /** Wallet the user chose to receive the output. */
  addressTo: string;
}

const sameAddress = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Largest approval a swap of `amount` can need. The API rounds the amount up to
 * a whole token before encoding the approval, so allow that much and no more.
 */
export function maxApprovalAmount(intent: SwapIntent): bigint {
  const whole = Math.ceil(Number(intent.amount));
  return parseUnits(String(whole), intent.fromTokenDecimals);
}

/**
 * An approval must be an ERC-20 `approve` on the token being sold, carry no
 * native value, and allow at most the swap amount. A zero approval (resetting
 * an existing allowance first, as some tokens require) and an approval to
 * Permit2 (which still needs a signed permit per transfer) are also accepted.
 */
export function assertApproval(
  approval: { to: string; data: string; value?: string | number },
  intent: SwapIntent,
): void {
  if (!sameAddress(approval.to, intent.fromTokenAddress)) {
    throw new Error(`Approval targets ${approval.to}, not the token being sold (${intent.fromTokenAddress})`);
  }
  if (approval.value && BigInt(approval.value) !== BigInt(0)) {
    throw new Error('Approval transaction carries a native value');
  }

  let spender: string;
  let amount: bigint;
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data as `0x${string}` });
    if (decoded.functionName !== 'approve') throw new Error(decoded.functionName);
    [spender, amount] = decoded.args as [string, bigint];
  } catch {
    throw new Error('Approval transaction is not an ERC-20 approve call');
  }

  if (amount === BigInt(0) || sameAddress(spender, PERMIT2_ADDRESS)) return;

  const max = maxApprovalAmount(intent);
  if (amount > max) {
    throw new Error(`Approval of ${amount} exceeds the swap amount (at most ${max})`);
  }
}

/** Typed data must be bound to the chain the swap starts on, when it names one. */
export function assertTypedDataChain(
  typedData: { domain?: { chainId?: number | string | bigint } },
  intent: SwapIntent,
): void {
  const chainId = typedData.domain?.chainId;
  if (chainId === undefined || chainId === null) return;
  if (Number(chainId) !== intent.chainId) {
    throw new Error(`Signature request is for chain ${chainId}, but the swap starts on chain ${intent.chainId}`);
  }
}

/** The order must pay out to the receiver the user chose. */
export function assertReceiver(order: { receiverAddress?: string }, intent: SwapIntent): void {
  if (!sameAddress(order.receiverAddress, intent.addressTo)) {
    throw new Error(`Order pays out to ${order.receiverAddress}, not the chosen receiver ${intent.addressTo}`);
  }
}
