'use client';

import { createAppKit } from '@reown/appkit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, cookieToInitialState, type Config } from 'wagmi';
import {
  wagmiAdapter,
  solanaAdapter,
  bitcoinAdapter,
  networks,
  projectId,
} from '@/config';

const queryClient = new QueryClient();

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter, bitcoinAdapter],
  networks,
  projectId,
  metadata: {
    name: 'Houdini Swap',
    description: 'Cross-chain crypto swap',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://houdiniswap.com',
    icons: [],
  },
  features: {
    analytics: false,
  },
});

export function AppKitProvider({
  children,
  cookies,
}: {
  children: React.ReactNode;
  cookies: string | null;
}) {
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies
  );

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
