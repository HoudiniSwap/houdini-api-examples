/**
 * Houdini API Type Definitions
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface HoudiniConfig {
  API_BASE_URL: string;
  API_KEY: string;
  API_SECRET: string;
  USER: UserContext;
  STATUS_POLL_INTERVAL: number;
  MAX_POLL_ATTEMPTS: number;
}

export interface UserContext {
  ip: string;
  userAgent: string;
  timezone: string;
}

export interface DeviceInfo {
  deviceInfo: string;
  isMobile: boolean;
  walletInfo: string;
}

// ============================================================================
// Swap Configuration Types
// ============================================================================

export interface StandardSwapConfig {
  amount: string;
  from: string;
  to: string;
  addressTo: string;
  receiverTag: string;
  anonymous: boolean;
}

export interface DexSwapConfig {
  tokenIdFrom: string;
  tokenIdTo: string;
  amount: number;
  addressFrom: string;
  addressTo: string;
  slippage: number;
}

// ============================================================================
// API Request Types
// ============================================================================

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  params?: Record<string, any>;
}

export interface DexQuoteParams {
  tokenIdFrom: string;
  tokenIdTo: string;
  amount: number;
  slippage: number;
}

export interface DexApproveRequest {
  tokenIdFrom: string;
  tokenIdTo: string;
  amount: number;
  addressFrom: string;
  swap: string;
  route: any;
}

export interface DexExchangeRequest {
  tokenIdFrom: string;
  tokenIdTo: string;
  amount: number;
  addressFrom: string;
  addressTo: string;
  route: any;
  swap: string;
  quoteId: string;
  signatures: SignatureObject[];
  destinationTag: string;
  deviceInfo: string;
  isMobile: boolean;
  walletInfo: string;
  slippage: number;
}

export interface StandardExchangeRequest {
  amount: number;
  from: string;
  to: string;
  addressTo: string;
  receiverTag: string;
  anonymous: boolean;
  ip: string;
  userAgent: string;
  timezone: string;
}

export interface ChainSignatureRequest {
  tokenIdFrom: string;
  tokenIdTo: string;
  addressFrom: string;
  route: any;
  swap: string;
  previousSignature: SignatureObject;
  signatureKey: string;
  signatureStep: number;
}

export interface DexConfirmRequest {
  houdiniId: string;
  txHash?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface QuoteResponse {
  amountIn: string;
  amountOut: string;
  amountOutUsd: number;
  type: 'standard' | 'private' | 'dex';
  duration: number;
  quoteId: string;
}

export interface DexQuoteResponse {
  swap: string;
  amountOut: string;
  amountOutUsd?: number;
  quoteId: string;
  raw: any;
  route?: any;
}

export interface Signature {
  type: string;
  key: string;
  step: number;
  totalSteps: number;
  isComplete: boolean;
  swapRequiredMetadata: any;
  data: {
    domain: any;
    types: any;
    primaryType: string;
    message: any;
  };
}

export interface SignatureObject {
  signature: string;
  key: string;
  swapRequiredMetadata: any;
}

export interface ApprovalTransaction {
  to: string;
  data: string;
  value?: string;
}

export interface DexApproveResponse {
  approvals?: ApprovalTransaction[];
  signatures?: Signature[];
}

export interface ChainSignatureResponse {
  chainSignatures?: Signature[];
}

export interface OrderMetadata {
  offChain: boolean;
  to?: string;
  data?: string;
  value?: string;
}

export interface DexExchangeResponse {
  houdiniId: string;
  status: number;
  metadata: OrderMetadata;
}

export interface SwapOrder {
  houdiniId: string;
  status: number;
  created: string;
  expires: string;
  type: string;
  inAmount: string;
  inSymbol: string;
  outAmount: string;
  outSymbol: string;
  senderAddress: string;
  senderTag?: string;
  receiverAddress: string;
}

export interface SwapStatus {
  status: number;
  inStatus?: number;
  outStatus?: number;
  txHash?: string;
  outAmount?: string;
  outSymbol?: string;
  receiverAddress?: string;
  message?: string;
}

// ============================================================================
// Enums
// ============================================================================

export enum SwapStatusCode {
  WAITING = 0,
  CONFIRMING = 1,
  EXCHANGING = 2,
  ANONYMIZING = 3,
  COMPLETED = 4,
  EXPIRED = 5,
  FAILED = 6,
  REFUNDED = 7,
  DELETED = 8,
}

export enum HopStatusCode {
  WAITING_FOR_DEPOSIT = 1,
  DEPOSIT_DETECTED = 2,
  SWAPPING = 3,
  SENDING_TO_NEXT_HOP = 4,
  COMPLETED = 5,
}

// ============================================================================
// Utility Types
// ============================================================================

export interface TransactionData {
  to: string;
  data: string;
  value: string;
}
