/**
 * Checks to run on what the API asks the wallet to send or sign, before the
 * wallet sends or signs it. Each one throws with a readable message.
 *
 * The API builds approvals, typed data and swap transactions for you. Your
 * integration should still confirm they match what the user asked for: the
 * right token, an amount bounded by the swap, the chain the user is on and the
 * receiver the user picked.
 *
 * What these checks cannot know on their own is which contracts are the real
 * routers, spenders and settlement contracts of the providers you route
 * through. List them in `trustedContracts` and every spender, swap target and
 * signature verifier is checked against that list too.
 *
 * Keep in sync: this file is identical in node-examples/src/dexChecks.ts and
 * nextjs-example/lib/dexChecks.ts (a test in node-examples compares them).
 */

import { decodeFunctionData, erc20Abi, parseUnits } from 'viem';

/** Uniswap's Permit2 contract, the same address on every EVM chain. */
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface SwapIntent {
  /** Contract address of the token being sold; null for the chain's native coin. */
  fromTokenAddress: string | null;
  fromTokenDecimals: number;
  /** Amount being sold, in token units (e.g. "15" for 15 USDC). */
  amount: string;
  /** Chain the swap starts on. */
  chainId: number;
  /** Chain the swap ends on. */
  toChainId: number;
  /** Wallet that signs and sends. */
  addressFrom: string;
  /** Wallet the user chose to receive the output. */
  addressTo: string;
  /**
   * Contracts you accept as approval or permit spender, swap transaction
   * target and signature verifier, on this chain. Empty or absent skips that
   * check, leaving the API as the only source for those addresses.
   */
  trustedContracts?: string[];
}

interface TokenFacts {
  symbol?: string;
  address?: string | null;
  decimals?: number | null;
  chainData?: { chainId?: number };
}

/**
 * Builds the intent from the API's token documents, failing when a field the
 * checks depend on is missing. A guessed default (decimals = 18, say) does not
 * make a check fail safe: for a 6-decimal token it lets an approval 10^12 times
 * too large through.
 */
export function buildSwapIntent(input: {
  fromToken: TokenFacts;
  toToken: TokenFacts;
  amount: string;
  addressFrom: string;
  addressTo: string;
  trustedContracts?: string[];
}): SwapIntent {
  const { fromToken, toToken } = input;
  const name = fromToken.symbol ?? 'the token being sold';
  if (typeof fromToken.decimals !== 'number') {
    throw new Error(`No decimals for ${name}; cannot check the approval amount`);
  }
  const chainId = fromToken.chainData?.chainId;
  const toChainId = toToken.chainData?.chainId;
  if (typeof chainId !== 'number' || typeof toChainId !== 'number') {
    throw new Error('Cannot tell which chains the swap starts and ends on');
  }
  return {
    fromTokenAddress: fromToken.address ?? null,
    fromTokenDecimals: fromToken.decimals,
    amount: input.amount,
    chainId,
    toChainId,
    addressFrom: input.addressFrom,
    addressTo: input.addressTo,
    trustedContracts: input.trustedContracts,
  };
}

const sameAddress = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

const toBigInt = (value: unknown): bigint => {
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return BigInt(-1);
  }
};

/** Fails when `trustedContracts` is set and does not list `address`. */
function assertTrusted(address: unknown, what: string, intent: SwapIntent): void {
  const trusted = intent.trustedContracts;
  if (!trusted?.length) return;
  if (typeof address === 'string' && trusted.some((t) => sameAddress(t, address))) return;
  throw new Error(`${what} ${String(address)} is not in trustedContracts`);
}

/** The exact amount being sold, in base units. */
export function sellAmount(intent: SwapIntent): bigint {
  return parseUnits(intent.amount, intent.fromTokenDecimals);
}

/**
 * Largest approval or permit a swap of `amount` can need. The API's approve
 * step rounds the amount up to a whole token, so this allows up to the next
 * whole token. That is loose for expensive tokens: selling 0.01 WBTC allows
 * approving up to 1 WBTC.
 */
