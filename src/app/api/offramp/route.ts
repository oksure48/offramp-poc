/**
 * Unified Offramp API Route
 *
 * POST /api/offramp - Handle offramp operations (quote or execute)
 *
 * Actions:
 * - quote: Get quotes from one or more offramp providers
 * - execute: Execute an offramp with a selected provider quote
 */

import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import {
  type CreateOfframpRequest,
  type OfframpQuoteRequest,
} from "@/lib/services/iron";
import {
  executeOfframpProvider,
  getOfframpProviderQuotes,
  type OfframpProviderId,
} from "@/lib/services/offrampProviders";
import { z } from "zod";

const providerEnum = z.enum(["moonpay", "bitso", "bybit"]).optional();

const quoteSchema = z.object({
  action: z.literal("quote"),
  customer_id: z.string().min(1, "Customer ID is required"),
  source_currency: z.enum(["USDC", "USDT", "USDB", "EURC"]),
  destination_currency: z.enum(["USD", "EUR", "GBP", "BRL", "MXN"]),
  source_amount: z.number().positive().optional(),
  destination_amount: z.number().positive().optional(),
  bank_account_id: z.string().min(1, "Bank account ID (IBAN) is required"),
  bank_id: z.string().optional(),
  blockchain: z.enum(["Ethereum", "Solana", "Polygon", "Arbitrum", "Base", "Stellar", "Citrea"]).optional(),
  provider: providerEnum,
});

const executeSchema = z.object({
  action: z.literal("execute"),
  quote_id: z.string().min(1, "Quote ID is required"),
  customer_id: z.string().min(1, "Customer ID is required"),
  bank_account_id: z.string().min(1, "Bank account ID (IBAN) is required"),
  bank_id: z.string().optional(),
  blockchain: z.enum(["Ethereum", "Solana", "Polygon", "Arbitrum", "Base", "Stellar", "Citrea"]).optional(),
  source_currency: z.enum(["USDC", "USDT", "USDB", "EURC"]).optional(),
  destination_currency: z.enum(["USD", "EUR", "GBP", "BRL", "MXN"]).optional(),
  provider: providerEnum,
});

const requestSchema = z.discriminatedUnion("action", [
  quoteSchema,
  executeSchema,
]);

/**
 * POST /api/offramp
 * Unified offramp endpoint - handles both quote and execute
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate request body
    const validated = requestSchema.parse(body);

    if (validated.action === "quote") {
      const quoteRequest: OfframpQuoteRequest = {
        customer_id: validated.customer_id,
        source_currency: validated.source_currency,
        destination_currency: validated.destination_currency,
        source_amount: validated.source_amount,
        destination_amount: validated.destination_amount,
        bank_account_id: validated.bank_account_id,
        bank_id: validated.bank_id,
        blockchain: validated.blockchain,
      };

      const quotes = await getOfframpProviderQuotes(
        quoteRequest,
        validated.provider as OfframpProviderId | undefined
      );
      return createResponse(quotes, 200);
    }

    const offrampRequest: CreateOfframpRequest = {
      quote_id: validated.quote_id,
      customer_id: validated.customer_id,
      bank_account_id: validated.bank_account_id,
      bank_id: validated.bank_id,
      blockchain: validated.blockchain,
      source_currency: validated.source_currency,
      destination_currency: validated.destination_currency,
    };

    const offramp = await executeOfframpProvider(
      (validated.provider as OfframpProviderId) ?? "moonpay",
      offrampRequest
    );
    return createResponse(offramp, 201);
  } catch (error) {
    return handleApiError(error, "offramp");
  }
}
