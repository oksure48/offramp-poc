import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function GET() {
  try {
    const result = await lightsparkClient.getTransactions(20);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch transactions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
