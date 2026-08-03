import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bitsoClient } from "@/lib/services/bitso";

const CURATED_BOOKS = [
  "btc_mxn",
  "eth_mxn",
  "usd_mxn",
  "usdt_mxn",
  "usdc_mxn",
  "xrp_mxn",
  "sol_mxn",
  "btc_ars",
  "usd_ars",
  "btc_cop",
  "usd_cop",
];

export async function GET(_req: NextRequest) {
  try {
    const results = await Promise.allSettled(
      CURATED_BOOKS.map((book) => bitsoClient.getTicker(book))
    );
    const tickers = results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((t): t is NonNullable<typeof t> => t !== null);
    return createResponse(tickers, 200);
  } catch (error) {
    return handleApiError(error, "bitso-markets");
  }
}
