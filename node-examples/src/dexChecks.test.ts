import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from 'viem';
import {
  PERMIT2_ADDRESS,
  assertApproval,
  assertPermit,
  assertReceiver,
  assertSwapTx,
  assertTypedData,
  assertTypedDataChain,
  assertTypedDataReceiver,
  assertTransferAuthorization,
  buildSwapIntent,
  maxApprovalAmount,
  type SwapIntent,
} from './dexChecks';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OTHER_TOKEN = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';
const ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';
const ATTACKER = '0x000000000000000000000000000000000000dEaD';
const USER = '0xe75b49d793c835Caf6754C63AF2f0d472e537D73';
const OTHER_RECEIVER = '0x1111111111111111111111111111111111111111';

/** Selling 15 USDC on Base, same-chain, to a receiver that is not the sender. */
const usdc: SwapIntent = {
  fromTokenAddress: USDC,
  fromTokenDecimals: 6,
  amount: '15',
  chainId: 8453,
  toChainId: 8453,
  addressFrom: USER,
  addressTo: OTHER_RECEIVER,
};
const eth: SwapIntent = { ...usdc, fromTokenAddress: null, fromTokenDecimals: 18, amount: '0.01' };

const approve = (spender: string, amount: bigint, to = USDC) => ({
  to,
  data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender as `0x${string}`, amount] }),
});

const permitSingle = (token: string, amount: bigint) => ({
  domain: { name: 'Permit2', chainId: 8453, verifyingContract: PERMIT2_ADDRESS },
  primaryType: 'PermitSingle',
  message: { details: { token, amount: amount.toString(), expiration: '0', nonce: '0' }, spender: ROUTER, sigDeadline: '0' },
});

test('both copies of dexChecks.ts are identical', () => {
  const here = readFileSync(join(__dirname, 'dexChecks.ts'), 'utf8');
  const nextjs = readFileSync(join(__dirname, '../../nextjs-example/lib/dexChecks.ts'), 'utf8');
  assert.equal(nextjs, here);
});

test('buildSwapIntent fails on missing decimals instead of assuming 18', () => {
  const base = { chainData: { chainId: 8453 } };
  assert.throws(
    () => buildSwapIntent({ fromToken: { ...base, symbol: 'USDC', address: USDC }, toToken: base, amount: '15', addressFrom: USER, addressTo: USER }),
    /No decimals for USDC/,
  );
  const intent = buildSwapIntent({
    fromToken: { ...base, address: null, decimals: 18 },
    toToken: { chainData: { chainId: 1 } },
    amount: '1',
    addressFrom: USER,
    addressTo: USER,
  });
  assert.equal(intent.fromTokenAddress, null);
  assert.equal(intent.toChainId, 1);
});

test('maxApprovalAmount rounds up to a whole token', () => {
  assert.equal(maxApprovalAmount({ ...usdc, amount: '0.5' }), parseUnits('1', 6));
  assert.equal(maxApprovalAmount(usdc), parseUnits('15', 6));
});

test('assertApproval', () => {
  assertApproval(approve(ROUTER, parseUnits('15', 6)), usdc);
  assertApproval(approve(ROUTER, BigInt(0)), usdc);
  assertApproval(approve(PERMIT2_ADDRESS, maxUint256), usdc);
  assert.throws(() => assertApproval(approve(ROUTER, maxUint256), usdc), /exceeds the swap amount/);
  assert.throws(() => assertApproval(approve(ROUTER, BigInt(1), OTHER_TOKEN), usdc), /not the token being sold/);
  assert.throws(() => assertApproval({ ...approve(ROUTER, BigInt(1)), value: '1' }, usdc), /native value/);
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ATTACKER, BigInt(1)] });
  assert.throws(() => assertApproval({ to: USDC, data: transfer }, usdc), /not an ERC-20 approve/);
  // Selling the native coin needs no approval at all.
  assert.throws(() => assertApproval(approve(ROUTER, BigInt(1)), eth), /not the token being sold/);
});

test('assertPermit bounds a Permit2 PermitSingle to the token and the swap amount', () => {
  assertPermit(permitSingle(USDC, parseUnits('15', 6)), usdc);
  assert.throws(() => assertPermit(permitSingle(USDC, maxUint256), usdc), /exceeds the swap amount/);
  assert.throws(() => assertPermit(permitSingle(OTHER_TOKEN, BigInt(1)), usdc), /not the token being sold/);
});