export function maxApprovalAmount(intent: SwapIntent): bigint {
  const whole = Math.ceil(Number(intent.amount));
  return parseUnits(String(whole), intent.fromTokenDecimals);
}

/**
 * An approval must be an ERC-20 `approve` on the token being sold, carry no
 * native value, and allow at most `maxApprovalAmount`. A zero approval
 * (resetting an existing allowance first, as some tokens require) is accepted,
 * and so is any approval to Permit2: Permit2 moves nothing without a signed
 * permit, and `assertTypedData` bounds that permit.
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
  assertTrusted(spender, 'Approval spender', intent);

  const max = maxApprovalAmount(intent);
  if (amount > max) {
    throw new Error(`Approval of ${amount} exceeds the swap amount (at most ${max})`);
  }
}

/**
 * The swap transaction is what actually moves the funds. Its native value must
 * not exceed the amount sold (a native sell) or be zero (a token sell). Some
 * bridge routes add a native messaging fee on top: allow it explicitly with
 * `maxNativeFee` and show it to the user, rather than leaving `value` unbounded.
 * A token sell must also not call the token itself, where the only thing a call
 * can do is transfer or approve it.
 *
 * Returns the native value, so the caller can show it.
 */
export function assertSwapTx(
  tx: { to?: string; data?: string; value?: string | number | bigint },
  intent: SwapIntent,
  options: { maxNativeFee?: bigint } = {},
): bigint {
  const fee = options.maxNativeFee ?? BigInt(0);
  const value = toBigInt(tx.value ?? 0);
  if (value < BigInt(0)) throw new Error(`Swap transaction has an unreadable value (${tx.value})`);

  const native = intent.fromTokenAddress === null;
  const max = (native ? sellAmount(intent) : BigInt(0)) + fee;
  if (value > max) {
    throw new Error(
      native
        ? `Swap transaction sends ${value} of the native coin, more than the ${sellAmount(intent)} being sold` +
            (fee > BigInt(0) ? ` plus a fee of at most ${fee}` : '')
        : `Swap transaction sends ${value} of the native coin while selling a token` +
            (fee > BigInt(0) ? ` (fee allowed: at most ${fee})` : '; pass maxNativeFee if the route charges one'),
    );
  }
  if (!native && sameAddress(tx.to, intent.fromTokenAddress)) {
    throw new Error('Swap transaction calls the token being sold directly instead of a swap contract');
  }
  assertTrusted(tx.to, 'Swap transaction target', intent);
  return value;
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

interface TypedData {
  domain?: { chainId?: number | string | bigint; verifyingContract?: string };
  primaryType?: string;
  message?: any;
}

/**
 * A permit is an approval by signature, and a signed one can be submitted by
 * whoever holds it, so it gets the same bound as an approval transaction: on
 * the token being sold, for at most `maxApprovalAmount`. Covers Permit2
 * (PermitSingle and PermitTransferFrom) and EIP-2612 `Permit`. A batch permit,
 * or a permit with no readable amount, fails — including a DAI-style permit
 * (`allowed: true`), which grants an unlimited allowance. Supporting one means
 * checking its spender against a relayer you trust.
 *
 * The spender is the route's contract, which only the API knows, so it is
 * checked only against `trustedContracts`. Without that list the amount bound
 * keeps what a wrong spender could take to the swap amount.
 */
export function assertPermit(typedData: TypedData, intent: SwapIntent): void {
  const m = typedData.message ?? {};
  let token: unknown;
  let amount: bigint;

  if (sameAddress(typedData.domain?.verifyingContract, PERMIT2_ADDRESS)) {
    token = m.details?.token ?? m.permitted?.token;
    amount = toBigInt(m.details?.amount ?? m.permitted?.amount);
  } else if (typedData.primaryType === 'Permit') {
    token = typedData.domain?.verifyingContract;
    amount = toBigInt(m.value);
  } else {
    return;
  }

  if (typeof token !== 'string' || !sameAddress(token, intent.fromTokenAddress)) {
    throw new Error(`Permit is for ${String(token)}, not the token being sold (${intent.fromTokenAddress})`);
  }
  const max = maxApprovalAmount(intent);
  if (amount < BigInt(0) || amount > max) {
    throw new Error(`Permit of ${amount} exceeds the swap amount (at most ${max})`);
  }
  assertTrusted(m.spender, 'Permit spender', intent);
}

const TRANSFER_AUTHORIZATIONS = ['TransferWithAuthorization', 'ReceiveWithAuthorization'];

/**
 * An EIP-3009 transfer authorization (USDC and others) moves tokens as soon as
 * anyone submits it, with no allowance in between. It must come from the
 * signing wallet, be on the token being sold, and move at most the amount sold.
 */
export function assertTransferAuthorization(typedData: TypedData, intent: SwapIntent): void {
  if (!TRANSFER_AUTHORIZATIONS.includes(typedData.primaryType ?? '')) return;
  const m = typedData.message ?? {};
  const token = typedData.domain?.verifyingContract;
  if (!sameAddress(token, intent.fromTokenAddress)) {
    throw new Error(`Transfer authorization is for ${String(token)}, not the token being sold (${intent.fromTokenAddress})`);
  }
  if (!sameAddress(m.from, intent.addressFrom)) {
    throw new Error(`Transfer authorization moves funds from ${m.from}, not the signing wallet ${intent.addressFrom}`);
  }
  const value = toBigInt(m.value);
  const max = sellAmount(intent);
  if (value < BigInt(0) || value > max) {
    throw new Error(`Transfer authorization of ${value} exceeds the amount sold (${max})`);
  }
  assertTrusted(m.to, 'Transfer authorization recipient', intent);
}

/**
 * Typed data that is neither a permit nor a transfer authorization (a CoW or
 * 1inch order, say) is verified by the provider's settlement contract, so that
 * contract is checked against `trustedContracts`.
 */
export function assertTypedDataVerifier(typedData: TypedData, intent: SwapIntent): void {
  const verifier = typedData.domain?.verifyingContract;
  if (sameAddress(verifier, PERMIT2_ADDRESS)) return;
  if (typedData.primaryType === 'Permit' || TRANSFER_AUTHORIZATIONS.includes(typedData.primaryType ?? '')) return;
  // No verifyingContract means nothing to match: with a list set, that fails.
  assertTrusted(verifier, 'Signature verifying contract', intent);
}

/**
 * For off-chain routes the signature decides where the output goes, and it is
 * sent with POST /exchanges, before the order exists to check. So when the
 * message names a receiver, it must be the chosen receiver, the signing wallet
 * itself, or zero (which these protocols read as "the signer").
 *
 * Skipped for cross-chain swaps: there the receiver is the bridge's account on
 * the source chain and the real destination sits in hook data this cannot
 * decode. `assertReceiver` still checks the order afterwards.
 */
export function assertTypedDataReceiver(typedData: TypedData, intent: SwapIntent): void {
  if (intent.chainId !== intent.toChainId) return;
  const m = typedData.message ?? {};
  const receiver = m.receiver ?? m.recipient;
  if (typeof receiver !== 'string') return;
  if ([intent.addressTo, intent.addressFrom, ZERO_ADDRESS].some((ok) => sameAddress(receiver, ok))) return;
  throw new Error(`Signature request pays out to ${receiver}, not the chosen receiver ${intent.addressTo}`);
}

/** Every check that applies to a signature request. Run it before signing. */
export function assertTypedData(typedData: TypedData, intent: SwapIntent): void {
  assertTypedDataChain(typedData, intent);
  assertPermit(typedData, intent);
  assertTransferAuthorization(typedData, intent);
  assertTypedDataVerifier(typedData, intent);
  assertTypedDataReceiver(typedData, intent);
}

/** The order must pay out to the receiver the user chose. */
export function assertReceiver(order: { receiverAddress?: string }, intent: SwapIntent): void {
  if (!sameAddress(order.receiverAddress, intent.addressTo)) {
    throw new Error(`Order pays out to ${order.receiverAddress}, not the chosen receiver ${intent.addressTo}`);
  }
}
