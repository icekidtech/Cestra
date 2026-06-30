const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/v1";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("cestra_token") : null;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Request failed" }));
    throw new ApiError(body.message || `HTTP ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

// --- Auth ---

export interface LoginResponse {
  access_token: string;
  wallet_address: string;
  user_id: string;
}

export async function login(
  zkloginToken: string,
  provider: "google" | "apple"
): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ zklogin_token: zkloginToken, provider }),
  });
}

// --- KYC ---

export interface KycSessionResponse {
  session_url: string;
  tier: number;
}

export async function initiateKyc(tier: 1 | 2 | 3): Promise<KycSessionResponse> {
  return request<KycSessionResponse>("/auth/kyc", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

// DEV ONLY — advance KYC tier without Persona (for demos).
export async function devUpgradeKyc(): Promise<{ kyc_tier: number }> {
  return request<{ kyc_tier: number }>("/auth/kyc/dev-upgrade", {
    method: "POST",
  });
}

// --- Wallet ---

export interface WalletBalance {
  balance_usdsui: number;
  yield_balance: number;
  yield_enabled: boolean;
  apy: number;
}

export async function getWalletBalance(): Promise<WalletBalance> {
  return request<WalletBalance>("/wallet/balance");
}

// --- Recipients ---

export interface Recipient {
  id: string;
  name: string;
  country: string;
  mobile_money_type: string;
  account_number: string;
}

export async function getRecipients(): Promise<Recipient[]> {
  return request<Recipient[]>("/recipients");
}

export interface CreateRecipientInput {
  name: string;
  country: string; // ISO 3166-1 alpha-2, e.g. "NG"
  mobile_money_type: string; // e.g. "bank", "mpesa", "mtn"
  account_number: string;
}

export async function createRecipient(
  input: CreateRecipientInput
): Promise<Recipient> {
  return request<Recipient>("/recipients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Send ---

export interface CreateSendInput {
  amount: number;
  recipient_id: string;
  corridor: string;
}

export interface SendResult {
  id: string;
  status: string;
  amount: string;
  fee: string;
  corridor: string;
  on_chain_tx_hash?: string | null;
  created_at: string;
}

export async function createSend(
  input: CreateSendInput,
  idempotencyKey?: string
): Promise<SendResult> {
  return request<SendResult>("/send", {
    method: "POST",
    body: JSON.stringify(input),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  });
}

export interface SendStatus {
  tx_id: string;
  status: string;
  on_chain_tx_hash?: string | null;
  amount: number;
  fee: number;
  corridor: string;
  created_at: string;
  estimated_delivery: string | null;
}

export async function getSendStatus(txId: string): Promise<SendStatus> {
  return request<SendStatus>(`/send/${txId}/status`);
}

// --- Wallet funding ---

export interface FundAchInput {
  amount: number;
  account_id: string;
}

export async function fundWalletAch(input: FundAchInput): Promise<unknown> {
  return request("/wallet/fund/ach", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// DEV ONLY — instantly credit the wallet for demos.
export interface DevCreditResult {
  status: string;
  credited: number;
  balance_usdsui: number;
  message: string;
}

export async function devCreditWallet(amount: number): Promise<DevCreditResult> {
  return request<DevCreditResult>("/wallet/fund/dev", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

// --- Yield / Savings ---

export interface YieldEnableResult {
  yield_enabled: boolean;
  balance_usdsui: number;
  yield_balance: number;
  message: string;
}

/** Enable the yield wallet (requires risk acknowledgment). */
export async function enableYield(): Promise<YieldEnableResult> {
  return request<YieldEnableResult>("/yield/enable", {
    method: "POST",
    body: JSON.stringify({ acknowledged: true }),
  });
}

export async function withdrawYield(amount: number): Promise<unknown> {
  return request("/yield/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

// --- Transactions ---

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface TransactionListResponse {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export async function getTransactions(
  page = 1,
  limit = 20
): Promise<TransactionListResponse> {
  return request<TransactionListResponse>(
    `/transactions?page=${page}&limit=${limit}`
  );
}

export { ApiError };
