import { type NextRequest, NextResponse } from 'next/server';
import { fetchFromHoudini } from '@/lib/helpers';

export async function POST(request: NextRequest) {
  try {
    const { houdiniId, txHash } = await request.json();
    const data = await fetchFromHoudini('/v2/dex/confirmTx', {
      method: 'POST',
      body: { id: houdiniId, txHash },
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to confirm transaction' },
      { status: 500 }
    );
  }
}
