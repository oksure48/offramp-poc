import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bitsoClient } from "@/lib/services/bitso";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "15");
    const deposits = await bitsoClient.listFundings(limit);
    return createResponse(deposits, 200);
  } catch (error) {
    return handleApiError(error, "bitso-deposits");
  }
}
