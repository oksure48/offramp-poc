import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bitsoClient } from "@/lib/services/bitso";
import { z } from "zod";

const quoteSchema = z
  .object({
    fromCurrency: z.string().min(1),
    toCurrency: z.string().min(1),
    spendAmount: z.number().positive().optional(),
    receiveAmount: z.number().positive().optional(),
  })
  .refine((v) => (v.spendAmount != null) !== (v.receiveAmount != null), {
    message: "Provide exactly one of spendAmount or receiveAmount",
  });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = quoteSchema.parse(body);
    const quote = await bitsoClient.requestConversionQuote(params);
    return createResponse(quote, 200);
  } catch (error) {
    return handleApiError(error, "bitso-quote");
  }
}
