import { NextResponse } from "next/server";
import { lightsparkClient } from "@/lib/services/lightspark";

export async function GET() {
  try {
    const customers = await lightsparkClient.getCustomers(5);

    // UMA domain is a more reliable environment signal than the client ID string
    const hasSandboxUma = customers.data.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => typeof c.umaAddress === "string" && (c.umaAddress as string).includes("sandbox")
    );
    const clientIdHint =
      process.env.LIGHTSPARK_CLIENT_ID?.startsWith("test") ||
      process.env.LIGHTSPARK_CLIENT_ID?.includes("sandbox");
    const environment = hasSandboxUma || clientIdHint ? "sandbox" : "production";

    return NextResponse.json({
      connected: true,
      customerCount: customers.totalCount,
      environment,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ connected: false, error: message }, { status: 200 });
  }
}
