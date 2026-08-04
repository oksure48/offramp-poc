import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";
import { z } from "zod";

const paymentSchema = z.object({
  mode: z.enum(["standard", "instant"]).optional(),
  fromUserId: z.string().min(1),
  quoteId: z.string().optional(),
  toAddress: z.string().min(1),
  toChain: z.string().min(1),
  asset: z.string().min(1),
  amountUsd: z.number().positive(),
  memo: z.string().optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
  expiresAt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = paymentSchema.parse(body);
    const result = await bettermoneyClient.createPayment(params);
    return createResponse(result, 201);
  } catch (error) {
    return handleApiError(error, "bettermoney-payment");
  }
}
