import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function GET() {
  try {
    const result = await lightsparkClient.getCustomers(20);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch customers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
