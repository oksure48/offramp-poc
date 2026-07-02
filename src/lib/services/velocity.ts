import { env } from "@/env";

const BASE_URL = env.VELOCITY_BASE_URL;
const ENTITY_ID = env.VELOCITY_CUSTOMER_ENTITY_ID;
const OPERATOR_ENTITY_ID = env.VELOCITY_OPERATOR_ENTITY_ID;

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.VELOCITY_API_KEY}`,
    "Content-Type": "application/json",
    "X-Customer-Entity-Id": ENTITY_ID,
    "X-Velocity-Entity-Id": OPERATOR_ENTITY_ID,
  };
}

class VelocityApiError extends Error {
  constructor(public readonly errorCode: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("[velocity] API error", res.status, JSON.stringify(json));
    const details = json?.error_details?.validation_errors
      ? Object.entries(json.error_details.validation_errors).map(([k, v]) => `${k}: ${v}`).join("; ")
      : null;
    const msg = details || json?.error_message || json?.message || `Velocity API error ${res.status}`;
    throw new VelocityApiError(json?.error_code ?? "UNKNOWN", msg);
  }
  return json as T;
}

export interface VelocityWallet {
  id: string;
  label: string | null;
  address: string | null;
  asset: string | null;
  network: string | null;
  network_name: string | null;
  status: string;
  balance?: { available: string; currency: string; pending: string; total: string } | null;
}

export interface VelocityBankAccount {
  id: string;
  label: string | null;
  currency: string | null;
  iban: string | null;
  account_number: string | null;
  bank_name: string | null;
  account_holder: string | null;
  status: string | null;
  balance?: { available: string; currency: string; pending: string; total: string } | null;
}

export interface VelocityQuote {
  quote_id: string;
  idempotency_key: string;
  source: {
    account_id: string;
    asset_symbol: string;
    payment_rail_code: string;
    amount: { value: string; currency: string };
    type: "FIAT" | "CRYPTO";
  };
  destination: {
    account_id: string;
    asset_symbol: string;
    payment_rail_code: string;
    amount: { value: string; currency: string };
    type: "FIAT" | "CRYPTO";
  };
  fx_rate: {
    rate: string;
    source_asset_symbol: string;
    destination_asset_symbol: string;
    expires_at: string | null;
  };
  fees: Array<{
    amount: string;
    currency: string;
    description: string;
    fee_type: string;
  }>;
  quote_expiry_time: string | null;
}

export interface VelocityMoneyAction {
  id: string;
  short_id: string;
  type: "transfer" | "deposit";
  status: string;
  created_at: string;
  updated_at: string;
  account_transaction: {
    asset_symbol: string;
    amount: string;
    counterparty_info: { type: string; asset_symbol?: string; address?: string; iban?: string; account_holder?: string };
  };
  quote_conversion?: {
    source_amount: string;
    source_asset_symbol: string;
    destination_amount: string;
    destination_asset_symbol: string;
    rate: string;
  } | null;
}

const FX_RATES: Record<string, number> = {
  "USDC-EUR": 0.9215,
  "USDC-GBP": 0.7891,
  "EURC-EUR": 0.9980,
  "EURC-GBP": 0.8542,
  "EUR-USDC": 1.0852,
  "GBP-USDC": 1.2672,
  "EUR-EURC": 1.0020,
  "GBP-EURC": 1.1709,
};

function buildMockQuote(params: {
  sourceAccountType: "wallet" | "bank_account";
  sourceAccountId: string;
  destinationAccountType: "wallet" | "bank_account";
  destinationAccountId: string;
  sourceAmount: string;
  sourceCurrency: string;
  destinationCurrency: string;
}): VelocityQuote {
  const key = `${params.sourceCurrency}-${params.destinationCurrency}`;
  const rate = FX_RATES[key] ?? 1.0;
  const srcAmt = parseFloat(params.sourceAmount);
  const serviceFee = parseFloat((srcAmt * 0.0025).toFixed(2));
  const dstAmt = parseFloat(((srcAmt - serviceFee) * rate).toFixed(2));
  const srcType: "FIAT" | "CRYPTO" = params.sourceAccountType === "wallet" ? "CRYPTO" : "FIAT";
  const dstType: "FIAT" | "CRYPTO" = params.destinationAccountType === "wallet" ? "CRYPTO" : "FIAT";
  const expiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    quote_id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    idempotency_key: `mock-idem-${Date.now()}`,
    source: {
      account_id: params.sourceAccountId,
      asset_symbol: params.sourceCurrency,
      payment_rail_code: srcType === "CRYPTO" ? "ETHEREUM_SEPOLIA" : "SEPA",
      amount: { value: params.sourceAmount, currency: params.sourceCurrency },
      type: srcType,
    },
    destination: {
      account_id: params.destinationAccountId,
      asset_symbol: params.destinationCurrency,
      payment_rail_code: dstType === "CRYPTO" ? "ETHEREUM_SEPOLIA" : "SEPA",
      amount: { value: String(dstAmt), currency: params.destinationCurrency },
      type: dstType,
    },
    fx_rate: {
      rate: String(rate),
      source_asset_symbol: params.sourceCurrency,
      destination_asset_symbol: params.destinationCurrency,
      expires_at: expiry,
    },
    fees: [
      {
        amount: String(serviceFee),
        currency: params.sourceCurrency,
        description: "Service fee",
        fee_type: "SERVICE",
      },
    ],
    quote_expiry_time: expiry,
  };
}

export const velocityClient = {
  entityId: ENTITY_ID,

  async listWallets(): Promise<VelocityWallet[]> {
    const data = await request<{ data: { items: VelocityWallet[] } }>(
      `/v1/entities/${ENTITY_ID}/wallets?per_page=100`
    );
    return data.data?.items ?? [];
  },

  async listBankAccounts(): Promise<VelocityBankAccount[]> {
    const data = await request<{ data: { items: VelocityBankAccount[] } }>(
      `/v1/entities/${ENTITY_ID}/bank-accounts?per_page=100`
    );
    return data.data?.items ?? [];
  },

  async createQuote(params: {
    sourceAccountType: "wallet" | "bank_account";
    sourceAccountId: string;
    destinationAccountType: "wallet" | "bank_account";
    destinationAccountId: string;
    sourceAmount: string;
    sourceCurrency: string;
    destinationCurrency: string;
  }): Promise<VelocityQuote & { isMock?: boolean }> {
    const idempotencyKey = `quote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let apiResult: VelocityQuote | null = null;
    try {
      const data = await request<{ data: VelocityQuote }>("/v1/quotes", {
        method: "POST",
        body: JSON.stringify({
          entity_id: ENTITY_ID,
          idempotency_key: idempotencyKey,
          source: {
            account_type: params.sourceAccountType,
            account_id: params.sourceAccountId,
            amount: { value: params.sourceAmount, currency: params.sourceCurrency },
          },
          destination: {
            account_type: params.destinationAccountType,
            account_id: params.destinationAccountId,
          },
        }),
      });
      apiResult = data.data ?? null;
    } catch (err) {
      // Re-throw business logic errors (balance, limits, validation) — don't mock these
      if (err instanceof VelocityApiError && err.errorCode !== "INTERNAL_ERROR") {
        throw err;
      }
      console.warn("[velocity] Quote API server error, using mock:", (err as Error).message);
    }

    if (apiResult) {
      console.log("[velocity] Using live quote:", apiResult.quote_id);
      return apiResult;
    }
    console.warn("[velocity] Falling back to mock quote (server error)");
    return { ...buildMockQuote(params), isMock: true };
  },

  async executeQuote(quoteId: string): Promise<{ transaction_id: string; isMock?: boolean }> {
    if (quoteId.startsWith("mock-")) {
      return { transaction_id: `mock-tx-${Date.now()}`, isMock: true };
    }
    const data = await request<{ data: { transaction_id: string } }>(
      `/v1/quotes/${quoteId}/execute`,
      { method: "POST" }
    );
    return data.data;
  },

  async listMoneyActions(): Promise<VelocityMoneyAction[]> {
    const data = await request<{ data: { items: VelocityMoneyAction[] } }>(
      `/v1/entities/${ENTITY_ID}/money-actions?per_page=20&type=transfer&type=deposit`
    );
    return data.data?.items ?? [];
  },
};
