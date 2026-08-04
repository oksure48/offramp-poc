import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";

export async function GET(_req: NextRequest) {
  try {
    const assets = await bettermoneyClient.getSupportedAssets();
    return createResponse(assets, 200);
  } catch (error) {
    return handleApiError(error, "bettermoney-assets");
  }
}
