import { type NextRequest, NextResponse } from 'next/server';
import { fetchFromHoudini } from '@/lib/helpers';
import type { QuotesResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  const data = await fetchFromHoudini<QuotesResponse>('/v2/quotes', { params });
  return NextResponse.json(data);
}
