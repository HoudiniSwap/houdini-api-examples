import { type NextRequest, NextResponse } from 'next/server';
import { fetchFromHoudini } from '@/lib/helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await fetchFromHoudini('/v2/exchanges', { method: 'POST', body });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create exchange' },
      { status: 500 }
    );
  }
}
