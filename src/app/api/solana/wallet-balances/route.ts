import { NextResponse } from "next/server";

const RPC_URLS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-api.projectserum.com",
  "https://rpc.ankr.com/solana",
];

const SOLANA_TOKEN_SYMBOLS: Record<string, string> = {
  "Es9vMFrzaCER5Dk7cmBKnU7D44ujHLrcu1YfRZ2Agwr7": "USDC",
  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": "USDT",
  "2ndSuk6AMB1XA1fRpSE4Jpuj1TaC4nnZLezTv8z6jPY": "USDB",
};

async function sendRpcRequest(rpcUrl: string, method: string, params: unknown[]) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`RPC ${method} failed: ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || `RPC ${method} error`);
  }

  return json.result;
}

function parseTokenAccounts(result: any) {
  if (!Array.isArray(result)) return [];
  return result
    .map((item) => {
      const parsed = item?.account?.data?.parsed;
      const info = parsed?.info;
      const tokenAmount = info?.tokenAmount;
      if (!info || !tokenAmount) return null;
      const amount = parseFloat(tokenAmount.uiAmountString ?? "0");
      if (!amount || amount <= 0) return null;
      const mint = info.mint;
      const symbol = SOLANA_TOKEN_SYMBOLS[mint] ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
      return {
        symbol,
        amount: amount.toString(),
        mint,
      };
    })
    .filter(Boolean);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address query parameter is required" }, { status: 400 });
  }

  let lastError = "";
  for (const rpcUrl of RPC_URLS) {
    try {
      const balanceResult = await sendRpcRequest(rpcUrl, "getBalance", [address, { commitment: "confirmed" }]);
      const lamports = balanceResult?.value ?? 0;
      const solBalance = (lamports / 1e9).toFixed(9).replace(/\.0+$/, "") || "0";

      const tokenResult = await sendRpcRequest(rpcUrl, "getTokenAccountsByOwner", [
        address,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]);

      const tokens = Array.isArray(tokenResult?.value) ? tokenResult.value : [];
      const tokenBalances = parseTokenAccounts(tokens);

      return NextResponse.json({ data: [{ symbol: "SOL", amount: solBalance }, ...tokenBalances] });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
  }

  return NextResponse.json({ error: `Failed to fetch Solana wallet balances: ${lastError}` }, { status: 500 });
}
