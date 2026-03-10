import dotenv from 'dotenv';
import type {
  FetchOptions,
} from '../src/types';

dotenv.config();

/**
 * Format status code to human-readable name
 */
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

/**
 * Format inStatus/outStatus for private swaps (multi-hop)
 */
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

/**
 * Format ISO date string to locale string
 */
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const CONFIG = {
  API_BASE_URL: process.env.HOUDINI_API_BASE_URL,
  API_KEY: process.env.HOUDINI_API_KEY || '',
  API_SECRET: process.env.HOUDINI_API_SECRET || '',

  // User context (required headers)
  USER: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    timezone: 'America/New_York'
  },
};

/**
 * Make authenticated request to Houdini API
 */
export async function fetchFromHoudini<T = any>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  // Build URL with query parameters
  let url = `${CONFIG.API_BASE_URL}${endpoint}`;
  if (params) {
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    url += `?${queryString}`;
  }

  // Prepare headers
  const headers: Record<string, string> = {
    'Authorization': `${CONFIG.API_KEY}:${CONFIG.API_SECRET}`,
    'x-user-ip': CONFIG.USER.ip,
    'x-user-agent': CONFIG.USER.userAgent,
    'x-user-timezone': CONFIG.USER.timezone,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  // Make request
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  return await response.json() as T;
}
