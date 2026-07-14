import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { openfxClient } from "@/lib/services/openfx";
import { z } from "zod";

const withdrawSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().min(1),
  withdrawalAddressId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = withdrawSchema.parse(body);
    const result = await openfxClient.initiateWithdrawal(params);
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "openfx-withdraw");
  }
}
