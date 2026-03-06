'use client';

import { useState, useEffect } from 'react';
import type { Quote } from '@/lib/types';
import type { Token } from './TokenSelector';

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  [-2]: { label: 'INITIALIZING', color: 'text-gray-500' },
  [-1]: { label: 'NEW',          color: 'text-gray-500' },
  0:    { label: 'WAITING',      color: 'text-blue-500' },
  1:    { label: 'CONFIRMING',   color: 'text-blue-500' },
  2:    { label: 'EXCHANGING',   color: 'text-blue-500' },
  3:    { label: 'ANONYMIZING',  color: 'text-purple-500' },
  4:    { label: 'FINISHED',     color: 'text-green-600' },
  5:    { label: 'EXPIRED',      color: 'text-red-500' },
  6:    { label: 'FAILED',       color: 'text-red-500' },
  7:    { label: 'REFUNDED',     color: 'text-orange-500' },
  8:    { label: 'DELETED',      color: 'text-gray-400' },
};

interface CexSwapModalProps {
  quote: Quote;
  fromToken: Token;
  toToken: Token;
  fromAmount: string;
  addressTo: string;
  onClose: () => void;
}

type Phase = 'confirm' | 'loading' | 'success';

export function CexSwapModal({ quote, fromToken, toToken, fromAmount, addressTo, onClose }: CexSwapModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [depositAddress, setDepositAddress] = useState<string>('');
  const [houdiniId, setHoudiniId] = useState<string>('');
  const [swapStatus, setSwapStatus] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Poll status after exchange is created
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

  async function createExchange() {
    if (!addressTo.trim()) { setError('Destination address is required'); return; }
    setPhase('loading');
    setError(null);
    try {
      const res = await fetch('/api/exchanges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          addressTo: addressTo.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Exchange failed (${res.status})`);
      }
      const data = await res.json();
      setDepositAddress(data.depositAddress ?? '');
      setHoudiniId(data.houdiniId ?? '');
      setPhase('success');
    } catch (e: any) {
      setError(e?.message ?? 'An error occurred');
      setPhase('confirm');
    }
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusInfo = swapStatus !== null ? STATUS_LABELS[swapStatus] : null;
  const isTerminal = swapStatus !== null && swapStatus >= 4;
  const isPrivate = quote.type === 'private';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium">
              {isPrivate ? 'Private' : 'Standard'} Swap via
            </p>
            <p className="text-sm font-semibold text-gray-900">{quote.swapName ?? quote.swap}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary */}
        <div className="px-5 py-3 bg-gray-50 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">{fromAmount} {fromToken.symbol}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7-7 7M3 12h18" />
          </svg>
          <span className="font-medium text-gray-700">~{quote.amountOut.toFixed(4)} {toToken.symbol}</span>
        </div>

        {/* Confirm phase */}
        {phase === 'confirm' && (
          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Destination address</p>
              <p className="text-xs font-mono text-gray-800 bg-gray-50 rounded-lg px-3 py-2 break-all">{addressTo}</p>
            </div>
            <div className="flex gap-2 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>After confirming, you will receive a deposit address. Send your {fromToken.symbol} there to complete the swap.</span>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {/* Loading phase */}
        {phase === 'loading' && (
          <div className="px-5 py-8 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Creating swap order...</p>
          </div>
        )}

        {/* Success phase */}
        {phase === 'success' && (
          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">
                Send exactly <span className="font-semibold text-gray-800">{fromAmount} {fromToken.symbol}</span> to:
              </p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs font-mono text-gray-800 break-all flex-1">{depositAddress}</p>
                <button
                  onClick={copyAddress}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Copy address"
                >
                  {copied ? (
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {houdiniId && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Order ID</span>
                <span className="font-mono text-gray-600">{houdiniId}</span>
              </div>
            )}

            {statusInfo && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Status</span>
                <span className={`font-medium ${statusInfo.color}`}>
                  {isTerminal ? '' : '⟳ '}{statusInfo.label}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {phase === 'success' ? 'Close' : 'Cancel'}
          </button>
          {phase === 'confirm' && (
            <button
              onClick={createExchange}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Confirm Swap
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
