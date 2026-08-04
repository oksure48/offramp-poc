import { NextRequest } from "next/server";
import { createResponse } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";

export async function GET(_req: NextRequest) {
  try {
    const limits = await bettermoneyClient.getAccountLimits();
    return createResponse({ connected: true, accountId: limits.accountId }, 200);
  } catch (error) {
    return createResponse(
      { connected: false, error: error instanceof Error ? error.message : "Failed to reach BetterMoney API" },
      200
    );
  }
}
