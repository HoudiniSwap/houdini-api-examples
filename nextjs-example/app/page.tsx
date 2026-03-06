import { SwapForm } from '@/components/SwapForm';
import { WalletButton } from '@/components/WalletButton';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-100">
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-700">Houdini Swap</h1>
        <WalletButton />
      </div>
      <SwapForm />
    </main>
  );
}
