import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bitsoClient } from "@/lib/services/bitso";
import { z } from "zod";

const convertSchema = z.object({
  id: z.string().min(1),
  from_amount: z.string(),
  from_currency: z.string(),
  to_amount: z.string(),
  to_currency: z.string(),
  rate: z.string(),
  plain_rate: z.string(),
  rate_currency: z.string(),
  created: z.number(),
  expires: z.number(),
  book: z.string(),
  isMock: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const quote = convertSchema.parse(body);
    const result = await bitsoClient.executeConversionQuote(quote);
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "bitso-convert");
  }
}
