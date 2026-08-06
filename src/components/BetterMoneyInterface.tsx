"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDynamicContext, useUserWallets } from "@dynamic-labs/sdk-react-core";
import { isSolanaWallet } from "@dynamic-labs/solana";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { config } from "@/lib/config";
import {
  Loader2,
  Copy,
  Check,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  X,
  Wallet as WalletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  BetterMoneySupportedAsset,
  BetterMoneyUser,
  BetterMoneyAccountLimits,
  BetterMoneyDepositAddress,
  BetterMoneyQuote,
  BetterMoneyPaymentOrder,
} from "@/lib/services/bettermoney";

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

interface SolanaSigner {
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
}

interface SplTransferWallet {
  address: string;
  getConnection: () => Promise<Connection>;
  getSigner: () => Promise<SolanaSigner>;
}

async function sendSplTransfer(
  wallet: SplTransferWallet,
  params: { mintAddress: string; decimals: number; destinationOwner: string; amountUsd: number }
): Promise<string> {
  const connection = await wallet.getConnection();
  const signer = await wallet.getSigner();

  const fromPubkey = new PublicKey(wallet.address);
  const mint = new PublicKey(params.mintAddress);
  const toOwner = new PublicKey(params.destinationOwner);

  const fromAta = getAssociatedTokenAddressSync(mint, fromPubkey);
  const toAta = getAssociatedTokenAddressSync(mint, toOwner);

  // BetterMoney's assets are all USD-pegged stablecoins, so amountUsd maps 1:1 to token units.
  const amount = BigInt(Math.round(params.amountUsd * 10 ** params.decimals));

  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(fromPubkey, toAta, toOwner, mint),
    createTransferCheckedInstruction(fromAta, mint, toAta, fromPubkey, amount, params.decimals)
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  const { signature } = await signer.signAndSendTransaction(transaction);

  // Wait for Solana itself to confirm the transfer before handing the hash to
  // BetterMoney — submitting it too early (right after signAndSendTransaction
  // resolves) can race their indexer and come back with transfersProcessed: 0.
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  return signature;
}

function statusColor(status: string): string {
  if (status === "DISTRIBUTED") return "text-green-600";
  if (["CANCELED", "EXPIRED", "DISTRIBUTION_FAILED", "SETTLEMENT_FAILED", "REFUND_FAILED"].includes(status)) return "text-destructive";
  if (status.startsWith("REFUND")) return "text-orange-600";
  return "text-muted-foreground";
}

type ConnectionStatus =
  | { state: "loading" }
  | { state: "connected"; accountId: string }
  | { state: "error"; message: string };

