import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { openfxClient, type OpenFXQuote } from "@/lib/services/openfx";
import { z } from "zod";

const tradeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  buy: z.string(),
  sell: z.string(),
  referencedUnit: z.string(),
  referencedAmount: z.number(),
  quoteAmount: z.number(),
  createdAt: z.string(),
  expiryTimeinSeconds: z.number(),
  isMock: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const quote = tradeSchema.parse(body) as OpenFXQuote & { isMock?: boolean };
    const result = await openfxClient.executeTrade(quote);
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "openfx-trade");
  }
}
