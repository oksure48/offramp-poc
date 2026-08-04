import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";

export async function GET(req: NextRequest) {
  try {
    const fromUserId = req.nextUrl.searchParams.get("fromUserId") ?? undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "25");
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
    const result = await bettermoneyClient.listPaymentOrders({ fromUserId, limit, offset });
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "bettermoney-payment-orders-list");
  }
}
