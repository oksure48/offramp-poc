import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";
import { z } from "zod";

const quoteSchema = z.object({
  toAddress: z.string().min(1),
  toChain: z.string().min(1),
  asset: z.string().min(1),
  amountUsd: z.number().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = quoteSchema.parse(body);
    const quote = await bettermoneyClient.createQuote(params);
    return createResponse(quote, 200);
  } catch (error) {
    return handleApiError(error, "bettermoney-quote");
  }
}
