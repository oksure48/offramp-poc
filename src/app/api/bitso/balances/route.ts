import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bitsoClient } from "@/lib/services/bitso";

export async function GET(_req: NextRequest) {
  try {
    const balances = await bitsoClient.getBalance();
    return createResponse(balances, 200);
  } catch (error) {
    return handleApiError(error, "bitso-balances");
  }
}
