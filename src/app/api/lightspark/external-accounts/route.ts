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

export async function POST(req: Request) {
  const { customerId, currency, accountInfo } = await req.json();
  if (!customerId || !currency || !accountInfo || typeof accountInfo !== "object") {
    return NextResponse.json({ error: "customerId, currency, and accountInfo are required" }, { status: 400 });
  }

  try {
    const account = await lightsparkClient.createExternalAccount({
      customerId,
      currency,
      accountInfo,
    });

    return NextResponse.json({ data: account });
  } catch (err) {
    const statusCode = (err as any)?.statusCode;
    if (statusCode === 409) {
      try {
        const accounts = await lightsparkClient.getCustomerExternalAccounts(customerId);
        const matchingAccount = accounts.find((acct) => {
          const info = acct.accountInfo ?? {};
          const sameAccountType = info.accountType === (accountInfo as any).accountType;
          const sameAddress = info.address === (accountInfo as any).address;
          return sameAccountType && sameAddress;
        });
        if (matchingAccount) {
          return NextResponse.json({ data: matchingAccount, duplicate: true });
        }
      } catch {
        // ignore fallback lookup failures and return original duplicate error below
      }
      return NextResponse.json(
        { error: "Duplicate external account exists. Using existing account is recommended." },
        { status: 409 }
      );
    }

    const message = err instanceof Error ? err.message : "Failed to create external account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
