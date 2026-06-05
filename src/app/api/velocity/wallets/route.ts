import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { velocityClient } from "@/lib/services/velocity";

export async function GET(_req: NextRequest) {
  try {
    const wallets = await velocityClient.listWallets();
    return createResponse(wallets, 200);
  } catch (error) {
    return handleApiError(error, "velocity-wallets");
  }
}
