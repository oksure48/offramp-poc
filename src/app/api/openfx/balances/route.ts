import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { openfxClient } from "@/lib/services/openfx";

export async function GET(_req: NextRequest) {
  try {
    const balances = await openfxClient.getBalances();
    return createResponse(balances, 200);
  } catch (error) {
    return handleApiError(error, "openfx-balances");
  }
}
