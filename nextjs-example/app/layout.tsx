import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AppKitProvider } from '@/context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Houdini Swap - Next.js Example',
  description: 'Next.js example for integrating with Houdini Swap API',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookies = headers().get('cookie');

  return (
    <html lang="en">
      <body>
        <AppKitProvider cookies={cookies}>{children}</AppKitProvider>
      </body>
    </html>
  );
}
