"use client";

import { useState, useEffect, useCallback } from "react";
import { config } from "@/lib/config";
import {
  Loader2,
  Copy,
  Check,
  ChevronRight,
  CheckCircle2,
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
import type { VelocityWallet, VelocityBankAccount, VelocityQuote, VelocityMoneyAction } from "@/lib/services/velocity";

type RampMode = "offramp" | "onramp";

export function VelocityInterface() {
  const [mode, setMode] = useState<RampMode>("offramp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [wallets, setWallets] = useState<VelocityWallet[]>([]);
  const [bankAccounts, setBankAccounts] = useState<VelocityBankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState("");

  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [amount, setAmount] = useState("100");

  const [quote, setQuote] = useState<(VelocityQuote & { isMock?: boolean }) | null>(null);
  const [result, setResult] = useState<{ transaction_id: string; isMock?: boolean } | null>(null);

  const [moneyActions, setMoneyActions] = useState<VelocityMoneyAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [selectedAction, setSelectedAction] = useState<VelocityMoneyAction | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountsError("");
    try {
      const [walletsRes, banksRes] = await Promise.all([
        fetch(`${config.api.baseUrl}/api/velocity/wallets`),
        fetch(`${config.api.baseUrl}/api/velocity/bank-accounts`),
      ]);
      if (walletsRes.ok) {
        const d = await walletsRes.json();
        const items: VelocityWallet[] = d.data ?? d ?? [];
        setWallets(items);
        if (items.length > 0) setSelectedWalletId(items[0].id);
      }
      if (banksRes.ok) {
        const d = await banksRes.json();
        const items: VelocityBankAccount[] = d.data ?? d ?? [];
        setBankAccounts(items);
        if (items.length > 0) setSelectedBankId(items[0].id);
      }
    } catch {
      setAccountsError("Failed to load Velocity accounts.");
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const fetchMoneyActions = useCallback(async () => {
    setLoadingActions(true);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/velocity/money-actions`);
      if (res.ok) {
        const d = await res.json();
        setMoneyActions(d.data ?? d ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingActions(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchMoneyActions();
  }, [fetchAccounts, fetchMoneyActions]);

  useEffect(() => {
    if (success) fetchMoneyActions();
  }, [success, fetchMoneyActions]);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { /* silent */ }
  };

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId) ?? null;
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId) ?? null;

  const sourceAccountType = mode === "offramp" ? "wallet" : "bank_account";
  const destinationAccountType = mode === "offramp" ? "bank_account" : "wallet";
  const sourceAccount = mode === "offramp" ? selectedWallet : selectedBank;
  const sourceCurrency = mode === "offramp"
    ? (selectedWallet?.asset ?? "")
    : (selectedBank?.currency ?? "");
  const destinationCurrency = mode === "offramp"
    ? (selectedBank?.currency ?? "")
    : (selectedWallet?.asset ?? "");

  const handleGetQuote = async () => {
    setError("");
    const srcId = mode === "offramp" ? selectedWalletId : selectedBankId;
    const dstId = mode === "offramp" ? selectedBankId : selectedWalletId;
    if (!srcId || !dstId) { setError("Select both a wallet and a bank account."); return; }
    if (!amount || parseFloat(amount) <= 0) { setError("Enter a valid amount."); return; }
    if (!sourceCurrency) { setError("Source account has no currency information."); return; }

    setLoading(true);
    setQuote(null);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/velocity/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAccountType,
          sourceAccountId: srcId,
          destinationAccountType,
          destinationAccountId: dstId,
          sourceAmount: amount,
          sourceCurrency,
          destinationCurrency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get quote");
      setQuote(data.data ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!quote) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${config.api.baseUrl}/api/velocity/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: quote.quote_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute");
      setResult(data.data ?? data);
      setSuccess("Transaction submitted successfully!");
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute");
    } finally {
      setLoading(false);
    }
  };

  const totalFee = quote?.fees.reduce((sum, f) => sum + parseFloat(f.amount), 0) ?? 0;

  return (
    <div className="space-y-6 mt-6 pb-20">
      {/* Accounts Status Card */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Velocity Entity</CardTitle>
          <CardDescription className="font-mono text-xs break-all">
            {process.env.NEXT_PUBLIC_VELOCITY_ENTITY_ID || "3ea34d05-b874-4a0a-b158-b984a11426ef"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAccounts ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading accounts...</span>
            </div>
          ) : accountsError ? (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {accountsError}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
                  Wallets ({wallets.length})
                </p>
                {wallets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active wallets</p>
                ) : (
                  <div className="space-y-1.5">
                    {wallets.map((w) => (
                      <div key={w.id} className="flex items-center gap-2">
                        <span className="rounded-full px-1.5 py-0 text-[10px] font-semibold bg-blue-500/10 text-blue-600">
                          {w.asset ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">{w.network_name ?? w.network}</span>
                        <span className={`ml-auto rounded-full px-1.5 py-0 text-[10px] font-medium ${
                          w.status === "ACTIVE" ? "bg-green-500/10 text-green-600"
                          : w.status === "PENDING_APPROVAL" || w.status === "PENDING_CREATION" ? "bg-yellow-500/10 text-yellow-600"
                          : "bg-muted text-muted-foreground"
                        }`}>{w.status}</span>
                        {w.balance && (
                          <span className="text-xs font-medium tabular-nums">
                            {w.balance.available} {w.balance.currency}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
                  Bank Accounts ({bankAccounts.length})
                </p>
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active bank accounts</p>
                ) : (
                  <div className="space-y-1.5">
                    {bankAccounts.map((b) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <span className="rounded-full px-1.5 py-0 text-[10px] font-semibold bg-green-500/10 text-green-600">
                          {b.currency ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                          {b.label ?? b.bank_name ?? (b.iban ? `...${b.iban.slice(-6)}` : b.id.slice(0, 8))}
                        </span>
                        <span className={`rounded-full px-1.5 py-0 text-[10px] font-medium ${
                          b.status === "ACTIVE" ? "bg-green-500/10 text-green-600"
                          : b.status === "PENDING_APPROVAL" || b.status === "PENDING_CREATION" ? "bg-yellow-500/10 text-yellow-600"
                          : "bg-muted text-muted-foreground"
                        }`}>{b.status}</span>
                        {b.balance && (
                          <span className="ml-auto text-xs font-medium tabular-nums">
                            {b.balance.available} {b.balance.currency}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {!loadingAccounts && !accountsError && (wallets.length > 0 || bankAccounts.length > 0) && (
            <div className="flex items-center gap-2 mt-4 pt-3 border-t">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Connected to Velocity preprod</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ramp Card */}
      {!loadingAccounts && !accountsError && (wallets.length > 0 && bankAccounts.length > 0) && (
        <Card className="max-w-5xl mx-auto">
          <CardHeader>
            <CardTitle>Quick Ramp</CardTitle>
            <CardDescription>Convert between crypto and fiat via Velocity</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mode toggle */}
            <div className="flex rounded-lg border bg-muted p-1 mb-6 max-w-xs">
              {(["onramp", "offramp"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setQuote(null); setResult(null); setError(""); setSuccess(""); }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    mode === m
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "onramp" ? "Onramp" : "Offramp"}
                </button>
              ))}
            </div>

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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Form */}
              <div className="space-y-4">
                {!result && (
                  <>
                    {/* Wallet selector */}
                    <div className="space-y-1.5">
                      <Label>{mode === "offramp" ? "Source Wallet (Crypto)" : "Destination Wallet (Crypto)"}</Label>
                      <Select value={selectedWalletId} onValueChange={setSelectedWalletId} disabled={loadingAccounts}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select wallet" />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.asset} — {w.network_name ?? w.network}
                              {w.label ? ` (${w.label})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Bank account selector */}
                    <div className="space-y-1.5">
                      <Label>{mode === "offramp" ? "Destination Bank Account (Fiat)" : "Source Bank Account (Fiat)"}</Label>
                      <Select value={selectedBankId} onValueChange={setSelectedBankId} disabled={loadingAccounts}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.currency}
                              {b.label ? ` — ${b.label}` : ""}
                              {b.iban ? ` (...${b.iban.slice(-6)})` : ""}
                              {b.account_number && !b.iban ? ` (...${b.account_number.slice(-4)})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Amount */}
                    <div className="space-y-1.5">
                      <Label>
                        Amount
                        {sourceAccount && (
                          <span className="ml-1.5 text-muted-foreground font-normal">
                            ({sourceCurrency})
                          </span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="100"
                        min="0"
                        step="any"
                      />
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleGetQuote}
                      disabled={loading || loadingAccounts}
                      variant={quote ? "outline" : "default"}
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {quote ? "Refresh Quote" : "Get Quote"}
                    </Button>
                  </>
                )}

                {result && (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">Transaction Submitted</p>
                      {result?.isMock && (
                        <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
                          SIMULATED
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Transaction ID</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{result.transaction_id.slice(0, 16)}…</span>
                          <button
                            className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer"
                            onClick={() => handleCopy(result.transaction_id, "tx-id")}
                          >
                            {copiedField === "tx-id"
                              ? <Check className="h-3 w-3 text-green-500" />
                              : <Copy className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => { setResult(null); setSuccess(""); }}>
                      New Transaction
                    </Button>
                  </div>
                )}
              </div>

              {/* Right: Quote */}
              <div>
                {quote ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">Quote</p>
                      {quote.isMock && (
                        <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
                          SIMULATED — API unavailable
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You send</span>
                        <span className="font-medium">
                          {quote.source.amount.value} {quote.source.amount.currency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You receive</span>
                        <span className="font-medium">
                          {quote.destination.amount.value} {quote.destination.amount.currency}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rate</span>
                        <span>
                          1 {quote.fx_rate.source_asset_symbol} = {quote.fx_rate.rate} {quote.fx_rate.destination_asset_symbol}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rail</span>
                        <span className="text-xs">
                          {quote.source.payment_rail_code} → {quote.destination.payment_rail_code}
                        </span>
                      </div>
                      {totalFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fees</span>
                          <span>{totalFee.toFixed(2)} {quote.fees[0]?.currency}</span>
                        </div>
                      )}
                      {quote.quote_expiry_time && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Expires</span>
                          <span>{new Date(quote.quote_expiry_time).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button className="flex-1" onClick={handleExecute} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm
                      </Button>
                      <Button variant="outline" onClick={() => setQuote(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-center p-6 rounded-lg border border-dashed">
                    <p className="text-sm text-muted-foreground">
                      Fill in the form and click <span className="font-medium">Get Quote</span> to see your rate.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Money Actions */}
      <Card className="max-w-2xl mx-auto mb-6">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingActions ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading transactions...</span>
            </div>
          ) : moneyActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="space-y-0">
              {moneyActions.slice(0, 10).map((action) => {
                const isTransfer = action.type === "transfer";
                const qc = isTransfer ? (action as any).quote_conversion : null;
                return (
                  <button
                    key={action.id}
                    className="w-full text-left py-3 border-b last:border-0 text-sm space-y-1 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors cursor-pointer"
                    onClick={() => setSelectedAction(action)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          action.type === "deposit"
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-orange-500/10 text-orange-600"
                        }`}>
                          {action.type === "deposit" ? "Deposit" : "Transfer"}
                        </span>
                        <span className="text-muted-foreground text-xs font-mono">
                          {action.short_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${
                          action.status === "completed" ? "text-green-600"
                          : action.status === "failed" ? "text-destructive"
                          : "text-muted-foreground"
                        }`}>
                          {action.status}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {qc
                          ? `${qc.source_amount} ${qc.source_asset_symbol} → ${qc.destination_amount} ${qc.destination_asset_symbol}`
                          : `${action.account_transaction.amount} ${action.account_transaction.asset_symbol}`}
                      </span>
                      <span>{new Date(action.created_at).toLocaleString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Detail Dialog */}
      <Dialog open={!!selectedAction} onOpenChange={(o) => !o && setSelectedAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedAction && (
            <ActionDetail action={selectedAction} onCopy={handleCopy} copiedField={copiedField} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionDetail({
  action,
  onCopy,
  copiedField,
}: {
  action: VelocityMoneyAction;
  onCopy: (text: string, field: string) => void;
  copiedField: string | null;
}) {
  const qc = (action as any).quote_conversion ?? null;
  const cp = action.account_transaction.counterparty_info;

  function Row({ label, value, copyKey }: { label: string; value?: string | null; copyKey?: string }) {
    if (!value) return null;
    return (
      <div className="flex items-center justify-between py-1 border-b last:border-0 text-sm">
        <span className="text-muted-foreground text-xs shrink-0 mr-3">{label}</span>
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-mono text-xs truncate">{value}</span>
          {copyKey && (
            <button className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer" onClick={() => onCopy(value, copyKey)}>
              {copiedField === copyKey
                ? <Check className="h-3 w-3 text-green-500" />
                : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Summary</p>
        <div className="rounded-md border px-3">
          <Row label="ID" value={action.id} copyKey="a-id" />
          <Row label="Short ID" value={action.short_id} />
          <Row label="Type" value={action.type} />
          <Row label="Status" value={action.status} />
          <Row label="Created" value={new Date(action.created_at).toLocaleString()} />
        </div>
      </div>
      {qc && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Conversion</p>
          <div className="rounded-md border px-3">
            <Row label="Sent" value={`${qc.source_amount} ${qc.source_asset_symbol}`} />
            <Row label="Received" value={`${qc.destination_amount} ${qc.destination_asset_symbol}`} />
            <Row label="Rate" value={qc.rate} />
          </div>
        </div>
      )}
      {cp && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Counterparty</p>
          <div className="rounded-md border px-3">
            <Row label="Type" value={cp.type?.replace(/_/g, " ")} />
            {(cp as any).asset_symbol && <Row label="Asset" value={(cp as any).asset_symbol} />}
            {(cp as any).address && <Row label="Address" value={(cp as any).address} copyKey="cp-addr" />}
            {(cp as any).iban && <Row label="IBAN" value={(cp as any).iban} copyKey="cp-iban" />}
            {(cp as any).account_holder && <Row label="Account Holder" value={(cp as any).account_holder} />}
            {(cp as any).bank_name && <Row label="Bank" value={(cp as any).bank_name} />}
          </div>
        </div>
      )}
    </div>
  );
}
