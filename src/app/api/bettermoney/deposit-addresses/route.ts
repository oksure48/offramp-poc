import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";

export async function GET(_req: NextRequest) {
  try {
    const addresses = await bettermoneyClient.listDepositAddresses();
    return createResponse(addresses, 200);
  } catch (error) {
    return handleApiError(error, "bettermoney-deposit-addresses");
  }
}
