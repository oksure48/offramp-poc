import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { velocityClient } from "@/lib/services/velocity";
import { z } from "zod";

const quoteSchema = z.object({
  sourceAccountType: z.enum(["wallet", "bank_account"]),
  sourceAccountId: z.string().uuid(),
  destinationAccountType: z.enum(["wallet", "bank_account"]),
  destinationAccountId: z.string().uuid(),
  sourceAmount: z.string().min(1),
  sourceCurrency: z.string().min(1),
  destinationCurrency: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = quoteSchema.parse(body);
    const quote = await velocityClient.createQuote(params);
    return createResponse(quote, 200);
  } catch (error) {
    return handleApiError(error, "velocity-quote");
  }
}
