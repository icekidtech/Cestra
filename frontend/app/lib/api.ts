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
  method: string;
  details: Record<string, string>;
}

export async function getRecipients(): Promise<Recipient[]> {
  return request<Recipient[]>("/recipients");
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
