import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { openfxClient } from "@/lib/services/openfx";
import { z } from "zod";

const quoteSchema = z.object({
  amount: z.number().positive(),
  buy: z.string().min(1),
  sell: z.string().min(1),
  referencedUnit: z.string().min(1),
  quoteForSeconds: z.union([z.literal(3), z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = quoteSchema.parse(body);
    const quote = await openfxClient.generateQuote(params);
    return createResponse(quote, 200);
  } catch (error) {
    return handleApiError(error, "openfx-quote");
  }
}