export function BetterMoneyInterface() {
  const [status, setStatus] = useState<ConnectionStatus>({ state: "loading" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Supported assets
  const [assets, setAssets] = useState<BetterMoneySupportedAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  // Limits
  const [limits, setLimits] = useState<BetterMoneyAccountLimits | null>(null);

  // Deposit addresses (account-scoped, reused for funding any AWAITING_FUNDS order)
  const [depositAddresses, setDepositAddresses] = useState<BetterMoneyDepositAddress[]>([]);

  // Users
  const [users, setUsers] = useState<BetterMoneyUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newUserLabel, setNewUserLabel] = useState("");
  const [newUserWallets, setNewUserWallets] = useState([{ address: "", chain: "ethereum" }]);
  const [registeringUser, setRegisteringUser] = useState(false);

  // Create payment
  const [fromUserId, setFromUserId] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [toChain, setToChain] = useState("ethereum");
  const [asset, setAsset] = useState("");
  const [amountUsd, setAmountUsd] = useState("25");
  const [memo, setMemo] = useState("");
  const [mode, setMode] = useState<"standard" | "instant">("standard");
  const [quote, setQuote] = useState<BetterMoneyQuote | null>(null);
  const [gettingQuote, setGettingQuote] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    paymentOrderId: string;
    paymentOrder: BetterMoneyPaymentOrder;
    depositAddresses: BetterMoneyDepositAddress[];
  } | null>(null);

  // Activity
  const [orders, setOrders] = useState<BetterMoneyPaymentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<BetterMoneyPaymentOrder | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState(false);

  const fetchStatus = useCallback(async () => {
    setStatus({ state: "loading" });
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/status`);
      const data = await res.json();
      const payload = data.data ?? data;
      if (payload.connected) {
        setStatus({ state: "connected", accountId: payload.accountId });
      } else {
        setStatus({ state: "error", message: payload.error ?? "Not connected" });
      }
    } catch {
      setStatus({ state: "error", message: "Failed to reach BetterMoney API" });
    }
  }, []);

  const fetchAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/assets`);
      const data = await res.json();
      if (res.ok) {
        const list: BetterMoneySupportedAsset[] = data.data ?? [];
        setAssets(list);
        if (!asset && list.length > 0) setAsset(list[0].symbol);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingAssets(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLimits = useCallback(async () => {
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/limits`);
      const data = await res.json();
      if (res.ok) setLimits(data.data);
    } catch {
      /* silent */
    }
  }, []);

  const fetchDepositAddresses = useCallback(async () => {
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/deposit-addresses`);
      const data = await res.json();
      if (res.ok) setDepositAddresses(data.data ?? []);
    } catch {
      /* silent */
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/users?limit=50`);
      const data = await res.json();
      if (res.ok) {
        const list: BetterMoneyUser[] = data.data?.users ?? [];
        setUsers(list);
        if (!fromUserId && list.length > 0) setFromUserId(list[0].id);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingUsers(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/payment-orders?limit=20`);
      const data = await res.json();
      if (res.ok) setOrders(data.data?.paymentOrders ?? []);
    } catch {
      /* silent */
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchAssets();
    fetchLimits();
    fetchDepositAddresses();
    fetchUsers();
    fetchOrders();
  }, [fetchStatus, fetchAssets, fetchLimits, fetchDepositAddresses, fetchUsers, fetchOrders]);

  useEffect(() => {
    if (success) {
      fetchUsers();
      fetchOrders();
      fetchLimits();
    }
  }, [success, fetchUsers, fetchOrders, fetchLimits]);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      /* silent */
    }
  };

  const chains = useMemo(() => Array.from(new Set(assets.map((a) => a.chain))), [assets]);
  const assetSymbols = useMemo(() => Array.from(new Set(assets.map((a) => a.symbol))), [assets]);

  const addWalletRow = () => setNewUserWallets((w) => [...w, { address: "", chain: "ethereum" }]);
  const removeWalletRow = (idx: number) => setNewUserWallets((w) => w.filter((_, i) => i !== idx));
  const updateWalletRow = (idx: number, field: "address" | "chain", value: string) => {
    setNewUserWallets((w) => w.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const handleRegisterUser = async () => {
    setError("");
    if (!newUserLabel.trim()) { setError("Enter a user label."); return; }
    const wallets = newUserWallets.filter((w) => w.address.trim());
    if (wallets.length === 0) { setError("Add at least one wallet address."); return; }

    setRegisteringUser(true);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newUserLabel.trim(), wallets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register user");
      setSuccess(`User "${newUserLabel.trim()}" registered.`);
      setNewUserLabel("");
      setNewUserWallets([{ address: "", chain: "ethereum" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register user");
    } finally {
      setRegisteringUser(false);
    }
  };

  const handleGetQuote = async () => {
    setError("");
    setQuote(null);
    if (!toAddress.trim() || !asset || !amountUsd || parseFloat(amountUsd) <= 0) {
      setError("Fill in destination address, asset, and amount first.");
      return;
    }
    setGettingQuote(true);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAddress: toAddress.trim(), toChain, asset, amountUsd: parseFloat(amountUsd) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get quote");
      setQuote(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
    } finally {
      setGettingQuote(false);
    }
  };

  const handleCreatePayment = async () => {
    setError("");
    setSuccess("");
    if (!fromUserId) { setError("Select a sending user."); return; }
    if (!toAddress.trim() || !asset || !amountUsd || parseFloat(amountUsd) <= 0) {
      setError("Fill in destination address, asset, and amount.");
      return;
    }
    if (mode === "instant" && (!quote || quote.serviceable === false)) {
      setError("Get a serviceable quote first for instant settlement.");
      return;
    }

    setCreatingPayment(true);
    try {
      const body: Record<string, unknown> = {
        mode,
        fromUserId,
        toAddress: toAddress.trim(),
        toChain,
        asset,
        amountUsd: parseFloat(amountUsd),
        memo: memo || undefined,
        idempotencyKey: crypto.randomUUID(),
      };
      if (mode === "instant" && quote?.serviceable) {
        body.quoteId = quote.quoteId;
      } else {
        body.expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      }
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment");
      setPaymentResult(data.data);
      setQuote(null);
      setSuccess("Payment order created — fund it at the deposit address shown.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create payment");
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleCancelOrder = async (id: string) => {
    setCancelingOrder(true);
    setError("");
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/payment-orders/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Canceled from offramp-poc demo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel order");
      setSuccess("Cancellation requested.");
      setSelectedOrder(null);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel order");
    } finally {
      setCancelingOrder(false);
    }
  };

  const refreshPaymentResultOrder = useCallback(async () => {
    if (!paymentResult) return;
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/payment-orders/${encodeURIComponent(paymentResult.paymentOrderId)}`);
      const data = await res.json();
      if (res.ok) setPaymentResult((prev) => (prev ? { ...prev, paymentOrder: data.data } : prev));
    } catch {
      /* silent */
    }
  }, [paymentResult]);

  const refreshSelectedOrder = useCallback(async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bettermoney/payment-orders/${encodeURIComponent(selectedOrder.id)}`);
      const data = await res.json();
      if (res.ok) setSelectedOrder(data.data);
    } catch {
      /* silent */
    }
  }, [selectedOrder]);

  return (
    <div className="space-y-6 mt-6 pb-20">
      {/* Status */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>BetterMoney (TBMC)</CardTitle>
          <CardDescription>Stablecoin clearinghouse — any supported stablecoin, any chain, at par. No sandbox — all calls hit production.</CardDescription>
        </CardHeader>
        <CardContent>
          {status.state === "loading" ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Connecting...</span>
            </div>
          ) : status.state === "error" ? (
            <div className="flex items-center gap-3">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Connection failed</p>
                <p className="text-xs text-muted-foreground mt-0.5">{status.message}</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto" onClick={fetchStatus}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="font-medium text-green-600 text-sm">Connected</span>
              <span className="text-xs text-muted-foreground">· account {status.accountId}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supported Assets + Limits */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Supported Assets &amp; Limits</CardTitle>
          <CardDescription>Every stablecoin/chain pair is fungible at par — there&apos;s no FX rate to quote, only a fee for instant settlement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAssets ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading assets…
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {assets.map((a) => (
                <div key={`${a.chain}-${a.symbol}`} className="rounded-md border px-3 py-2">
                  <p className="text-sm font-medium">{a.symbol}</p>
                  <p className="text-xs text-muted-foreground capitalize">{a.chain}</p>
                </div>
              ))}
            </div>
          )}
          {limits && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Max per transaction</p>
                <p className="text-sm font-medium tabular-nums">{formatUsd(limits.maxTxUsd.limit)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Orders per epoch</p>
                <p className="text-sm font-medium tabular-nums">{limits.maxCountPerEpoch.used} / {limits.maxCountPerEpoch.limit}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Value per epoch</p>
                <p className="text-sm font-medium tabular-nums">{formatUsd(limits.maxValuePerEpochUsd.remaining)} remaining</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users & Wallets */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Users &amp; Wallets</CardTitle>
          <CardDescription>Register the sending and receiving parties — new wallets start PENDING until TBMC activates them</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingUsers ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading users…
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users registered yet.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{u.label}</p>
                    <span className="text-[10px] text-muted-foreground font-mono">{u.id.slice(0, 8)}…</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {u.wallets.map((w) => (
                      <span
                        key={w.address}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          w.status === "ACTIVE" ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                        }`}
                        title={w.address}
                      >
                        {w.chain} · {w.address.slice(0, 6)}…{w.address.slice(-4)} · {w.status}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Register a new user</p>
            <div className="space-y-1.5 max-w-xs">
              <Label>Label</Label>
              <Input value={newUserLabel} onChange={(e) => setNewUserLabel(e.target.value)} placeholder="usr_3f8a92" />
            </div>
            <div className="space-y-2">
              {newUserWallets.map((w, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={w.address}
                    onChange={(e) => updateWalletRow(idx, "address", e.target.value)}
                    placeholder="Wallet address"
                    className="flex-1"
                  />
                  <Select value={w.chain} onValueChange={(v) => updateWalletRow(idx, "chain", v)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(chains.length > 0 ? chains : ["ethereum", "solana"]).map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newUserWallets.length > 1 && (
                    <button onClick={() => removeWalletRow(idx)} className="p-1.5 rounded hover:bg-muted cursor-pointer">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addWalletRow}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add wallet
              </Button>
            </div>
            <Button onClick={handleRegisterUser} disabled={registeringUser}>
              {registeringUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Register User
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Payment */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Create Payment</CardTitle>
          <CardDescription>Standard settlement clears in the next netting window; instant settlement pays out immediately from prefunded liquidity for a fee</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-md bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-600 dark:text-green-400">
              {success}
            </div>
          )}

          {paymentResult ? (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3 max-w-2xl">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">Payment Order Created — {paymentResult.paymentOrder.status}</p>
                <button className="p-1 rounded hover:bg-muted cursor-pointer" onClick={refreshPaymentResultOrder} title="Refresh status">
                  <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground text-xs">Order ID</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs">{paymentResult.paymentOrderId}</span>
                  <button className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer" onClick={() => handleCopy(paymentResult.paymentOrderId, "order-id")}>
                    {copiedField === "order-id" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              {paymentResult.paymentOrder.status === "AWAITING_FUNDS" ? (
                <FundingSection
                  orderId={paymentResult.paymentOrderId}
                  amountUsd={paymentResult.paymentOrder.amountUsd}
                  depositAddresses={paymentResult.depositAddresses}
                  assets={assets}
                  onConfirmed={refreshPaymentResultOrder}
                />
              ) : (
                <p className="text-xs text-muted-foreground">No longer awaiting funds — see Recent Activity below for lifecycle details.</p>
              )}
              <Button variant="outline" className="w-full" onClick={() => { setPaymentResult(null); setSuccess(""); }}>
                New Payment
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Settlement mode</Label>
                  <div className="flex rounded-lg border bg-muted p-1 gap-1 max-w-xs">
                    {(["standard", "instant"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setMode(m); setQuote(null); }}
                        className={`flex-1 py-2 rounded-md text-sm font-medium capitalize transition-colors cursor-pointer ${
                          mode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>From user</Label>
                  <Select value={fromUserId} onValueChange={setFromUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sending user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {users.length === 0 && <p className="text-xs text-muted-foreground">Register a user above first.</p>}
                </div>

                <div className="space-y-1.5">
                  <Label>Recipient address</Label>
                  <Input value={toAddress} onChange={(e) => { setToAddress(e.target.value); setQuote(null); }} placeholder="0x… or Solana address" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Chain</Label>
                    <Select value={toChain} onValueChange={(v) => { setToChain(v); setQuote(null); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(chains.length > 0 ? chains : ["ethereum", "solana"]).map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Asset received</Label>
                    <Select value={asset} onValueChange={(v) => { setAsset(v); setQuote(null); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Asset" />
                      </SelectTrigger>
                      <SelectContent>
                        {assetSymbols.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Amount (USD)</Label>
                  <Input type="number" value={amountUsd} onChange={(e) => { setAmountUsd(e.target.value); setQuote(null); }} min="0" step="any" />
                </div>

                <div className="space-y-1.5">
                  <Label>Memo</Label>
                  <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Invoice #1042" />
                </div>

                {mode === "instant" ? (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleGetQuote} disabled={gettingQuote}>
                      {gettingQuote && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Get Quote
                    </Button>
                    <Button className="flex-1" onClick={handleCreatePayment} disabled={creatingPayment || !quote || quote.serviceable === false}>
                      {creatingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Payment
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full" onClick={handleCreatePayment} disabled={creatingPayment}>
                    {creatingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Payment
                  </Button>
                )}
              </div>

              <div>
                {mode === "instant" && quote ? (
                  quote.serviceable ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2 text-sm">
                      <p className="font-medium">Quote</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>{formatUsd(quote.amountUsd)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span>{formatUsd(quote.feeUsd)} ({(quote.feeBps / 100).toFixed(2)}%)</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span>{new Date(quote.expiresAt).toLocaleTimeString()}</span></div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                      Not serviceable instantly right now — try standard settlement instead.
                    </div>
                  )
                ) : (
                  <div className="h-full flex items-center justify-center text-center p-6 rounded-lg border border-dashed">
                    <p className="text-sm text-muted-foreground">
                      {mode === "instant"
                        ? "Fill in the form and click Get Quote to price instant settlement."
                        : "Standard settlement clears at par in the next netting window — no quote needed."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="max-w-2xl mx-auto mb-6">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Payment orders and their lifecycle status</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingOrders ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading activity...</span>
            </div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment orders yet.</p>
          ) : (
            <div className="space-y-0">
              {orders.map((o) => (
                <button
                  key={o.id}
                  className="w-full text-left py-3 border-b last:border-0 text-sm space-y-1 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors cursor-pointer"
                  onClick={() => setSelectedOrder(o)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-600 capitalize">
                        {o.mode}
                      </span>
                      <span className="text-muted-foreground text-xs font-mono">{o.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${statusColor(o.status)}`}>{o.status}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatUsd(o.amountUsd)} · {o.asset} on {o.toChain}</span>
                    <span>{new Date(o.createdAt).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Payment Order Details</DialogTitle>
              <button className="p-1 rounded hover:bg-muted cursor-pointer" onClick={refreshSelectedOrder} title="Refresh status">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3">
              <div className="rounded-md border px-3 text-sm">
                <DetailRow label="ID" value={selectedOrder.id} copyKey="o-id" onCopy={handleCopy} copiedField={copiedField} />
                <DetailRow label="Mode" value={selectedOrder.mode} />
                <DetailRow label="Status" value={selectedOrder.status} />
                <DetailRow label="Amount" value={formatUsd(selectedOrder.amountUsd)} />
                <DetailRow label="Asset" value={`${selectedOrder.asset} on ${selectedOrder.toChain}`} />
                <DetailRow label="To" value={selectedOrder.toAddress} copyKey="o-to" onCopy={handleCopy} copiedField={copiedField} />
                <DetailRow label="Memo" value={selectedOrder.memo} />
                <DetailRow label="Received" value={selectedOrder.receivedTotal != null ? formatUsd(selectedOrder.receivedTotal) : undefined} />
                <DetailRow label="Created" value={new Date(selectedOrder.createdAt).toLocaleString()} />
                <DetailRow label="Distribution tx" value={selectedOrder.distributionTransactionHash} copyKey="o-dist" onCopy={handleCopy} copiedField={copiedField} />
              </div>

              {selectedOrder.status === "AWAITING_FUNDS" && depositAddresses.length > 0 && (
                <FundingSection
                  orderId={selectedOrder.id}
                  amountUsd={selectedOrder.amountUsd}
                  depositAddresses={depositAddresses}
                  assets={assets}
                  onConfirmed={refreshSelectedOrder}
                />
              )}

              {selectedOrder.inboundTransfers && selectedOrder.inboundTransfers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Inbound Transfers</p>
                  <div className="space-y-1.5">
                    {selectedOrder.inboundTransfers.map((t) => (
                      <div key={t.transactionHash} className="rounded-md border px-3 py-2 text-xs flex items-center justify-between">
                        <span>{formatUsd(t.amountUsd)} {t.asset} on {t.chain}</span>
                        <span className="text-muted-foreground">{t.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {["AWAITING_FUNDS", "FUNDED"].includes(selectedOrder.status) && (
                <Button variant="destructive" size="sm" onClick={() => handleCancelOrder(selectedOrder.id)} disabled={cancelingOrder}>
                  {cancelingOrder && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Cancel Order
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FundingSection({
  orderId,
  amountUsd,
  depositAddresses,
  assets,
  onConfirmed,
}: {
  orderId: string;
  amountUsd: number;
  depositAddresses: BetterMoneyDepositAddress[];
  assets: BetterMoneySupportedAsset[];
  onConfirmed: () => void;
}) {
  const { primaryWallet } = useDynamicContext();
  const userWallets = useUserWallets();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fundingState, setFundingState] = useState<"idle" | "sending" | "confirming" | "attributing" | "done" | "unmatched" | "error">("idle");
  const [fundingError, setFundingError] = useState("");
  const [fundingSignature, setFundingSignature] = useState("");
  const [manualHash, setManualHash] = useState("");
  const [manualChain, setManualChain] = useState("solana");
  const [confirmingManual, setConfirmingManual] = useState(false);

  const solanaWallet = useMemo(() => {
    if (primaryWallet && isSolanaWallet(primaryWallet)) return primaryWallet;
    return userWallets.find((w) => isSolanaWallet(w)) ?? null;
  }, [primaryWallet, userWallets]);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      /* silent */
    }
  };

  const confirmTransactions = async (hash: string, chain: string): Promise<number> => {
    const res = await fetch(
      `${config.api.baseUrl}/api/bettermoney/payment-orders/${encodeURIComponent(orderId)}/transactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: [{ hash, chain }] }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to confirm funding");
    return data.data.transfersProcessed ?? 0;
  };

  // BetterMoney's own indexer can briefly lag behind Solana even after our
  // transaction is confirmed on-chain, so a fresh submission can legitimately
  // come back with transfersProcessed: 0 — retry a few times before giving up.
  const confirmWithRetry = async (hash: string, chain: string, attempts = 4, delayMs = 3000): Promise<boolean> => {
    for (let i = 0; i < attempts; i++) {
      const transfersProcessed = await confirmTransactions(hash, chain);
      if (transfersProcessed > 0) return true;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  };

  const handleFundWithWallet = async (deposit: BetterMoneyDepositAddress) => {
    if (!solanaWallet) return;
    const assetInfo = assets.find((a) => a.chain === "solana" && a.symbol === deposit.symbol);
    if (!assetInfo) {
      setFundingError(`Missing token info for ${deposit.symbol}`);
      setFundingState("error");
      return;
    }

    setFundingState("sending");
    setFundingError("");
    try {
      const signature = await sendSplTransfer(solanaWallet, {
        mintAddress: assetInfo.tokenAddress,
        decimals: assetInfo.tokenDecimals,
        destinationOwner: deposit.address,
        amountUsd,
      });
      setFundingSignature(signature);
      setFundingState("attributing");
      const matched = await confirmWithRetry(signature, "solana");
      if (matched) {
        setFundingState("done");
        onConfirmed();
      } else {
        setManualHash(signature);
        setManualChain("solana");
        setFundingState("unmatched");
      }
    } catch (err) {
      setFundingError(err instanceof Error ? err.message : "Funding failed");
      setFundingState("error");
    }
  };

  const handleConfirmManual = async () => {
    if (!manualHash.trim()) return;
    setConfirmingManual(true);
    setFundingError("");
    try {
      const transfersProcessed = await confirmTransactions(manualHash.trim(), manualChain);
      if (transfersProcessed > 0) {
        setFundingState("done");
        onConfirmed();
      } else {
        setFundingState("unmatched");
        setFundingError("BetterMoney didn't find a matching transfer yet — it may still be indexing. Try again in a few seconds.");
      }
    } catch (err) {
      setFundingError(err instanceof Error ? err.message : "Failed to confirm funding");
    } finally {
      setConfirmingManual(false);
    }
  };

  const busy = fundingState === "sending" || fundingState === "attributing";

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        Fund this order — send {formatUsd(amountUsd)} worth of any listed stablecoin to:
      </p>
      <div className="space-y-1.5">
        {depositAddresses.map((d) => {
          const canFundWithWallet = d.chain === "solana" && !!solanaWallet;
          return (
            <div key={`${d.chain}-${d.symbol}`} className="rounded-md border px-3 py-2 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span><span className="font-medium">{d.symbol}</span> on <span className="capitalize">{d.chain}</span></span>
                <div className="flex items-center gap-1">
                  <span className="font-mono">{d.address.slice(0, 10)}…{d.address.slice(-6)}</span>
                  <button className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer" onClick={() => handleCopy(d.address, `deposit-${d.chain}-${d.symbol}`)}>
                    {copiedField === `deposit-${d.chain}-${d.symbol}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              {canFundWithWallet && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs w-full"
                  onClick={() => handleFundWithWallet(d)}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <WalletIcon className="mr-1.5 h-3 w-3" />
                  )}
                  {fundingState === "sending"
                    ? "Sending transfer…"
                    : fundingState === "attributing"
                    ? "Confirming with BetterMoney…"
                    : `Fund ${d.symbol} with connected wallet (${solanaWallet!.address.slice(0, 4)}…${solanaWallet!.address.slice(-4)})`}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {fundingState === "done" && (
        <div className="rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 text-xs text-green-600 dark:text-green-400">
          Funding confirmed{fundingSignature && ` — tx ${fundingSignature.slice(0, 10)}…`} submitted to BetterMoney.
        </div>
      )}
      {fundingState === "unmatched" && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Transfer confirmed on-chain{fundingSignature && ` (tx ${fundingSignature.slice(0, 10)}…)`}, but BetterMoney hasn&apos;t matched it after several tries —
          it may still be indexing. The hash is filled in below; hit Confirm again in a bit.
        </div>
      )}
      {(fundingState === "error" || fundingState === "unmatched") && fundingError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{fundingError}</div>
      )}

      <div className="rounded-md border border-dashed p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Or confirm a transfer sent manually</p>
        <div className="flex gap-2">
          <Input
            value={manualHash}
            onChange={(e) => setManualHash(e.target.value)}
            placeholder="Transaction hash"
            className="flex-1 h-8 text-xs"
          />
          <Select value={manualChain} onValueChange={setManualChain}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ethereum">ethereum</SelectItem>
              <SelectItem value="solana">solana</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleConfirmManual} disabled={confirmingManual || !manualHash.trim()}>
            {confirmingManual && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyKey,
  onCopy,
  copiedField,
}: {
  label: string;
  value?: string | number | null;
  copyKey?: string;
  onCopy?: (text: string, field: string) => void;
  copiedField?: string | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value);
  return (
    <div className="flex items-center justify-between py-1 border-b last:border-0 text-sm">
      <span className="text-muted-foreground text-xs shrink-0 mr-3">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-mono text-xs truncate">{str}</span>
        {copyKey && onCopy && (
          <button className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer" onClick={() => onCopy(str, copyKey)}>
            {copiedField === copyKey ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  );
}
