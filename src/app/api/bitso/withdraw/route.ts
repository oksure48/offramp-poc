import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bitsoClient } from "@/lib/services/bitso";
import { z } from "zod";

const cryptoWithdrawSchema = z.object({
  kind: z.literal("crypto"),
  currency: z.string().min(1),
  amount: z.number().positive(),
  address: z.string().min(1),
  protocol: z.string().optional(),
});

const mxnWithdrawSchema = z.object({
  kind: z.literal("mxn"),
  amount: z.number().positive(),
  clabe: z.string().min(1),
  beneficiary: z.string().min(1),
  institutionCode: z.string().optional(),
});

const withdrawSchema = z.discriminatedUnion("kind", [cryptoWithdrawSchema, mxnWithdrawSchema]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = withdrawSchema.parse(body);
    const result =
      params.kind === "crypto"
        ? await bitsoClient.createCryptoWithdrawal(params)
        : await bitsoClient.createMxnWithdrawal(params);
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "bitso-withdraw");
  }
}
