import { env } from "@/env";

const BASE_URL = "https://api.lightspark.com/grid/2025-10-13";

function authHeader(): string {
  const creds = Buffer.from(
    `${env.LIGHTSPARK_CLIENT_ID}:${env.LIGHTSPARK_CLIENT_SECRET}`
  ).toString("base64");
  return `Basic ${creds}`;
}

class LightsparkApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("[lightspark] API error", res.status, JSON.stringify(json));
    const msg =
      json?.message || json?.error || `LightSpark API error ${res.status}`;
    throw new LightsparkApiError(res.status, msg);
  }
  return json as T;
}

export interface LightsparkCurrency {
  code: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

export interface LightsparkExchangeRate {
  sourceCurrency: LightsparkCurrency;
  destinationCurrency: LightsparkCurrency;
  sendingAmount: number;
  minSendingAmount: number;
  maxSendingAmount: number;
  receivingAmount: number;
  exchangeRate: number;
  destinationPaymentRail: string;
  fees: {
    fixedAmount?: number;
    totalAmount?: number;
  };
  updatedAt: string;
}

export interface LightsparkInternalAccount {
  id: string;
  type: "INTERNAL_FIAT" | "INTERNAL_CRYPTO" | "EMBEDDED_WALLET";
  status: "PENDING" | "ACTIVE" | "CLOSED" | "FROZEN";
  balance: { amount: number; currency: LightsparkCurrency };
  totalBalance: { amount: number; currency: LightsparkCurrency };
  fundingPaymentInstructions?: Array<{ accountOrWalletInfo: Record<string, unknown>; instructionsNotes?: string }>;
  customerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LightsparkCustomer {
  id: string;
  customerType: "INDIVIDUAL" | "BUSINESS";
  platformCustomerId?: string;
  fullName?: string;
  email?: string;
  region?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LightsparkExternalAccount {
  id: string;
  status: string;
  accountInfo: {
    accountType: string;
    fullName?: string;
    pixKey?: string;
    bankCode?: string;
    bankName?: string;
    [key: string]: unknown;
  };
  customerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LightsparkTransaction {
  id: string;
  type: "INCOMING" | "OUTGOING" | "CARD";
  status: string;
  customerId?: string;
  platformCustomerId?: string;
  createdAt: string;
  updatedAt: string;
  settledAt?: string | null;
  description?: string | null;
  sentAmount?: { amount: number; currency: string } | null;
  receivedAmount?: { amount: number; currency: string } | null;
  fees?: { amount: number; currency: string } | null;
  exchangeRate?: number | null;
  paymentRail?: string | null;
  failureReason?: string | null;
}

export interface LightsparkQuote {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | string;
  source: { sourceType: string; accountId?: string };
  destination: { destinationType: string; accountId?: string };
  totalSendingAmount: number;
  totalReceivingAmount: number;
  sendingCurrency?: LightsparkCurrency;
  receivingCurrency?: LightsparkCurrency;
  exchangeRate?: number;
  feesIncluded?: number;
  expiresAt?: string;
  transactionId?: string;
  paymentInstructions?: Record<string, unknown>[];
  createdAt?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string | null;
  totalCount: number;
}

export const lightsparkClient = {
  async getCustomers(
    limit = 20
  ): Promise<PaginatedResponse<LightsparkCustomer>> {
    return request<PaginatedResponse<LightsparkCustomer>>(
      `/customers?limit=${limit}`
    );
  },

  async getExchangeRates(params?: {
    sourceCurrency?: string;
    destinationCurrency?: string[];
    sendingAmount?: number;
  }): Promise<LightsparkExchangeRate[]> {
    const qs = new URLSearchParams();
    if (params?.sourceCurrency)
      qs.set("sourceCurrency", params.sourceCurrency);
    if (params?.sendingAmount)
      qs.set("sendingAmount", String(params.sendingAmount));
    if (params?.destinationCurrency) {
      for (const c of params.destinationCurrency)
        qs.append("destinationCurrency", c);
    }
    const data = await request<{ data: LightsparkExchangeRate[] }>(
      `/exchange-rates?${qs.toString()}`
    );
    return data.data ?? [];
  },

  async getTransactions(
    limit = 20
  ): Promise<PaginatedResponse<LightsparkTransaction>> {
    return request<PaginatedResponse<LightsparkTransaction>>(
      `/transactions?limit=${limit}&sortOrder=desc`
    );
  },

  async createQuote(params: {
    sourceAccountId: string;
    destinationAccountId: string;
    lockedCurrencySide: "SENDING" | "RECEIVING";
    lockedCurrencyAmount: number;
    description?: string;
    senderCustomerInfo?: Record<string, string>;
  }): Promise<LightsparkQuote> {
    const body: Record<string, unknown> = {
      source: { sourceType: "ACCOUNT", accountId: params.sourceAccountId },
      destination: { destinationType: "ACCOUNT", accountId: params.destinationAccountId },
      lockedCurrencySide: params.lockedCurrencySide,
      lockedCurrencyAmount: params.lockedCurrencyAmount,
      description: params.description,
    };
    if (params.senderCustomerInfo) {
      body.senderCustomerInfo = params.senderCustomerInfo;
    }
    return request<LightsparkQuote>("/quotes", { method: "POST", body: JSON.stringify(body) });
  },

  async executeQuote(quoteId: string): Promise<LightsparkQuote> {
    return request<LightsparkQuote>(`/quotes/${quoteId}/execute`, {
      method: "POST",
    });
  },

  async getPlatformInternalAccounts(): Promise<LightsparkInternalAccount[]> {
    const data = await request<PaginatedResponse<LightsparkInternalAccount>>(
      "/platform/internal-accounts"
    );
    return data.data ?? [];
  },

  async sandboxFundAccount(
    accountId: string,
    amount: number
  ): Promise<LightsparkInternalAccount> {
    return request<LightsparkInternalAccount>(
      `/sandbox/internal-accounts/${encodeURIComponent(accountId)}/fund`,
      { method: "POST", body: JSON.stringify({ amount }) }
    );
  },

  async getTransaction(txnId: string): Promise<LightsparkTransaction> {
    return request<LightsparkTransaction>(`/transactions/${encodeURIComponent(txnId)}`);
  },

  async getCustomerExternalAccounts(customerId: string): Promise<LightsparkExternalAccount[]> {
    const data = await request<PaginatedResponse<LightsparkExternalAccount>>(
      `/customers/external-accounts?customerId=${encodeURIComponent(customerId)}`
    );
    return data.data ?? [];
  },
};

export function formatLightsparkAmount(
  amount: number,
  currencyCode: string,
  decimals?: number
): string {
  const code = currencyCode.toUpperCase();
  const divisor = decimals != null ? Math.pow(10, decimals) : getDefaultDecimals(code);

  if (code === "BTC") {
    const btc = amount / divisor;
    if (btc < 0.001) return `${(amount / 100).toLocaleString()} sats`;
    return `${btc.toFixed(8)} BTC`;
  }

  const value = amount / divisor;
  const cryptoCodes = ["USDC", "USDT", "USDB", "EURC"];
  if (cryptoCodes.includes(code)) {
    return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`;
  }
}

function getDefaultDecimals(code: string): number {
  if (code === "BTC") return 8;
  // Zero-decimal currencies
  if (["VND", "TZS", "UGX", "RWF", "XOF", "XAF"].includes(code)) return 0;
  return 2;
}

export function railLabel(rail: string): string {
  const labels: Record<string, string> = {
    ACH: "ACH",
    RTP: "RTP",
    WIRE: "Wire",
    SEPA: "SEPA",
    SEPA_INSTANT: "SEPA Instant",
    PIX: "PIX",
    UPI: "UPI",
    SPARK: "Spark (Lightning)",
    CRYPTO: "Crypto",
    BANK_TRANSFER: "Bank Transfer",
    FASTER_PAYMENTS: "Faster Payments",
    SPEI: "SPEI",
    MOBILE_MONEY: "Mobile Money",
    PAYNOW: "PayNow",
  };
  return labels[rail] ?? rail;
}
