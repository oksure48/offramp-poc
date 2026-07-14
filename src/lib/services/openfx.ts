import { sign, type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { env } from "@/env";

const BASE_URL = env.OPENFX_BASE_URL;
const ORG_ID = env.OPENFX_ORG_ID;
const KEY_NAME = `org/${ORG_ID}/apiKey/${env.OPENFX_API_KEY_ID}`;

function createAuthToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: ["developer-api"],
    iss: "openfx",
    sub: KEY_NAME,
    iat: now,
    nbf: now,
    exp: now + 110, // max 120s allowed by OpenFX
  };
  const options: SignOptions = {
    header: {
      alg: "ES256",
      kid: KEY_NAME,
      nonce: crypto.randomBytes(16).toString("hex"),
    } as SignOptions["header"],
  };
  return sign(payload, env.OPENFX_PRIVATE_KEY, options);
}

class OpenFXApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options?: RequestInit & { idempotent?: boolean }
): Promise<T> {
  const { idempotent, headers: extraHeaders, ...rest } = options ?? {};
  const headers: Record<string, string> = {
    Authorization: `Bearer ${createAuthToken()}`,
    "Content-Type": "application/json",
    "x-app-mode": env.OPENFX_APP_MODE,
  };
  if (idempotent) headers["Idempotency-Key"] = crypto.randomUUID();
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === "error") {
    console.error("[openfx] API error", res.status, JSON.stringify(json));
    const msg = json?.message || `OpenFX API error ${res.status}`;
    throw new OpenFXApiError(res.status, msg);
  }
  return json as T;
}

export interface OpenFXBalance {
  id: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  totalBalanceInUSD: number;
  withdrawableBalanceInUSD: number;
  withdrawableBalance: number;
}

export interface OpenFXBalancesResponse {
  balances: OpenFXBalance[];
  netPositiveBalanceInUSD: number;
  netNegativeBalanceInUSD: number;
  netBalanceInUSD: number;
}

export interface OpenFXTradingPair {
  buy: string;
  sell: string;
}

export interface OpenFXMarkets {
  tradingPairs: OpenFXTradingPair[];
  tradeLimits: Record<string, { minTradeLimit: number; maxTradeLimit: number }>[];
}

export interface OpenFXQuote {
  id: string;
  userId: string;
  buy: string;
  sell: string;
  referencedUnit: string;
  referencedAmount: number;
  quoteAmount: number;
  createdAt: string;
  expiryTimeinSeconds: number;
}

export interface OpenFXTrade {
  id: string;
  tradingPair: string;
  referencedUnit: string;
  tradeDirection: "BUY" | "SELL";
  amount: number;
  computedAmount: number;
  createdAtUtc: string;
  updatedAtUtc: string;
  orderType: string;
  status: string;
  source: "API" | "GUI" | "OTC";
}

export interface OpenFXExecuteTradeResult {
  balances: Record<string, number>;
  trade: {
    id: string;
    buy: string;
    sell: string;
    referencedUnit: string;
    referencedAmount: number;
    amount: number;
    status: string;
    transactedAt: string;
    quoteId: string;
  };
  userCreditLimit: number;
  userCreditUsed: number;
}

export interface OpenFXDeposit {
  id: string;
  currency: string;
  amount: number;
  status: "PENDING" | "COMPLETED" | "ERROR";
  network: string;
  createdAt: string;
  transactionHash: string | null;
  comments: string | null;
  referenceId: string | null;
}

export interface OpenFXWithdrawal {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  network: string;
  status: "COMPLETED" | "PENDING" | "CANCELLED";
  transactionHash: string | null;
  withdrawalAddressId: string;
  comments?: string;
}

export interface OpenFXCryptoWithdrawalAddress {
  id: string;
  name: string;
  coinName: string;
  coinNetworkName: string;
  address: string;
  status: string;
  verified: boolean;
}

export interface OpenFXFiatWithdrawalAddress {
  id: string;
  currency: string;
  nickname: string | null;
  accountName: string;
  accountNumber: string;
  bankName: string;
  transferType: string;
  status: string;
  verified: boolean;
}

const STABLECOINS = ["USDC", "USDT", "EURC"];

function isFiatCurrency(currency: string): boolean {
  return !STABLECOINS.includes(currency);
}

const FX_RATES: Record<string, number> = {
  "USD-USDC": 0.9985, "USDC-USD": 1.0015,
  "USD-USDT": 0.9990, "USDT-USD": 1.0010,
  "USD-EUR": 0.9215, "EUR-USD": 1.0852,
  "USD-GBP": 0.7891, "GBP-USD": 1.2672,
  "USDC-EUR": 0.9200, "EUR-USDC": 1.0870,
};

function buildMockQuote(params: {
  amount: number;
  buy: string;
  sell: string;
  referencedUnit: string;
  quoteForSeconds?: number;
}): OpenFXQuote {
  const rate = FX_RATES[`${params.sell}-${params.buy}`] ?? 1.0;
  const quoteAmount =
    params.referencedUnit === params.sell
      ? Number((params.amount * rate).toFixed(6))
      : Number((params.amount / rate).toFixed(6));
  return {
    id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: "mock-user",
    buy: params.buy,
    sell: params.sell,
    referencedUnit: params.referencedUnit,
    referencedAmount: params.amount,
    quoteAmount,
    createdAt: new Date().toISOString(),
    expiryTimeinSeconds: params.quoteForSeconds ?? 30,
  };
}

