import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function POST(req: Request) {
  try {
    const { quoteId } = await req.json();
    if (!quoteId) {
      return NextResponse.json({ error: "quoteId required" }, { status: 400 });
    }
    const result = await lightsparkClient.executeQuote(quoteId);
    // If the quote has a transactionId, fetch it for the full result
    if (result.transactionId) {
      const txn = await lightsparkClient.getTransaction(result.transactionId);
      return NextResponse.json({ quote: result, transaction: txn });
    }
    return NextResponse.json({ quote: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to execute quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
