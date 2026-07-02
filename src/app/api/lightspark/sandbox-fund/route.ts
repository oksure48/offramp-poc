import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function POST(req: Request) {
  try {
    const { accountId, amount } = await req.json();
    if (!accountId || typeof amount !== "number") {
      return NextResponse.json({ error: "accountId and amount required" }, { status: 400 });
    }
    const result = await lightsparkClient.sandboxFundAccount(accountId, amount);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fund account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
