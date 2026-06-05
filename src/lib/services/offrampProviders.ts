import { ironClient, type CreateOfframpRequest, type OfframpQuoteRequest, type Quote } from "./iron";

export type OfframpProviderId = "moonpay" | "bitso" | "bybit";

export const OFFRAMP_PROVIDERS: { id: OfframpProviderId; name: string }[] = [
  { id: "moonpay", name: "MoonPay / Iron" },
  { id: "bitso", name: "Bitso" },
  { id: "bybit", name: "ByBit" },
];

const PROVIDER_RATE_ADJUSTMENT: Record<OfframpProviderId, number> = {
  moonpay: -0.01,
  bitso: 0,
  bybit: -0.02,
};

const CURRENCY_BASE_DISCOUNT: Record<string, number> = {
  USD: -0.01,
  EUR: -0.015,
  GBP: -0.02,
  BRL: -0.12,
  MXN: -0.09,
};

const getProviderName = (providerId: OfframpProviderId) =>
  OFFRAMP_PROVIDERS.find((p) => p.id === providerId)?.name || "Provider";

const getMockExchangeRate = (
  request: OfframpQuoteRequest,
  providerId: OfframpProviderId
): number => {
  const baseRate = 1 + (CURRENCY_BASE_DISCOUNT[request.destination_currency] ?? -0.015);
  return parseFloat((baseRate + PROVIDER_RATE_ADJUSTMENT[providerId]).toFixed(6));
};

const getMockQuote = (
  request: OfframpQuoteRequest,
  providerId: OfframpProviderId
): Quote & { provider_id: OfframpProviderId; provider_name: string } => {
  const rate = getMockExchangeRate(request, providerId);
  const sourceAmount = request.source_amount ?? 1000000;
  const amountIn = sourceAmount / 1000000;
  const destinationAmount = Math.max(
    0,
    Math.round(amountIn * rate * 100)
  );

  return {
    id: `mock-${providerId}-${Date.now()}`,
    type: "offramp",
    source_currency: request.source_currency,
    destination_currency: request.destination_currency,
    source_amount: sourceAmount,
    destination_amount: destinationAmount,
    exchange_rate: rate,
    fees: {
      total_fee: Math.round(amountIn * 0.005 * 100),
    },
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    provider_id: providerId,
    provider_name: getProviderName(providerId),
  };
};

export async function getOfframpProviderQuotes(
  request: OfframpQuoteRequest,
  providerId?: OfframpProviderId
): Promise<Array<Quote & { provider_id: OfframpProviderId; provider_name: string }>> {
  const providers = providerId
    ? OFFRAMP_PROVIDERS.filter((p) => p.id === providerId)
    : OFFRAMP_PROVIDERS;

  const promises = providers.map(async (provider) => {
    if (provider.id === "moonpay") {
      const quote = await ironClient.getOfframpQuote(request);
      return {
        ...quote,
        provider_id: provider.id,
        provider_name: provider.name,
      };
    }
    return getMockQuote(request, provider.id);
  });

  return Promise.all(promises);
}

export async function executeOfframpProvider(
  providerId: OfframpProviderId,
  request: CreateOfframpRequest
): Promise<unknown> {
  if (providerId === "moonpay") {
    return ironClient.createOfframp(request);
  }

  const providerName = getProviderName(providerId);
  return {
    id: `mock-exec-${providerId}-${Date.now()}`,
    status: "pending",
    payment_instructions: {
      account_number: "1234567890",
      bank_name: providerName,
      bic: "MOCKBICXXX",
      beneficiary_name: "Clickable Prototype",
      address: `Payout via ${providerName}`,
      phone: "+1 555 123 4567",
    },
  };
}
