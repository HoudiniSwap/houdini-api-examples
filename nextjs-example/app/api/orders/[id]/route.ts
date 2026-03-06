import { type NextRequest, NextResponse } from 'next/server';
import { fetchFromHoudini } from '@/lib/helpers';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await fetchFromHoudini(`/v2/orders/${params.id}`);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch order' },
      { status: 500 }
    );
  }
}
