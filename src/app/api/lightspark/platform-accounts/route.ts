import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function GET() {
  try {
    const accounts = await lightsparkClient.getPlatformInternalAccounts();
    return NextResponse.json({ data: accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch platform accounts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
