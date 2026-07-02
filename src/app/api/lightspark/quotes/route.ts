import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function POST(req: Request) {
  try {
    const { sourceAccountId, destinationAccountId, lockedCurrencyAmount, senderCustomerInfo } = await req.json();
    if (!sourceAccountId || !destinationAccountId || typeof lockedCurrencyAmount !== "number") {
      return NextResponse.json({ error: "sourceAccountId, destinationAccountId, lockedCurrencyAmount required" }, { status: 400 });
    }
    const quote = await lightsparkClient.createQuote({
      sourceAccountId,
      destinationAccountId,
      lockedCurrencySide: "SENDING",
      lockedCurrencyAmount,
      senderCustomerInfo,
    });
    return NextResponse.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
