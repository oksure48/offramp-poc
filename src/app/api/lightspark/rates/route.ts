import { NextRequest, NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sourceCurrency = searchParams.get("sourceCurrency") ?? "USD";
  const sendingAmountParam = searchParams.get("sendingAmount");
  const sendingAmount = sendingAmountParam ? parseInt(sendingAmountParam) : 10000;

  try {
    const rates = await lightsparkClient.getExchangeRates({
      sourceCurrency,
      sendingAmount,
    });
    return NextResponse.json({ data: rates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch rates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
