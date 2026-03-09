'use client';

import { useState, useEffect, useRef } from 'react';

export interface Token {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
  chainData?: {
    chainId: number;
    shortName: string;
    name: string;
    kind?: string; // 'evm' | 'solana' | 'bitcoin'
  };
  price?: number;
}

interface TokenSearchResult {
  tokens: Token[];
  total: number;
  totalPages: number;
}

interface TokenSelectorProps {
  selected: Token | undefined;
  onSelect: (token: Token) => void;
  excludeToken?: Token;
}

export function TokenSelector({ selected, onSelect, excludeToken }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchTokens('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTokens(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, isOpen]);

  async function fetchTokens(term: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '20' });
      if (term) params.set('term', term);
      const res = await fetch(`/api/tokens?${params}`);
      if (!res.ok) throw new Error('Failed');
      const data: TokenSearchResult = await res.json();
      setTokens(data.tokens ?? []);
    } catch {
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(token: Token) {
    onSelect(token);
    setIsOpen(false);
    setSearch('');
  }

  function handleClose() {
    setIsOpen(false);
    setSearch('');
  }

  const displayTokens = excludeToken
    ? tokens.filter((t) => t.id !== excludeToken.id)
    : tokens;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 transition-colors shrink-0 shadow-sm"
      >
        <TokenIcon token={selected} size={22} />
        <span className="font-semibold text-gray-900 text-sm">{selected?.symbol}</span>
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Select Token</h2>
              <button
                onClick={handleClose}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search input */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search name, symbol or address"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent outline-none flex-1 text-sm text-gray-900 placeholder-gray-400"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Token list */}
            <div className="overflow-y-auto max-h-64 px-2 pb-3">
              {loading ? (
                <div className="flex justify-center items-center py-10">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : displayTokens.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">
                  {search ? `No results for "${search}"` : 'No tokens found'}
                </p>
              ) : (
                displayTokens.map((token) => (
                  <button
                    key={token.id}
                    onClick={() => handleSelect(token)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  >
                    <TokenIcon token={token} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm leading-tight">{token.symbol}</p>
                      <p className="text-xs text-gray-400 truncate">{token.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {token.chainData && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {token.chainData.name || token.chainData.shortName}
                        </span>
                      )}
                      {token.price != null && (
                        <span className="text-xs text-gray-500">${token.price.toLocaleString()}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TokenIcon({ token, size }: { token: Token; size: number }) {
  const [imgError, setImgError] = useState(false);

  if (token?.icon && !imgError) {
    return (
      <img
        src={token.icon}
        alt={token.symbol}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  const palette = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500'];
  const color = palette[token?.symbol.charCodeAt(0) % palette.length];

  return (
    <div
      className={`${color} rounded-full flex items-center justify-center shrink-0 text-white font-bold`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {token?.symbol[0]}
    </div>
  );
}
