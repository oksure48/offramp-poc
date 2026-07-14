import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { openfxClient } from "@/lib/services/openfx";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "10");
    const deposits = await openfxClient.listDeposits(limit);
    return createResponse(deposits, 200);
  } catch (error) {
    return handleApiError(error, "openfx-deposits");
  }
}