test('assertPermit covers PermitTransferFrom and refuses a batch permit', () => {
  const transferFrom = {
    domain: { verifyingContract: PERMIT2_ADDRESS },
    primaryType: 'PermitTransferFrom',
    message: { permitted: { token: USDC, amount: parseUnits('15', 6).toString() }, spender: ROUTER, nonce: '0', deadline: '0' },
  };
  assertPermit(transferFrom, usdc);
  const batch = {
    domain: { verifyingContract: PERMIT2_ADDRESS },
    primaryType: 'PermitBatch',
    message: { details: [{ token: USDC, amount: '1' }], spender: ROUTER },
  };
  assert.throws(() => assertPermit(batch, usdc), /Permit is for/);
});

test('assertPermit covers EIP-2612 and refuses a DAI-style unlimited permit', () => {
  const eip2612 = (token: string, value: unknown) => ({
    domain: { chainId: 8453, verifyingContract: token },
    primaryType: 'Permit',
    message: { owner: USER, spender: ROUTER, value, nonce: '0', deadline: '0' },
  });
  assertPermit(eip2612(USDC, parseUnits('15', 6).toString()), usdc);
  assert.throws(() => assertPermit(eip2612(USDC, maxUint256.toString()), usdc), /exceeds/);
  assert.throws(() => assertPermit(eip2612(OTHER_TOKEN, '1'), usdc), /not the token being sold/);
  assert.throws(() => assertPermit(eip2612(USDC, undefined), usdc), /exceeds/);
});

test('assertPermit ignores typed data that is not a permit', () => {
  assertPermit({ domain: { verifyingContract: ROUTER }, primaryType: 'Order', message: { sellAmount: maxUint256.toString() } }, usdc);
});

test('assertTypedDataChain', () => {
  assertTypedDataChain({ domain: { chainId: '8453' } }, usdc);
  assertTypedDataChain({ domain: {} }, usdc);
  assert.throws(() => assertTypedDataChain({ domain: { chainId: 1 } }, usdc), /chain 1/);
});

test('assertTypedDataReceiver accepts the receiver, the signer or zero, and skips cross-chain', () => {
  const order = (receiver: string) => ({ primaryType: 'Order', message: { receiver } });
  assertTypedDataReceiver(order(OTHER_RECEIVER), usdc);
  assertTypedDataReceiver(order(USER), usdc);
  assertTypedDataReceiver(order('0x0000000000000000000000000000000000000000'), usdc);
  assertTypedDataReceiver({ message: {} }, usdc);
  assert.throws(() => assertTypedDataReceiver(order(ATTACKER), usdc), /pays out to/);
  assert.throws(() => assertTypedDataReceiver({ message: { recipient: ATTACKER } }, usdc), /pays out to/);
  // Cross-chain: the receiver is the bridge's account on the source chain.
  assertTypedDataReceiver(order(ATTACKER), { ...usdc, toChainId: 42161 });
});

test('assertTypedData runs every check', () => {
  assert.throws(() => assertTypedData(permitSingle(USDC, maxUint256), usdc), /exceeds/);
  assert.throws(() => assertTypedData({ ...permitSingle(USDC, BigInt(1)), domain: { verifyingContract: PERMIT2_ADDRESS, chainId: 1 } }, usdc), /chain 1/);
});

test('assertSwapTx bounds the native value', () => {
  assert.equal(assertSwapTx({ to: ROUTER, value: '0' }, usdc), BigInt(0));
  assert.equal(assertSwapTx({ to: ROUTER }, usdc), BigInt(0));
  assert.throws(() => assertSwapTx({ to: ROUTER, value: '1' }, usdc), /while selling a token; pass maxNativeFee/);
  assert.equal(assertSwapTx({ to: ROUTER, value: '1000' }, usdc, { maxNativeFee: BigInt(1000) }), BigInt(1000));

  const sold = parseUnits('0.01', 18);
  assertSwapTx({ to: ROUTER, value: sold.toString() }, eth);
  assert.throws(() => assertSwapTx({ to: ROUTER, value: (sold + BigInt(1)).toString() }, eth), /more than the/);
  assert.throws(() => assertSwapTx({ to: ROUTER, value: '1e+21' }, eth), /unreadable value/);
});

test('assertSwapTx refuses a token sell that calls the token itself', () => {
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ATTACKER, BigInt(1)] });
  assert.throws(() => assertSwapTx({ to: USDC, data: transfer, value: '0' }, usdc), /calls the token being sold/);
});

