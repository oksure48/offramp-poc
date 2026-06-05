import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { velocityClient } from "@/lib/services/velocity";

export async function GET(_req: NextRequest) {
  try {
    const actions = await velocityClient.listMoneyActions();
    return createResponse(actions, 200);
  } catch (error) {
    return handleApiError(error, "velocity-money-actions");
  }
}
