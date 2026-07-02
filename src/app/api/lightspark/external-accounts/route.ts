import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }
    const accounts = await lightsparkClient.getCustomerExternalAccounts(customerId);
    return NextResponse.json({ data: accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch external accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
