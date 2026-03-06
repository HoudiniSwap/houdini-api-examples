'use client';

import { useState } from 'react';
import type { Quote } from '@/lib/types';
import type { Token } from './TokenSelector';

type TabType = 'all' | 'dex' | 'standard' | 'private';

const TYPE_COLORS: Record<string, string> = {
  dex: 'bg-blue-50 text-blue-600',
  standard: 'bg-emerald-50 text-emerald-600',
  private: 'bg-violet-50 text-violet-600',
};

function formatAmount(amount: number): string {
  if (amount === 0) return '0';
  if (amount < 0.0001) return amount.toExponential(4);
  if (amount < 1) return amount.toFixed(6);
  if (amount < 1000) return amount.toFixed(4);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  return `~${Math.round(minutes / 60)} hr`;
}

interface QuoteListProps {
  quotes: Quote[];
  selectedQuoteId: string | null;
  toToken?: Token;
  onSelect: (quote: Quote) => void;
}

export function QuoteList({ quotes, selectedQuoteId, toToken, onSelect }: QuoteListProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const validQuotes = quotes.filter((q) => !q.error && !q.filtered);

  const counts = {
    all: validQuotes.length,
    dex: validQuotes.filter((q) => q.type === 'dex').length,
    standard: validQuotes.filter((q) => q.type === 'standard').length,
    private: validQuotes.filter((q) => q.type === 'private').length,
  };

  const tabs: { key: TabType; label: string }[] = (
    [
      { key: 'all' as TabType, label: 'All' },
      { key: 'dex' as TabType, label: 'DEX' },
      { key: 'standard' as TabType, label: 'Standard' },
      { key: 'private' as TabType, label: 'Private' },
    ] as const
  ).filter((t) => t.key === 'all' || counts[t.key] > 0);

  const displayed =
    activeTab === 'all' ? validQuotes : validQuotes.filter((q) => q.type === activeTab);

  // Best = first quote (API returns sorted by amountOut desc)
  const bestQuoteId = validQuotes[0]?.quoteId;

  if (validQuotes.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {/* Tab bar */}
      <div className="flex gap-1.5 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            <span className={activeTab === tab.key ? 'text-gray-400' : 'text-gray-400'}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Quote cards */}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
        {displayed.map((q) => {
          const isSelected = q.quoteId === selectedQuoteId;
          const isBest = q.quoteId === bestQuoteId;

          return (
            <button
              key={q.quoteId}
              onClick={() => onSelect(q)}
              className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-transparent bg-gray-50 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {/* Provider logo */}
                {q.logoUrl ? (
                  <img
                    src={q.logoUrl}
                    alt={q.swapName ?? q.swap}
                    width={28}
                    height={28}
                    className="rounded-full shrink-0 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0" />
                )}

                {/* Left: name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {q.swapName ?? q.swap}
                    </span>
                    {isBest && (
                      <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full shrink-0 leading-none">
                        Best
                      </span>
                    )}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 capitalize leading-none ${
                        TYPE_COLORS[q.type] ?? 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {q.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {formatDuration(q.duration)}
                    {q.feeUsd != null && q.feeUsd > 0 && ` · fee $${q.feeUsd.toFixed(2)}`}
                    {q.gasUsd != null && q.gasUsd > 0 && ` · gas $${q.gasUsd.toFixed(2)}`}
                  </p>
                </div>

                {/* Right: amount */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatAmount(q.amountOut)}
                    {toToken?.symbol ? ` ${toToken.symbol}` : ''}
                  </p>
                  {q.amountOutUsd != null && (
                    <p className="text-xs text-gray-400">≈ ${q.amountOutUsd.toFixed(2)}</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
