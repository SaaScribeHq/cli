import { API_URL } from "./config";

export type TransactionStatus = "APPROVED" | "PENDING" | "FAILED" | "REVERSED";
export type PaymentMethod = "GPO" | "REF";

export type Page = { total: number; page: number; pageSize: number };

export type Transaction = {
  id: string;
  description: string;
  status: TransactionStatus;
  paymentMethod: PaymentMethod | null;
  amount: string;
  fee: string;
  fixedFee: string;
  netAmount: string;
  customer: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
};

export type TransactionDetail = Omit<Transaction, "customer"> & {
  updatedAt: string;
  details: {
    providerReference: string | null;
    phoneNumber: string | null;
    entity: string | null;
    reference: string | null;
    expiresAt: string | null;
    error: string | null;
  };
  customer: { id: string; name: string | null; email: string | null; phoneNumber: string | null } | null;
  paymentIntent: { id: string; title: string; description: string | null; amount: string; checkoutUrl: string } | null;
};

export type Customer = {
  id: string;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  transactionCount: number;
  totalSpent: string;
  lastTransactionAt: string | null;
  createdAt: string;
};

export type PaymentIntent = { id: string; amount: string; title: string; description: string | null; createdAt: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: Record<string, string[]>,
  ) {
    super(message);
  }
}

// Calls the developer API (/v1) with the account's secret key.
export async function request<T>(token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `Can't reach the Saascribe API at ${API_URL}. Is it running?`);
  }

  const data = (await res.json().catch(() => null)) as { error?: string; issues?: Record<string, string[]> } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (HTTP ${res.status})`, data?.issues);
  return data as T;
}
