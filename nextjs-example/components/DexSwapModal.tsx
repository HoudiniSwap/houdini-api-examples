'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAccount, useSendTransaction, useSignTypedData, useConfig } from 'wagmi';
import { createPublicClient, http } from 'viem';
import type { Quote, Signature, SignatureObject } from '@/lib/types';
import type { Token } from './TokenSelector';

type StepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'error';

interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL_STEPS: Step[] = [
  { id: 'check',     label: 'Check requirements',    status: 'pending' },
  { id: 'approve',   label: 'Approve token',         status: 'pending' },
  { id: 'allowance', label: 'Confirm allowance',     status: 'pending' },
  { id: 'sign',      label: 'Sign',                  status: 'pending' },
  { id: 'execute',   label: 'Execute swap',          status: 'pending' },
  { id: 'broadcast', label: 'Broadcast transaction', status: 'pending' },
];

const STATUS_LABELS: Record<number, string> = {
  [-2]: 'INITIALIZING', [-1]: 'NEW', 0: 'WAITING', 1: 'CONFIRMING',
  2: 'EXCHANGING', 3: 'ANONYMIZING', 4: 'FINISHED',
  5: 'EXPIRED', 6: 'FAILED', 7: 'REFUNDED', 8: 'DELETED',
};

interface DexSwapModalProps {
  quote: Quote;
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  addressTo: string;
  onClose: () => void;
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return (
    <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
  if (status === 'active') return (
    <span className="w-6 h-6 rounded-full border-2 border-blue-500 flex items-center justify-center shrink-0">
      <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </span>
  );
  if (status === 'error') return (
    <span className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  );
  if (status === 'skipped') return (
    <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
      </svg>
    </span>
  );
  return <span className="w-6 h-6 rounded-full border-2 border-gray-200 shrink-0" />;
}

export function DexSwapModal({ quote, fromToken, toToken, fromAmount, addressTo, onClose }: DexSwapModalProps) {
  const eip155Account = useAppKitAccount({ namespace: 'eip155' });
  const solanaAccount = useAppKitAccount({ namespace: 'solana' });
  const bip122Account = useAppKitAccount({ namespace: 'bip122' });
  const kind = fromToken.chainData?.kind?.toLowerCase() ?? '';
  const address = (kind === 'sol') ? solanaAccount.address
    : (kind === 'bitcoin') ? bip122Account.address
    : eip155Account.address;
  const { connector } = useAccount();
  const config = useConfig();
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();

  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [houdiniId, setHoudiniId] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<number | null>(null);
  const [pendingTxData, setPendingTxData] = useState<{ to: string; data: string; value: string } | null>(null);

  // Poll swap status after exchange is submitted
  useEffect(() => {
    if (!houdiniId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/status/${houdiniId}`);
        if (!res.ok) return;
        const data = await res.json();
        const code = data.status ?? data.statusCode ?? null;
        setSwapStatus(code);
        if (code >= 4) clearInterval(interval);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [houdiniId]);

  function updateStep(id: string, status: StepStatus, detail?: string) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail: detail ?? s.detail } : s));
  }

  function getViemPublicClient(chainId: number) {
    const chain = config.chains.find(c => c.id === chainId);
    if (!chain) throw new Error(`Chain ${chainId} not configured`);
    return createPublicClient({ chain, transport: http() });
  }

  async function switchToChain(chainId: number) {
    const provider = await connector?.getProvider() as any;
    if (!provider) throw new Error('No wallet provider found');
    const hexChainId = `0x${chainId.toString(16)}`;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
    } catch (err: any) {
      if (err?.code === 4902) {
        const chain = config.chains.find(c => c.id === chainId);
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hexChainId,
            chainName: chain?.name ?? `Chain ${chainId}`,
            nativeCurrency: chain?.nativeCurrency ?? { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: chain?.rpcUrls?.default?.http ?? [],
            blockExplorerUrls: chain?.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
          }],
        });
      } else {
        throw err;
      }
    }
  }

  const processSignatures = useCallback(async (
    signatures: Signature[],
    userAddress: string,
  ): Promise<SignatureObject[]> => {
    const results: SignatureObject[] = [];
    for (const sig of signatures) {
      const typedData = sig.data;
      const signature = await signTypedDataAsync({
        account: address as `0x${string}`,
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      const sigObj: SignatureObject = { signature, key: sig.key, swapRequiredMetadata: sig.swapRequiredMetadata };

      if ((sig.type === 'chained' || sig.type === 'CHAINED') && !sig.isComplete) {
        const res = await fetch('/api/dex/chain-signatures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteId: quote.quoteId, addressFrom: userAddress,
            previousSignature: sigObj, signatureKey: sig.key, signatureStep: sig.step,
          }),
        }).then(r => r.json());
        const chainSigs: Signature[] = res.chainSignatures ?? res ?? [];
        if (chainSigs.length > 0) {
          const chainResults = await processSignatures(chainSigs, userAddress);
          if (chainResults.length > 0) results.push(chainResults[chainResults.length - 1]);
        }
      } else {
        results.push(sigObj);
      }
    }
    return results;
  }, [signTypedDataAsync, address, quote.quoteId]);

  async function runFlow() {
    const isEvm = !fromToken.chainData?.kind || fromToken.chainData.kind.toLowerCase() === 'evm';

    if (!address && isEvm) { setError('Wallet not connected'); return; }
    setStarted(true);
    setError(null);

    const fromChainId = fromToken.chainData?.chainId;

    try {
      // ── Step 1: Check requirements ──────────────────────────────────────
      updateStep('check', 'active');
      const approveRes = await fetch('/api/dex/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          addressFrom: address,
        }),
      });
      if (!approveRes.ok) {
        const err = await approveRes.json();
        throw new Error(err.error ?? `Approve check failed (${approveRes.status})`);
      }
      const approveData = await approveRes.json();
      const approvals: any[] = approveData.approvals ?? [];
      const signatures: Signature[] = approveData.signatures ?? [];
      updateStep('check', 'done', `${approvals.length} approval(s), ${signatures.length} signature(s)`);

      // ── Step 2: Token approvals ─────────────────────────────────────────
      if (approvals.length > 0) {
        updateStep('approve', 'active', `Sending ${approvals.length} approval(s)...`);
        if (fromChainId) {
          updateStep('approve', 'active', 'Switching network...');
          await switchToChain(fromChainId);
        }
        for (let i = 0; i < approvals.length; i++) {
          const approval = approvals[i];
          updateStep('approve', 'active', `Approval ${i + 1}/${approvals.length} — confirm in wallet`);
          const hash = await sendTransactionAsync({
            to: approval.to as `0x${string}`,
            data: approval.data as `0x${string}`,
            value: BigInt(approval.value ?? 0),
          });
          updateStep('approve', 'active', `Waiting for confirmation ${i + 1}/${approvals.length}...`);
          await getViemPublicClient(fromChainId!).waitForTransactionReceipt({ hash });
        }
        updateStep('approve', 'done');

        // ── Step 3: Poll allowance ────────────────────────────────────────
        updateStep('allowance', 'active', 'Polling on-chain allowance...');
        let hasAllowance = false;
        for (let attempt = 0; attempt < 60 && !hasAllowance; attempt++) {
          await new Promise(r => setTimeout(r, 5000));
          updateStep('allowance', 'active', `Checking allowance (attempt ${attempt + 1}/60)...`);
          const res = await fetch('/api/dex/allowance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteId: quote.quoteId, addressFrom: address }),
          });
          if (res.ok) hasAllowance = await res.json();
        }
        if (!hasAllowance) throw new Error('Allowance not confirmed after 5 minutes. Please try again.');
        updateStep('allowance', 'done');
      } else {
        updateStep('approve', 'skipped');
        updateStep('allowance', 'skipped');
      }

      // ── Step 4: Signatures ───────────────────────────────────────────────
      let collectedSignatures: SignatureObject[] = [];
      if (signatures.length > 0) {
        updateStep('sign', 'active', `${signatures.length} signature(s) — confirm in wallet`);
        collectedSignatures = await processSignatures(signatures, address);
        updateStep('sign', 'done', `${collectedSignatures.length} signature(s) collected`);
      } else {
        updateStep('sign', 'skipped');
      }

      // ── Step 5: Create exchange ──────────────────────────────────────────
      updateStep('execute', 'active', 'Creating exchange order...');
      const exchangeRes = await fetch('/api/exchanges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          addressTo,
          addressFrom: address,
          signatures: collectedSignatures,
          walletInfo: connector?.name ?? 'Unknown',
        }),
      });
      if (!exchangeRes.ok) {
        const err = await exchangeRes.json();
        throw new Error(err.error ?? `Exchange failed (${exchangeRes.status})`);
      }
      const exchange = await exchangeRes.json();
      setHoudiniId(exchange.houdiniId);
      updateStep('execute', 'done', `Order: ${exchange.houdiniId}`);

      // ── Step 6: Broadcast on-chain tx (if required) ──────────────────────
      const meta = exchange.metadata;
      if (meta?.to && isEvm) {
        updateStep('broadcast', 'active', 'Confirm transaction in wallet...');
        if (fromChainId) await switchToChain(fromChainId);

        const publicClient = getViemPublicClient(fromChainId!);
        const txValue = meta.value ? BigInt(meta.value) : undefined;

        // Estimate gas with 120% buffer
        const [estimatedGas, feeData] = await Promise.all([
          publicClient.estimateGas({
            account: address as `0x${string}`,
            to: meta.to as `0x${string}`,
            data: meta.data as `0x${string}`,
            value: txValue,
          }),
          publicClient.estimateFeesPerGas(),
        ]);
        const GAS_BUFFER = BigInt(120);

        const hash = await sendTransactionAsync({
          chainId: fromChainId,
          to: meta.to as `0x${string}`,
          data: meta.data as `0x${string}`,
          value: txValue,
          gas: estimatedGas,
          ...(feeData.maxFeePerGas && feeData.maxPriorityFeePerGas ? {
            maxFeePerGas: (feeData.maxFeePerGas * GAS_BUFFER) / BigInt(100),
            maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * GAS_BUFFER) / BigInt(100),
          } : {}),
        });

        updateStep('broadcast', 'active', 'Waiting for on-chain confirmation...');
        await publicClient.waitForTransactionReceipt({ hash });

        // Confirm tx with Houdini API (up to 5 retries)
        updateStep('broadcast', 'active', 'Confirming with Houdini...');
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const confirmRes = await fetch('/api/dex/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ houdiniId: exchange.houdiniId, txHash: hash }),
            });
            if (confirmRes.ok) break;
          } catch { /* retry */ }
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }

        updateStep('broadcast', 'done', `Tx: ${hash.slice(0, 10)}…`);
      } else if (meta?.to && !isEvm) {
        // Non-EVM: surface tx data for the user to send manually
        setPendingTxData({ to: meta.to, data: meta.data ?? '', value: meta.value ?? '0' });
        updateStep('broadcast', 'done', 'Tx data ready — send manually');
      } else {
        updateStep('broadcast', 'skipped');
      }

      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'An error occurred');
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
    }
  }

  const isRunning = started && !done && !error;
  const statusLabel = swapStatus !== null ? (STATUS_LABELS[swapStatus] ?? `Status ${swapStatus}`) : null;
  const isTerminal = swapStatus !== null && swapStatus >= 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium">DEX Swap via</p>
            <p className="text-sm font-semibold text-gray-900">{quote.swapName ?? quote.swap}</p>
          </div>
          {!isRunning && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="px-5 py-3 bg-gray-50 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">{fromAmount} {fromToken.symbol}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7-7 7M3 12h18" />
          </svg>
          <span className="font-medium text-gray-700">{quote.amountOut.toFixed(4)} {toToken.symbol}</span>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <StepIcon status={step.status} />
                {i < steps.length - 1 && (
                  <div className={`w-0.5 h-4 mt-1 ${step.status === 'done' ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>
              <div className="flex-1 pt-0.5">
                <p className={`text-sm font-medium ${
                  step.status === 'active' ? 'text-blue-600' :
                  step.status === 'done'   ? 'text-gray-700' :
                  step.status === 'error'  ? 'text-red-600'  : 'text-gray-400'
                }`}>{step.label}</p>
                {step.detail && <p className="text-xs text-gray-400 mt-0.5">{step.detail}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 bg-red-50 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Success + live status */}
        {done && houdiniId && (
          <div className="mx-5 mb-3 px-3 py-2.5 bg-green-50 rounded-lg space-y-1">
            <p className="text-xs font-semibold text-green-700">Swap submitted!</p>
            <p className="text-xs text-green-600 font-mono break-all">ID: {houdiniId}</p>
            {statusLabel && (
              <p className={`text-xs font-medium ${
                swapStatus === 4 ? 'text-green-600' :
                isTerminal      ? 'text-red-500'   : 'text-blue-500'
              }`}>
                {isTerminal ? '' : '⟳ '}{statusLabel}
              </p>
            )}
          </div>
        )}

        {/* Pending tx data for non-EVM chains */}
        {done && pendingTxData && (
          <div className="mx-5 mb-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">Transaction data (send manually)</p>
            {(['to', 'data', 'value'] as const).map(field => (
              <div key={field}>
                <p className="text-[10px] font-medium text-gray-400 uppercase mb-0.5">{field}</p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                  <p className="text-xs font-mono text-gray-700 break-all flex-1">{pendingTxData[field] || '0x'}</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(pendingTxData[field])}
                    className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                    title={`Copy ${field}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={isRunning}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {done || error ? 'Close' : 'Cancel'}
          </button>
          {!started && (
            <button
              onClick={runFlow}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Start Swap
            </button>
          )}
          {error && (
            <button
              onClick={() => {
                setError(null); setStarted(false); setDone(false);
                setSteps(INITIAL_STEPS); setHoudiniId(null); setSwapStatus(null); setPendingTxData(null);
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
