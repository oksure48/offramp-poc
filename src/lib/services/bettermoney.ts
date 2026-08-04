import { env } from "@/env";

const BASE_URL = env.BETTERMONEY_BASE_URL;

class BetterMoneyApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options?: { method?: string; body?: Record<string, unknown> }
): Promise<T> {
  const method = options?.method ?? "GET";
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "x-api-key": env.BETTERMONEY_API_KEY,
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[bettermoney] API error", res.status, JSON.stringify(json));
    const msg = json?.error || `BetterMoney API error ${res.status}`;
    throw new BetterMoneyApiError(res.status, msg);
  }
  return json as T;
}

export interface BetterMoneySupportedAsset {
  chain: string;
  symbol: string;
  tokenAddress: string;
  tokenDecimals: number;
}

export interface BetterMoneyWallet {
  address: string;
  chain: string;
  status: "PENDING" | "INITIATED" | "ACTIVATING" | "ACTIVE" | "FAILED";
}

export interface BetterMoneyUser {
  id: string;
  label: string;
  accountId?: string;
  wallets: BetterMoneyWallet[];
}

export interface BetterMoneyAccountLimits {
  accountId: string;
  maxTxUsd: { limit: number; used: number; remaining: number };
  maxCountPerEpoch: { limit: number; used: number; remaining: number };
  maxValuePerEpochUsd: { limit: number; used: number; remaining: number };
}

export interface BetterMoneyDepositAddress {
  chain: string;
  symbol: string;
  address: string;
}

export type BetterMoneyQuote =
  | {
      serviceable: true;
      quoteId: string;
      toAddress: string;
      toChain: string;
      asset: string;
      amountUsd: number;
      feeBps: number;
      feeUsd: number;
      status: "ACTIVE" | "CONSUMED" | "EXPIRED";
      createdAt: string;
      expiresAt: string;
    }
  | {
      serviceable: false;
      toAddress: string;
      toChain: string;
      asset: string;
      amountUsd: number;
      reason: "UNABLE_TO_SERVICE";
    };

export interface BetterMoneyInboundTransfer {
  sender: string;
  amountUsd: number;
  chain: string;
  asset: string;
  transactionHash: string;
  observedAt: string;
  status: "PENDING_VERIFICATION" | "ONCHAIN_CONFIRMED" | "CONFIRMED" | "RETURNING" | "RETURNED" | "FAILED";
  version?: number;
}

export interface BetterMoneyPaymentOrder {
  id: string;
  mode: "standard" | "instant";
  fromUserId: string | null;
  status:
    | "AWAITING_FUNDS"
    | "CANCELED"
    | "FUNDED"
    | "LOCKED"
    | "REMEDIATING_OVERFUNDED"
    | "REMEDIATING_EXPIRED"
    | "REFUND_PENDING"
    | "REFUNDED"
    | "REFUND_REJECTED"
    | "REFUND_FAILED"
    | "DISTRIBUTION_SUBMITTED"
    | "DISTRIBUTED"
    | "DISTRIBUTION_REJECTED"
    | "DISTRIBUTION_FAILED"
    | "SETTLEMENT_PENDING"
    | "SETTLEMENT_SUBMITTED"
    | "SETTLED"
    | "SETTLEMENT_REJECTED"
    | "SETTLEMENT_FAILED"
    | "EXPIRED";
  asset: string;
  toChain: string;
  toAddress: string;
  amountUsd: number;
  memo?: string | null;
  createdAt: string;
  expiresAt: string;
  receivedTotal?: number;
  inboundTransfers?: BetterMoneyInboundTransfer[];
  distributionTransactionHash?: string;
  cancelReason?: string;
  canceledAt?: string;
  refundedAt?: string;
}

export const bettermoneyClient = {
  async getSupportedAssets(): Promise<BetterMoneySupportedAsset[]> {
    return request<BetterMoneySupportedAsset[]>("/supported-assets");
  },

  async getAccountLimits(): Promise<BetterMoneyAccountLimits> {
    return request<BetterMoneyAccountLimits>("/account/limits");
  },

  async listDepositAddresses(): Promise<BetterMoneyDepositAddress[]> {
    return request<BetterMoneyDepositAddress[]>("/deposit-addresses");
  },

  async listUsers(limit = 50, offset = 0): Promise<{ users: BetterMoneyUser[]; total: number }> {
    return request<{ users: BetterMoneyUser[]; total: number }>(
      `/users?limit=${limit}&offset=${offset}`
    );
  },

  async addUserRecord(params: {
    label: string;
    wallets: Array<{ address: string; chain: string }>;
  }): Promise<BetterMoneyUser> {
    const json = await request<{ message: string; data: BetterMoneyUser }>("/add-user-record", {
      method: "POST",
      body: params,
    });
    return json.data;
  },

  async createQuote(params: {
    toAddress: string;
    toChain: string;
    asset: string;
    amountUsd: number;
  }): Promise<BetterMoneyQuote> {
    return request<BetterMoneyQuote>("/quotes", { method: "POST", body: params });
  },

  async createPayment(params: {
    mode?: "standard" | "instant";
    fromUserId: string;
    quoteId?: string;
    toAddress: string;
    toChain: string;
    asset: string;
    amountUsd: number;
    memo?: string;
    idempotencyKey?: string;
    expiresAt?: string;
  }): Promise<{ paymentOrderId: string; paymentOrder: BetterMoneyPaymentOrder; depositAddresses: BetterMoneyDepositAddress[] }> {
    return request("/payment", { method: "POST", body: params });
  },

  async listPaymentOrders(params?: {
    fromUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ paymentOrders: BetterMoneyPaymentOrder[]; total?: number }> {
    const qs = new URLSearchParams();
    if (params?.fromUserId) qs.set("fromUserId", params.fromUserId);
    qs.set("limit", String(params?.limit ?? 25));
    qs.set("offset", String(params?.offset ?? 0));
    return request(`/payment-orders?${qs.toString()}`);
  },

  async getPaymentOrder(id: string): Promise<BetterMoneyPaymentOrder> {
    return request<BetterMoneyPaymentOrder>(`/payment-orders/${encodeURIComponent(id)}`);
  },

  async cancelPaymentOrder(id: string, reason?: string): Promise<void> {
    await request(`/payment-orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: reason ? { reason } : {},
    });
  },

  async confirmTransactions(
    id: string,
    transactions: Array<{ hash: string; chain: string }>
  ): Promise<{ paymentOrderId: string; transfersProcessed: number }> {
    const json = await request<{ message: string; data: { paymentOrderId: string; transfersProcessed: number } }>(
      `/payment-orders/${encodeURIComponent(id)}/transactions`,
      { method: "POST", body: { transactions } }
    );
    return json.data;
  },
};
