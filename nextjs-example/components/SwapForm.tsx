'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { TokenSelector, type Token } from './TokenSelector';
import { QuoteList } from './QuoteList';
import { DexSwapModal } from './DexSwapModal';
import { CexSwapModal } from './CexSwapModal';
import type { Quote } from '@/lib/types';

function formatAmount(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) return amount.toExponential(4);
  if (amount < 1) return amount.toFixed(6);
  if (amount < 1000) return amount.toFixed(4);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function SwapForm() {
  const { isConnected, address } = useAccount();
  const [fromToken, setFromToken] = useState<Token>();
  const [toToken, setToToken] = useState<Token>();
  const [fromAmount, setFromAmount] = useState('');
  const [addressTo, setAddressTo] = useState('');

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [showDexModal, setShowDexModal] = useState(false);
  const [showCexModal, setShowCexModal] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasAmount = fromAmount !== '' && parseFloat(fromAmount) > 0;
  const canFetchQuote = hasAmount && !!fromToken && !!toToken;

  // Auto-fill addressTo with wallet address when DEX quote is selected
  useEffect(() => {
    if (selectedQuote?.type === 'dex' && isConnected && address && !addressTo) {
      setAddressTo(address);
    }
  }, [selectedQuote?.type, isConnected, address]);

  useEffect(() => {
    if (!canFetchQuote) {
      setQuotes([]);
      setSelectedQuote(null);
      setQuoteError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchQuotes(), 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fromToken?.id, toToken?.id, fromAmount]);

  async function fetchQuotes() {
    if (!fromToken || !toToken) return;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const params = new URLSearchParams({
        amount: fromAmount,
        from: fromToken.id,
        to: toToken.id,
        sort: 'amountOut',
        sortOrder: 'desc',
      });
      const res = await fetch(`/api/quotes?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      const all: Quote[] = data.quotes ?? [];
      setQuotes(all);
      const best = all.find((q) => !q.error && !q.filtered && q.amountOut > 0) ?? null;
      setSelectedQuote(best);
      if (!best) setQuoteError('No quotes available for this pair.');
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Failed to fetch quotes.');
      setQuotes([]);
      setSelectedQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  function handleSwapDirection() {
    setFromToken(toToken);
    setToToken(fromToken);
    setAddressTo('');
    setQuotes([]);
    setSelectedQuote(null);
  }

  function handleFromAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFromAmount(value);
      setQuotes([]);
      setSelectedQuote(null);
    }
  }

  function handleSwap() {
    if (!selectedQuote) return;
    if (selectedQuote.type === 'dex') setShowDexModal(true);
    else setShowCexModal(true);
  }

  const isDex = selectedQuote?.type === 'dex';
  const hasAddressTo = addressTo.trim().length > 0;
  const canSwap = !!hasAmount && !!selectedQuote && !quoteLoading && hasAddressTo &&
    (!isDex || isConnected);

  let swapButtonLabel = 'Enter an amount';
  if (hasAmount) {
    if (quoteLoading) swapButtonLabel = 'Fetching quotes...';
    else if (!selectedQuote) swapButtonLabel = 'No route found';
    else if (isDex && !isConnected) swapButtonLabel = 'Connect wallet to swap';
    else if (!hasAddressTo) swapButtonLabel = 'Enter destination address';
    else swapButtonLabel = `Swap ${fromToken?.symbol} → ${toToken?.symbol}`;
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-md">

      {/* From box */}
      <div className="bg-gray-50 rounded-xl p-4 mb-1">
        <p className="text-xs font-medium text-gray-400 mb-3">You Pay</p>
        <div className="flex items-center gap-3">
          <TokenSelector selected={fromToken} onSelect={setFromToken} excludeToken={toToken} />
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={fromAmount}
            onChange={handleFromAmountChange}
            className="flex-1 text-right text-2xl font-semibold bg-transparent outline-none text-gray-900 placeholder-gray-300 min-w-0"
          />
        </div>
      </div>

      {/* Swap direction toggle */}
      <div className="flex justify-center -my-0.5 relative z-10">
        <button
          onClick={handleSwapDirection}
          className="bg-white border-2 border-gray-100 rounded-xl p-1.5 hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm"
          aria-label="Switch tokens"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* To box */}
      <div className="bg-gray-50 rounded-xl p-4 mb-3">
        <p className="text-xs font-medium text-gray-400 mb-3">You Receive</p>
        <div className="flex items-center gap-3">
          <TokenSelector selected={toToken} onSelect={setToToken} excludeToken={fromToken} />
          <div className="flex-1 text-right min-w-0">
            {quoteLoading ? (
              <div className="flex justify-end">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin" />
              </div>
            ) : (
              <p className={`text-2xl font-semibold truncate ${selectedQuote ? 'text-gray-900' : 'text-gray-300'}`}>
                {selectedQuote ? formatAmount(selectedQuote.amountOut) : '0.0'}
              </p>
            )}
            {selectedQuote?.amountOutUsd != null && !quoteLoading && (
              <p className="text-xs text-gray-400 mt-0.5">≈ ${selectedQuote.amountOutUsd.toFixed(2)}</p>
            )}
          </div>
        </div>
      </div>

      {/* Destination address */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium text-gray-500">Destination address</p>
          {isDex && isConnected && address && (
            <button
              onClick={() => setAddressTo(address)}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              Use wallet
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder={`Enter ${toToken?.symbol ?? 'destination'} address`}
          value={addressTo}
          onChange={e => setAddressTo(e.target.value)}
          className="w-full text-xs font-mono bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-gray-800 placeholder-gray-300 transition-all"
        />
      </div>

      {/* Quote list */}
      {!quoteLoading && quotes.length > 0 && (
        <QuoteList
          quotes={quotes}
          selectedQuoteId={selectedQuote?.quoteId ?? null}
          toToken={toToken}
          onSelect={setSelectedQuote}
        />
      )}

      {/* Error */}
      {quoteError && !quoteLoading && (
        <p className="text-xs text-red-500 text-center mt-3">{quoteError}</p>
      )}

      {/* Swap button */}
      <button
        disabled={!canSwap}
        onClick={handleSwap}
        className="w-full mt-3 py-3.5 rounded-xl font-semibold text-sm transition-all bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        {swapButtonLabel}
      </button>

      {/* DEX modal */}
      {showDexModal && selectedQuote && fromToken && toToken && (
        <DexSwapModal
          quote={selectedQuote}
          fromToken={fromToken}
          toToken={toToken}
          fromAmount={fromAmount}
          addressTo={addressTo}
          onClose={() => setShowDexModal(false)}
        />
      )}

      {/* CEX / Private modal */}
      {showCexModal && selectedQuote && fromToken && toToken && (
        <CexSwapModal
          quote={selectedQuote}
          fromToken={fromToken}
          toToken={toToken}
          fromAmount={fromAmount}
          addressTo={addressTo}
          onClose={() => setShowCexModal(false)}
        />
      )}
    </div>
  );
}
