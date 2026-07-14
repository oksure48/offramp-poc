import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { openfxClient } from "@/lib/services/openfx";

export async function GET(_req: NextRequest) {
  try {
    const addresses = await openfxClient.listCryptoWithdrawalAddresses();
    return createResponse(addresses, 200);
  } catch (error) {
    return handleApiError(error, "openfx-withdrawal-addresses");
  }
}
