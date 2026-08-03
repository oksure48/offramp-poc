import crypto from "crypto";
import { env } from "@/env";

const BASE_URL = env.BITSO_BASE_URL;

function authHeader(method: string, path: string, body: string): string {
  const nonce = Date.now().toString();
  const message = `${nonce}${method.toUpperCase()}${path}${body}`;
  const signature = crypto
    .createHmac("sha256", env.BITSO_API_SECRET)
    .update(message)
    .digest("hex");
  return `Bitso ${env.BITSO_API_KEY}:${nonce}:${signature}`;
}

class BitsoApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options?: { method?: string; body?: Record<string, unknown>; auth?: boolean }
): Promise<T> {
  const method = options?.method ?? "GET";
  const bodyStr = options?.body ? JSON.stringify(options.body) : "";
  const auth = options?.auth ?? true;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = authHeader(method, path, bodyStr);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr || undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    console.error("[bitso] API error", res.status, JSON.stringify(json));
    const msg = json?.error?.message || json?.message || `Bitso API error ${res.status}`;
    throw new BitsoApiError(res.status, msg);
  }
  return json as T;
}

export interface BitsoTicker {
  book: string;
  ask: string;
  bid: string;
  last: string;
  high: string;
  low: string;
  vwap: string;
  volume: string;
  change_24: string;
  created_at: string;
}

export interface BitsoBalance {
  currency: string;
  total: string;
  locked: string;
  available: string;
}

export interface BitsoAccountStatus {
  client_id: string;
  status: string;
  daily_limit?: string;
  daily_remaining?: string;
  monthly_limit?: string;
  monthly_remaining?: string;
  cellphone_number_stored?: boolean;
  email_stored?: boolean;
  official_id?: string;
  proof_of_residency?: string;
}

export interface BitsoConversionQuote {
  id: string;
  from_amount: string;
  from_currency: string;
  to_amount: string;
  to_currency: string;
  rate: string;
  plain_rate: string;
  rate_currency: string;
  created: number;
  expires: number;
  book: string;
  fee_amount?: string;
  fee_currency?: string;
}

export interface BitsoConversionResult {
  oid: string;
}

export interface BitsoUserTrade {
  book: string;
  major: string;
  minor: string;
  major_currency: string;
  minor_currency: string;
  price: string;
  side: "buy" | "sell";
  maker_side: "buy" | "sell";
  fees_amount: string;
  fees_currency: string;
  tid: number;
  oid: string;
  created_at: string;
}

export interface BitsoFunding {
  fid: string;
  status: "pending" | "complete" | "failed";
  created_at: string;
  currency: string;
  method: string;
  method_name?: string;
  amount: string;
  details?: Record<string, unknown>;
}

export interface BitsoWithdrawal {
  wid: string;
  status: "pending" | "processing" | "complete" | "failed";
  created_at: string;
  currency: string;
  method: string;
  method_name?: string;
  amount: string;
  details?: Record<string, unknown>;
}

const STABLECOINS = ["USDC", "USDT"];
const CRYPTO_CURRENCIES = ["BTC", "ETH", "USDC", "USDT", "XRP", "ADA", "SOL", "LTC", "BCH"];

function isCryptoCurrency(currency: string): boolean {
  return CRYPTO_CURRENCIES.includes(currency.toUpperCase());
}

const MOCK_RATES: Record<string, number> = {
  "btc-mxn": 1_150_000, "mxn-btc": 1 / 1_150_000,
  "eth-mxn": 62_000, "mxn-eth": 1 / 62_000,
  "usd-mxn": 18.5, "mxn-usd": 1 / 18.5,
  "usdt-mxn": 18.4, "mxn-usdt": 1 / 18.4,
  "usdc-mxn": 18.4, "mxn-usdc": 1 / 18.4,
  "usd-ars": 1050, "ars-usd": 1 / 1050,
  "usd-cop": 4100, "cop-usd": 1 / 4100,
};

function buildMockQuote(params: {
  fromCurrency: string;
  toCurrency: string;
  spendAmount?: number;
  receiveAmount?: number;
}): BitsoConversionQuote & { isMock?: boolean } {
  const from = params.fromCurrency.toLowerCase();
  const to = params.toCurrency.toLowerCase();
  const rate = MOCK_RATES[`${from}-${to}`] ?? 1;
  const fromAmount = params.spendAmount ?? (params.receiveAmount ?? 0) / rate;
  const toAmount = params.receiveAmount ?? fromAmount * rate;
  const now = Date.now();
  return {
    id: `mock-${now}-${Math.random().toString(36).slice(2, 8)}`,
    from_amount: fromAmount.toFixed(8),
    from_currency: params.fromCurrency.toLowerCase(),
    to_amount: toAmount.toFixed(8),
    to_currency: params.toCurrency.toLowerCase(),
    rate: rate.toFixed(8),
    plain_rate: rate.toFixed(8),
    rate_currency: params.toCurrency.toLowerCase(),
    created: now,
    expires: now + 30_000,
    book: `${from}_${to}`,
    isMock: true,
  };
}

