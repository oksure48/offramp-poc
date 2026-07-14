import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { openfxClient } from "@/lib/services/openfx";

export async function GET(_req: NextRequest) {
  try {
    const markets = await openfxClient.getMarkets();
    return createResponse(markets, 200);
  } catch (error) {
    return handleApiError(error, "openfx-markets");
  }
}