export const openfxClient = {
  orgId: ORG_ID,

  async getBalances(): Promise<OpenFXBalancesResponse> {
    const json = await request<{
      data: OpenFXBalance[];
      netPositiveBalanceInUSD: number;
      netNegativeBalanceInUSD: number;
      netBalanceInUSD: number;
    }>(`/v2/brokerage/${ORG_ID}/balances`);
    return {
      balances: json.data ?? [],
      netPositiveBalanceInUSD: json.netPositiveBalanceInUSD ?? 0,
      netNegativeBalanceInUSD: json.netNegativeBalanceInUSD ?? 0,
      netBalanceInUSD: json.netBalanceInUSD ?? 0,
    };
  },

  async getMarkets(): Promise<OpenFXMarkets> {
    const json = await request<{ data: OpenFXMarkets }>(
      `/v2/brokerage/${ORG_ID}/available_markets`
    );
    return json.data ?? { tradingPairs: [], tradeLimits: [] };
  },

  async generateQuote(params: {
    amount: number;
    buy: string;
    sell: string;
    referencedUnit: string;
    quoteForSeconds?: 3 | 15 | 30 | 45 | 60;
  }): Promise<OpenFXQuote & { isMock?: boolean }> {
    try {
      const json = await request<{ data: { quote: OpenFXQuote } }>(
        `/v2/brokerage/${ORG_ID}/generate_quote`,
        { method: "POST", idempotent: true, body: JSON.stringify(params) }
      );
      return json.data.quote;
    } catch (err) {
      console.warn("[openfx] Quote API failed, using mock:", (err as Error).message);
      return { ...buildMockQuote(params), isMock: true };
    }
  },

  async executeTrade(
    quote: OpenFXQuote & { isMock?: boolean }
  ): Promise<OpenFXExecuteTradeResult & { isMock?: boolean }> {
    if (quote.isMock || quote.id.startsWith("mock-")) {
      return {
        balances: {},
        trade: {
          id: `mock-trade-${Date.now()}`,
          buy: quote.buy,
          sell: quote.sell,
          referencedUnit: quote.referencedUnit,
          referencedAmount: quote.referencedAmount,
          amount: quote.quoteAmount,
          status: "EXECUTED",
          transactedAt: new Date().toISOString(),
          quoteId: quote.id,
        },
        userCreditLimit: 0,
        userCreditUsed: 0,
        isMock: true,
      };
    }
    const json = await request<{ data: OpenFXExecuteTradeResult }>(
      `/v2/brokerage/${ORG_ID}/trade`,
      { method: "POST", idempotent: true, body: JSON.stringify({ quoteId: quote.id }) }
    );
    return json.data;
  },

  async listTrades(limit = 10): Promise<OpenFXTrade[]> {
    const json = await request<{ data: OpenFXTrade[] }>(
      `/v2/brokerage/${ORG_ID}/trades?limit=${limit}`
    );
    return json.data ?? [];
  },

  async listDeposits(limit = 10): Promise<OpenFXDeposit[]> {
    const json = await request<{ data: OpenFXDeposit[] }>(
      `/v2/brokerage/${ORG_ID}/deposits?limit=${limit}`
    );
    return json.data ?? [];
  },

  async listWithdrawals(limit = 10): Promise<OpenFXWithdrawal[]> {
    const json = await request<{ data: OpenFXWithdrawal[] }>(
      `/v2/brokerage/${ORG_ID}/withdrawals?limit=${limit}`
    );
    return json.data ?? [];
  },

  async listCryptoWithdrawalAddresses(): Promise<OpenFXCryptoWithdrawalAddress[]> {
    const json = await request<{ data: OpenFXCryptoWithdrawalAddress[] }>(
      `/v2/brokerage/${ORG_ID}/withdrawal_addresses?limit=50`
    );
    return json.data ?? [];
  },

  async listFiatWithdrawalAddresses(): Promise<OpenFXFiatWithdrawalAddress[]> {
    const json = await request<{ data: OpenFXFiatWithdrawalAddress[] }>(
      `/v2/brokerage/${ORG_ID}/fiat_withdrawal_addresses?limit=50`
    );
    return json.data ?? [];
  },

  async initiateWithdrawal(params: {
    amount: number;
    currency: string;
    withdrawalAddressId: string;
  }): Promise<OpenFXWithdrawal> {
    const path = isFiatCurrency(params.currency) ? "fiat_withdrawal" : "withdrawal";
    const json = await request<{ data: OpenFXWithdrawal }>(
      `/v2/brokerage/${ORG_ID}/${path}`,
      {
        method: "POST",
        idempotent: true,
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency,
          withdrawalAddressId: params.withdrawalAddressId,
        }),
      }
    );
    return json.data;
  },
};

export { isFiatCurrency };