export const bitsoClient = {
  async getTicker(book: string): Promise<BitsoTicker> {
    const json = await request<{ payload: BitsoTicker }>(
      `/v3/ticker/?book=${encodeURIComponent(book)}`,
      { auth: false }
    );
    return json.payload;
  },

  async getAvailableBooks(): Promise<Array<{ book: string; minimum_price: string; maximum_price: string }>> {
    const json = await request<{ payload: Array<{ book: string; minimum_price: string; maximum_price: string }> }>(
      "/v3/available_books/",
      { auth: false }
    );
    return json.payload ?? [];
  },

  async getBalance(): Promise<BitsoBalance[]> {
    const json = await request<{ payload: { balances: BitsoBalance[] } }>("/v3/balance/");
    const balances = json.payload?.balances ?? [];
    return balances.filter((b) => parseFloat(b.total) > 0);
  },

  async getAccountStatus(): Promise<BitsoAccountStatus> {
    const json = await request<{ payload: BitsoAccountStatus }>("/v3/account_status/");
    return json.payload;
  },

  async requestConversionQuote(params: {
    fromCurrency: string;
    toCurrency: string;
    spendAmount?: number;
    receiveAmount?: number;
  }): Promise<BitsoConversionQuote & { isMock?: boolean }> {
    const body: Record<string, unknown> = {
      from_currency: params.fromCurrency.toLowerCase(),
      to_currency: params.toCurrency.toLowerCase(),
    };
    if (params.spendAmount != null) body.spend_amount = String(params.spendAmount);
    else if (params.receiveAmount != null) body.receive_amount = String(params.receiveAmount);

    try {
      const json = await request<{ payload: BitsoConversionQuote }>("/v4/currency_conversions", {
        method: "POST",
        body,
      });
      return json.payload;
    } catch (err) {
      console.warn("[bitso] Conversion quote failed, using mock:", (err as Error).message);
      return buildMockQuote(params);
    }
  },

  async executeConversionQuote(
    quote: BitsoConversionQuote & { isMock?: boolean }
  ): Promise<BitsoConversionResult & { isMock?: boolean }> {
    if (quote.isMock || quote.id.startsWith("mock-")) {
      return { oid: `mock-oid-${Date.now()}`, isMock: true };
    }
    const json = await request<{ payload: BitsoConversionResult }>(
      `/v4/currency_conversions/${encodeURIComponent(quote.id)}`,
      { method: "PUT" }
    );
    return json.payload;
  },

  async listUserTrades(limit = 15): Promise<BitsoUserTrade[]> {
    const json = await request<{ payload: BitsoUserTrade[] }>(
      `/v3/user_trades/?limit=${limit}`
    );
    return json.payload ?? [];
  },

  async listFundings(limit = 15): Promise<BitsoFunding[]> {
    const json = await request<{ payload: BitsoFunding[] }>(
      `/v3/fundings/?limit=${limit}`
    );
    return json.payload ?? [];
  },

  async listWithdrawals(limit = 15): Promise<BitsoWithdrawal[]> {
    const json = await request<{ payload: BitsoWithdrawal[] }>(
      `/v3/withdrawals/?limit=${limit}`
    );
    return json.payload ?? [];
  },

  async getFundingDestination(currency: string): Promise<Record<string, unknown>> {
    const json = await request<{ payload: Record<string, unknown> }>(
      `/v3/funding_destination/?fund_currency=${encodeURIComponent(currency.toLowerCase())}`
    );
    return json.payload;
  },

  async createCryptoWithdrawal(params: {
    currency: string;
    amount: number;
    address: string;
    protocol?: string;
  }): Promise<BitsoWithdrawal> {
    const json = await request<{ payload: BitsoWithdrawal }>("/v3/withdrawals/", {
      method: "POST",
      body: {
        currency: params.currency.toLowerCase(),
        amount: String(params.amount),
        address: params.address,
        protocol: params.protocol ?? params.currency.toLowerCase(),
      },
    });
    return json.payload;
  },

  async createMxnWithdrawal(params: {
    amount: number;
    clabe: string;
    beneficiary: string;
    institutionCode?: string;
    protocol?: "clabe" | "debitcard" | "phonenum";
  }): Promise<BitsoWithdrawal> {
    const json = await request<{ payload: BitsoWithdrawal }>("/v3/withdrawals/", {
      method: "POST",
      body: {
        currency: "mxn",
        protocol: params.protocol ?? "clabe",
        amount: String(params.amount),
        beneficiary: params.beneficiary,
        clabe: params.clabe,
        ...(params.institutionCode ? { institution_code: params.institutionCode } : {}),
      },
    });
    return json.payload;
  },
};

export { isCryptoCurrency, STABLECOINS };
