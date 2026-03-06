import { type NextRequest, NextResponse } from 'next/server';

const TOKENS_URL = `${process.env.HOUDINI_API_BASE_URL}/v2/tokens`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const params = new URLSearchParams({ pageSize: '20', page: '1' });
  const term = searchParams.get('term');
  if (term) params.set('term', term);
  const res = await fetch(`${TOKENS_URL}?${params}`, {
    headers: {
      Authorization: `${process.env.HOUDINI_API_KEY}:${process.env.HOUDINI_API_SECRET}`,
    },
    next: { revalidate: 60 },
  });
  console.log('res', res);
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