test('assertReceiver', () => {
  assertReceiver({ receiverAddress: OTHER_RECEIVER.toUpperCase().replace('0X', '0x') }, usdc);
  assert.throws(() => assertReceiver({ receiverAddress: ATTACKER }, usdc), /pays out to/);
  assert.throws(() => assertReceiver({}, usdc), /pays out to/);
});

const transferAuth = (overrides: Record<string, unknown> = {}, token = USDC) => ({
  domain: { name: 'USD Coin', chainId: 8453, verifyingContract: token },
  primaryType: 'TransferWithAuthorization',
  message: { from: USER, to: ROUTER, value: parseUnits('15', 6).toString(), validAfter: '0', validBefore: '0', nonce: '0x00', ...overrides },
});

test('assertTransferAuthorization bounds an EIP-3009 authorization to the signer, the token and the amount sold', () => {
  assertTransferAuthorization(transferAuth(), usdc);
  assert.throws(() => assertTransferAuthorization(transferAuth({ value: parseUnits('16', 6).toString() }), usdc), /exceeds the amount sold/);
  assert.throws(() => assertTransferAuthorization(transferAuth({ from: ATTACKER }), usdc), /not the signing wallet/);
  assert.throws(() => assertTransferAuthorization(transferAuth({}, OTHER_TOKEN), usdc), /not the token being sold/);
  const receive = { ...transferAuth({ value: maxUint256.toString() }), primaryType: 'ReceiveWithAuthorization' };
  assert.throws(() => assertTypedData(receive, usdc), /exceeds the amount sold/);
});

describeTrusted();
function describeTrusted() {
  const trusted: SwapIntent = { ...usdc, trustedContracts: [ROUTER] };

  test('trustedContracts: approval spender', () => {
    assertApproval(approve(ROUTER, parseUnits('15', 6)), trusted);
    assert.throws(() => assertApproval(approve(ATTACKER, parseUnits('15', 6)), trusted), /Approval spender .* not in trustedContracts/);
    // Permit2 and zero approvals stay allowed: Permit2 moves nothing without a bounded permit.
    assertApproval(approve(PERMIT2_ADDRESS, maxUint256), trusted);
    assertApproval(approve(ATTACKER, BigInt(0)), trusted);
  });

  test('trustedContracts: swap transaction target', () => {
    assertSwapTx({ to: ROUTER, data: '0x', value: '0' }, trusted);
    assert.throws(() => assertSwapTx({ to: ATTACKER, data: '0x', value: '0' }, trusted), /Swap transaction target .* not in trustedContracts/);
  });

  test('trustedContracts: permit spender, transfer recipient and order verifier', () => {
    assertTypedData(permitSingle(USDC, parseUnits('15', 6)), trusted);
    const badPermit = permitSingle(USDC, parseUnits('15', 6));
    badPermit.message.spender = ATTACKER;
    assert.throws(() => assertTypedData(badPermit, trusted), /Permit spender .* not in trustedContracts/);
    assert.throws(() => assertTypedData(transferAuth({ to: ATTACKER }), trusted), /recipient .* not in trustedContracts/);
    const order = (verifyingContract: string) => ({
      domain: { chainId: 8453, verifyingContract },
      primaryType: 'Order',
      message: { receiver: OTHER_RECEIVER },
    });
    assertTypedData(order(ROUTER), trusted);
    assert.throws(() => assertTypedData(order(ATTACKER), trusted), /verifying contract .* not in trustedContracts/);
    const noVerifier = { domain: { chainId: 8453 }, primaryType: 'Order', message: { receiver: OTHER_RECEIVER } };
    assert.throws(() => assertTypedData(noVerifier, trusted), /verifying contract undefined is not in trustedContracts/);
    assertTypedData(noVerifier, usdc);
  });

  test('without trustedContracts those addresses are not checked', () => {
    assertApproval(approve(ATTACKER, parseUnits('15', 6)), usdc);
    assertSwapTx({ to: ATTACKER, data: '0x', value: '0' }, usdc);
  });

  test('buildSwapIntent carries trustedContracts through', () => {
    const intent = buildSwapIntent({
      fromToken: { symbol: 'USDC', address: USDC, decimals: 6, chainData: { chainId: 8453 } },
      toToken: { chainData: { chainId: 8453 } },
      amount: '15',
      addressFrom: USER,
      addressTo: USER,
      trustedContracts: [ROUTER],
    });
    assert.deepEqual(intent.trustedContracts, [ROUTER]);
  });
}
