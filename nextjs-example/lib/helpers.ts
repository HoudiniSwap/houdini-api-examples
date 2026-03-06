import type { FetchOptions } from './types';

const API_BASE_URL = process.env.HOUDINI_API_BASE_URL;

export function getStatusName(statusCode: number): string {
  const statusNames: Record<number, string> = {
    0: 'WAITING',
    1: 'CONFIRMING',
    2: 'EXCHANGING',
    3: 'ANONYMIZING',
    4: 'COMPLETED',
    5: 'EXPIRED',
    6: 'FAILED',
    7: 'REFUNDED',
    8: 'DELETED',
  };
  return statusNames[statusCode] || `UNKNOWN(${statusCode})`;
}

export function getHopStatus(statusCode: number): string {
  const hopStatuses: Record<number, string> = {
    1: 'Waiting for deposit',
    2: 'Deposit detected',
    3: 'Swapping',
    4: 'Sending to next hop',
    5: 'Completed',
  };
  return hopStatuses[statusCode] || `Status ${statusCode}`;
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make authenticated request to Houdini API.
 * Intended for use in Next.js API routes (server-side) only —
 * API_KEY and API_SECRET must never be exposed to the browser.
 */
export async function fetchFromHoudini<T = any>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    url += `?${new URLSearchParams(params as Record<string, string>).toString()}`;
  }
  console.log('url', url)
  const headers: Record<string, string> = {
    Authorization: `${process.env.HOUDINI_API_KEY}:${process.env.HOUDINI_API_SECRET}`,
    'x-user-ip': '192.168.1.1',
    'x-user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-user-timezone': 'America/New_York',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}
