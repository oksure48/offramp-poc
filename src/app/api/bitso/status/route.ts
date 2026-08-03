import { NextRequest } from "next/server";
import { createResponse } from "@/lib/api-response";
import { bitsoClient } from "@/lib/services/bitso";

export async function GET(_req: NextRequest) {
  try {
    const status = await bitsoClient.getAccountStatus();
    return createResponse({ connected: true, clientId: status.client_id, status: status.status }, 200);
  } catch (error) {
    return createResponse(
      { connected: false, error: error instanceof Error ? error.message : "Failed to reach Bitso API" },
      200
    );
  }
}
