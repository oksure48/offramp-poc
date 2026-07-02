"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { config } from "@/lib/config";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  Zap,
  Search,
  Globe,
  ChevronDown,
  ChevronUp,
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
import type {
  LightsparkExchangeRate,
  LightsparkCustomer,
  LightsparkInternalAccount,
  LightsparkExternalAccount,
  LightsparkQuote,
  LightsparkTransaction,
} from "@/lib/services/lightspark";
import { formatLightsparkAmount, railLabel } from "@/lib/services/lightspark";

// ─── helpers ────────────────────────────────────────────────────────────────

function computeReceivingDisplay(rate: LightsparkExchangeRate): string {
  return formatLightsparkAmount(
    rate.receivingAmount,
    rate.destinationCurrency.code,
    rate.destinationCurrency.decimals
  );
}

function computeSendingDisplay(rate: LightsparkExchangeRate): string {
  return formatLightsparkAmount(
    rate.sendingAmount,
    rate.sourceCurrency.code,
    rate.sourceCurrency.decimals
  );
}

function computeEffectiveRate(rate: LightsparkExchangeRate): string {
  const srcDiv = Math.pow(10, rate.sourceCurrency.decimals ?? 2);
  const dstDiv = Math.pow(10, rate.destinationCurrency.decimals ?? 2);
  const effectiveRate = (rate.receivingAmount / dstDiv) / (rate.sendingAmount / srcDiv);
  const dest = rate.destinationCurrency.code;
  // Format nicely based on magnitude
  if (effectiveRate >= 100) return effectiveRate.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (effectiveRate >= 1) return effectiveRate.toFixed(4);
  return effectiveRate.toFixed(6);
}

const RAIL_COLORS: Record<string, string> = {
  PIX: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  UPI: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  FASTER_PAYMENTS: "bg-green-500/10 text-green-700",
  SEPA: "bg-blue-500/10 text-blue-700",
  SEPA_INSTANT: "bg-blue-600/10 text-blue-700",
  ACH: "bg-indigo-500/10 text-indigo-700",
  RTP: "bg-violet-500/10 text-violet-700",
  SPEI: "bg-pink-500/10 text-pink-700",
  MOBILE_MONEY: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  PAYNOW: "bg-cyan-500/10 text-cyan-700",
  BANK_TRANSFER: "bg-muted text-muted-foreground",
};

function railBadge(rail: string) {
  const color = RAIL_COLORS[rail] ?? RAIL_COLORS.BANK_TRANSFER;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      {railLabel(rail)}
    </span>
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

type ConnectionStatus =
  | { state: "loading" }
  | { state: "connected"; customerCount: number; environment: string }
  | { state: "error"; message: string };

const SOURCE_CURRENCIES = ["USD", "EUR", "BRL"] as const;
type SourceCurrency = (typeof SOURCE_CURRENCIES)[number];

// ─── main component ──────────────────────────────────────────────────────────

export function LightsparkInterface() {
  const [status, setStatus] = useState<ConnectionStatus>({ state: "loading" });
  const [customers, setCustomers] = useState<LightsparkCustomer[]>([]);

  const [rates, setRates] = useState<LightsparkExchangeRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState("");

  const [sourceCurrency, setSourceCurrency] = useState<SourceCurrency>("USD");
  const [sendingAmount, setSendingAmount] = useState(10000); // in smallest unit (cents)
  const [sendingDisplay, setSendingDisplay] = useState("100");

  const [rateSearch, setRateSearch] = useState("");
  const [showAllRates, setShowAllRates] = useState(false);

  const [simDest, setSimDest] = useState<string>("");

  // ── platform accounts + execution demo ────────────────────────────────────
  const [platformAccounts, setPlatformAccounts] = useState<LightsparkInternalAccount[]>([]);
  const [externalAccounts, setExternalAccounts] = useState<LightsparkExternalAccount[]>([]);
  const [loadingPlatformAccounts, setLoadingPlatformAccounts] = useState(false);
  const [fundingAccountId, setFundingAccountId] = useState<string | null>(null);

  type DemoStage = "idle" | "quoting" | "quoted" | "executing" | "done" | "error";
  const [demoStage, setDemoStage] = useState<DemoStage>("idle");
  const [demoQuote, setDemoQuote] = useState<LightsparkQuote | null>(null);
  const [demoTxn, setDemoTxn] = useState<LightsparkTransaction | null>(null);
  const [demoError, setDemoError] = useState("");
  const [demoAmount, setDemoAmount] = useState("10");
  const [demoSrcId, setDemoSrcId] = useState("");
  const [demoDstId, setDemoDstId] = useState("");

  // ── data fetching ──────────────────────────────────────────────────────────

  const fetchPlatformAccounts = useCallback(async (customerId?: string) => {
    setLoadingPlatformAccounts(true);
    try {
      const [platRes, extRes] = await Promise.all([
        fetch(`${config.api.baseUrl}/api/lightspark/platform-accounts`),
        customerId
          ? fetch(`${config.api.baseUrl}/api/lightspark/external-accounts?customerId=${encodeURIComponent(customerId)}`)
          : Promise.resolve(null),
      ]);
      const platData = await platRes.json();
      const accounts: LightsparkInternalAccount[] = platData.data ?? [];
      setPlatformAccounts(accounts);
      // Default: first INTERNAL_FIAT as source, first INTERNAL_CRYPTO as destination
      const fiat = accounts.find((a) => a.type === "INTERNAL_FIAT");
      const crypto = accounts.find((a) => a.type === "INTERNAL_CRYPTO");
      if (fiat) setDemoSrcId(fiat.id);
      if (crypto) setDemoDstId(crypto.id);

      if (extRes?.ok) {
        const extData = await extRes.json();
        setExternalAccounts(extData.data ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setLoadingPlatformAccounts(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStatus = useCallback(async () => {
    setStatus({ state: "loading" });
    try {
      const [statusRes, custRes] = await Promise.all([
        fetch(`${config.api.baseUrl}/api/lightspark/status`),
        fetch(`${config.api.baseUrl}/api/lightspark/customers`),
      ]);
      const statusData = await statusRes.json();
      if (statusData.connected) {
        setStatus({
          state: "connected",
          customerCount: statusData.customerCount ?? 0,
          environment: statusData.environment ?? "production",
        });
      } else {
        setStatus({ state: "error", message: statusData.error ?? "Not connected" });
      }
      if (custRes.ok) {
        const cd = await custRes.json();
        const custList: LightsparkCustomer[] = cd.data ?? [];
        setCustomers(custList);
        // Once we have customers, fetch platform + external accounts
        if (custList.length > 0) {
          fetchPlatformAccounts(custList[0].id);
        } else {
          fetchPlatformAccounts();
        }
      }
    } catch {
      setStatus({ state: "error", message: "Failed to reach LightSpark API" });
    }
  }, [fetchPlatformAccounts]);

  const fetchRates = useCallback(async (currency: SourceCurrency, amount: number) => {
    setLoadingRates(true);
    setRatesError("");
    try {
      const res = await fetch(
        `${config.api.baseUrl}/api/lightspark/rates?sourceCurrency=${currency}&sendingAmount=${amount}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load rates");
      const ratesData: LightsparkExchangeRate[] = data.data ?? [];
      setRates(ratesData);
      // Default sim destination to first non-stablecoin option
      if (!simDest && ratesData.length > 0) {
        const pick =
          ratesData.find((r) => !["USDC", "USDT", "USDB"].includes(r.destinationCurrency.code)) ??
          ratesData[0];
        setSimDest(pick.destinationCurrency.code + "|" + pick.destinationPaymentRail);
      }
    } catch (err) {
      setRatesError(err instanceof Error ? err.message : "Failed to load rates");
    } finally {
      setLoadingRates(false);
    }
  }, [simDest]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchRates(sourceCurrency, sendingAmount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCurrency, sendingAmount]);

  // ── derived data ───────────────────────────────────────────────────────────

  const filteredRates = useMemo(() => {
    if (!rateSearch.trim()) return rates;
    const q = rateSearch.toLowerCase();
    return rates.filter(
      (r) =>
        r.destinationCurrency.code.toLowerCase().includes(q) ||
        r.destinationCurrency.name?.toLowerCase().includes(q) ||
        r.destinationPaymentRail.toLowerCase().includes(q)
    );
  }, [rates, rateSearch]);

  const displayedRates = showAllRates ? filteredRates : filteredRates.slice(0, 9);

  const simRate = useMemo(() => {
    if (!simDest) return null;
    const [code, rail] = simDest.split("|");
    return rates.find(
      (r) => r.destinationCurrency.code === code && r.destinationPaymentRail === rail
    ) ?? null;
  }, [simDest, rates]);

  // ── event handlers ─────────────────────────────────────────────────────────

  const handleSendingAmount = (val: string) => {
    setSendingDisplay(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setSendingAmount(Math.round(parsed * 100));
    }
  };

  const handleSourceCurrency = (c: SourceCurrency) => {
    setSourceCurrency(c);
    setSimDest("");
  };

  const handleFundAccount = async (accountId: string) => {
    setFundingAccountId(accountId);
    try {
      await fetch(`${config.api.baseUrl}/api/lightspark/sandbox-fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, amount: 100000 }), // $1,000
      });
      await fetchPlatformAccounts(customers[0]?.id);
    } finally {
      setFundingAccountId(null);
    }
  };

  const handleCreateQuote = async () => {
    const parsed = parseFloat(demoAmount);
    if (isNaN(parsed) || parsed <= 0 || !demoSrcId || !demoDstId) return;
    const srcAcct = platformAccounts.find((a) => a.id === demoSrcId);
    const srcDecimals = srcAcct?.balance?.currency?.decimals ?? 2;
    const lockedCurrencyAmount = Math.round(parsed * Math.pow(10, srcDecimals));

    const isExternalDst = demoDstId.startsWith("ExternalAccount:");
    const senderCustomerInfo = isExternalDst
      ? { BUSINESS_TYPE: "CORPORATION", PURPOSE_OF_PAYMENT: "GOODS_PAYMENT" }
      : undefined;

    setDemoStage("quoting");
    setDemoError("");
    setDemoQuote(null);
    setDemoTxn(null);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/lightspark/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAccountId: demoSrcId, destinationAccountId: demoDstId, lockedCurrencyAmount, senderCustomerInfo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create quote");
      setDemoQuote(data);
      setDemoStage("quoted");
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Quote failed");
      setDemoStage("error");
    }
  };

  const handleExecuteQuote = async () => {
    if (!demoQuote) return;
    setDemoStage("executing");
    setDemoError("");
    try {
      const res = await fetch(`${config.api.baseUrl}/api/lightspark/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: demoQuote.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      if (data.transaction) setDemoTxn(data.transaction);
      setDemoStage("done");
      // Refresh balances
      await fetchPlatformAccounts(customers[0]?.id);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : "Execution failed");
      setDemoStage("error");
    }
  };

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 mt-6 pb-20">

      {/* ── Status Card ─────────────────────────────────────────────────────── */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            LightSpark Grid
          </CardTitle>
          <CardDescription>
            Global payments infrastructure — send, receive, convert, and ramp
            across 65+ countries
          </CardDescription>
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Stat label="Status">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span className="font-medium text-green-600">Connected</span>
                  </div>
                </Stat>
                <Stat label="Environment">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    status.environment === "sandbox"
                      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                      : "bg-blue-500/10 text-blue-700"
                  }`}>
                    {status.environment}
                  </span>
                </Stat>
                <Stat label="Customers">
                  <span className="font-semibold tabular-nums">{status.customerCount.toLocaleString()}</span>
                </Stat>
                <Stat label="Corridors">
                  <span className="font-semibold tabular-nums text-primary">
                    {rates.length > 0 ? `${rates.length}+` : "—"}
                  </span>
                </Stat>
              </div>

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  "Onramp", "Offramp", "Swap", "Send", "Receive",
                  "KYC/KYB", "UMA", "ACH", "SEPA", "PIX", "UPI", "Mobile Money",
                ].map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full border border-border bg-muted/50 text-muted-foreground px-2 py-0.5 text-[11px] font-medium"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Customers ───────────────────────────────────────────────────────── */}
      {customers.length > 0 && (
        <Card className="max-w-5xl mx-auto">
          <CardHeader>
            <CardTitle>Managed Customers</CardTitle>
            <CardDescription>
              Each customer has isolated accounts, KYC/KYB, and a Universal Money Address
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {customers.map((c) => (
                <div key={c.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">
                        {(c as any).businessInfo?.legalName ?? c.fullName ?? c.id}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.customerType} · ID: {c.id.replace("Customer:", "").slice(0, 16)}…
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        (c as any).kybStatus === "APPROVED" || (c as any).kycStatus === "APPROVED"
                          ? "bg-green-500/10 text-green-600"
                          : "bg-yellow-500/10 text-yellow-700"
                      }`}>
                        {(c as any).kybStatus ?? (c as any).kycStatus ?? "PENDING"}
                      </span>
                    </div>
                  </div>

                  {(c as any).umaAddress && (
                    <div className="rounded-md bg-primary/5 border border-primary/10 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                        UMA Address
                      </p>
                      <p className="font-mono text-xs font-medium text-primary break-all">
                        {(c as any).umaAddress}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Universal Money Address — receivable from any UMA-compatible platform
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    {(c as any).address?.country && (
                      <div>
                        <span className="text-muted-foreground">Region</span>
                        <p className="font-medium">{(c as any).address.country}</p>
                      </div>
                    )}
                    {(c as any).phoneNumber && (
                      <div>
                        <span className="text-muted-foreground">Phone</span>
                        <p className="font-medium">{(c as any).phoneNumber}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Created</span>
                      <p className="font-medium">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Ramp Simulator ──────────────────────────────────────────────────── */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Ramp &amp; Transfer Simulator</CardTitle>
          <CardDescription>
            Live-rate quote preview across any corridor — reflects real fees and
            settlement rails. To execute, register source and destination accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: inputs */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Source Currency</Label>
                <div className="flex rounded-lg border bg-muted p-1 gap-1 max-w-xs">
                  {SOURCE_CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleSourceCurrency(c)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                        sourceCurrency === c
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Sending Amount ({sourceCurrency})</Label>
                <Input
                  type="number"
                  value={sendingDisplay}
                  onChange={(e) => handleSendingAmount(e.target.value)}
                  placeholder="100"
                  min="1"
                  step="any"
                  className="max-w-xs"
                />
                <div className="flex gap-2">
                  {[100, 500, 1000, 5000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => { setSendingAmount(amt * 100); setSendingDisplay(String(amt)); }}
                      className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                        sendingAmount === amt * 100
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-input text-muted-foreground hover:text-foreground hover:border-foreground/30"
                      }`}
                    >
                      {amt >= 1000 ? `${amt/1000}k` : amt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Select
                  value={simDest}
                  onValueChange={setSimDest}
                  disabled={loadingRates || rates.length === 0}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Select destination currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {rates.map((r, i) => (
                      <SelectItem
                        key={i}
                        value={r.destinationCurrency.code + "|" + r.destinationPaymentRail}
                      >
                        {r.destinationCurrency.code}
                        {r.destinationCurrency.name ? ` — ${r.destinationCurrency.name}` : ""}
                        {` (${railLabel(r.destinationPaymentRail)})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRates(sourceCurrency, sendingAmount)}
                disabled={loadingRates}
              >
                {loadingRates ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Refresh Rate
              </Button>
            </div>

            {/* Right: quote preview */}
            <div>
              {loadingRates ? (
                <div className="h-full flex items-center justify-center p-6 rounded-lg border border-dashed">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Fetching live rate...</span>
                  </div>
                </div>
              ) : simRate ? (
                <SimulatorQuote rate={simRate} />
              ) : (
                <div className="h-full flex items-center justify-center p-6 rounded-lg border border-dashed">
                  <p className="text-sm text-muted-foreground text-center">
                    Select a source amount and destination to see a live quote preview.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Execution Demo ──────────────────────────────────────────────────── */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Live Execution Demo
          </CardTitle>
          <CardDescription>
            Create and execute real quotes against platform accounts — sandbox, no real funds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Platform accounts */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Platform Internal Accounts
            </p>
            {loadingPlatformAccounts && platformAccounts.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading accounts…
              </div>
            ) : (
              <div className="space-y-2">
                {platformAccounts.map((acct) => {
                  const curr = acct.balance.currency;
                  const bal = acct.balance.amount / Math.pow(10, curr.decimals ?? 2);
                  const totalBal = acct.totalBalance.amount / Math.pow(10, curr.decimals ?? 2);
                  const isFiat = acct.type === "INTERNAL_FIAT";
                  const held = totalBal - bal;
                  return (
                    <div key={acct.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-medium w-12">{curr.code}</span>
                        <span className="tabular-nums text-foreground font-semibold">
                          {isFiat
                            ? `${curr.symbol}${bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : `${bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: Math.min(curr.decimals ?? 6, 4) })} ${curr.code}`}
                        </span>
                        {held > 0.0001 && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            ({totalBal.toLocaleString("en-US", { maximumFractionDigits: 2 })} total, {held.toLocaleString("en-US", { maximumFractionDigits: 2 })} held)
                          </span>
                        )}
                        <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                          acct.type === "EMBEDDED_WALLET"
                            ? "bg-purple-500/10 text-purple-600"
                            : isFiat
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-teal-500/10 text-teal-600"
                        }`}>
                          {acct.type.replace("_", " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {acct.type === "EMBEDDED_WALLET" && (
                          <span className="text-[10px] text-muted-foreground">Spark wallet — read-only</span>
                        )}
                        {isFiat && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={fundingAccountId === acct.id}
                            onClick={() => handleFundAccount(acct.id)}
                          >
                            {fundingAccountId === acct.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : null}
                            +$1,000 (sandbox)
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quote builder */}
          <div className="border rounded-lg p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Create &amp; Execute Quote</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  value={demoAmount}
                  onChange={(e) => setDemoAmount(e.target.value)}
                  placeholder="10"
                  min="0.01"
                  step="any"
                  disabled={demoStage === "quoting" || demoStage === "executing"}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Source account</Label>
                <Select
                  value={demoSrcId}
                  onValueChange={setDemoSrcId}
                  disabled={platformAccounts.length === 0 || demoStage === "quoting" || demoStage === "executing"}
                >
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    {platformAccounts
                      .filter((a) => a.type !== "EMBEDDED_WALLET")
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.balance.currency.code} ({a.type.replace(/_/g, " ")})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Destination account</Label>
                <Select
                  value={demoDstId}
                  onValueChange={setDemoDstId}
                  disabled={platformAccounts.length === 0 || demoStage === "quoting" || demoStage === "executing"}
                >
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    {platformAccounts
                      .filter((a) => a.id !== demoSrcId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.balance.currency.code} ({a.type.replace(/_/g, " ")})
                        </SelectItem>
                      ))}
                    {externalAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.accountInfo.accountType.replace(/_/g, " ")} — Offramp
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {demoDstId.startsWith("ExternalAccount:") && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                    BRL corridor min ~$12 USD · compliance fields added automatically
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleCreateQuote}
                disabled={!demoSrcId || !demoDstId || demoStage === "quoting" || demoStage === "executing"}
                size="sm"
              >
                {demoStage === "quoting" ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating quote…</>
                ) : "Create Quote"}
              </Button>
              {demoStage === "quoted" && demoQuote && (
                <Button onClick={handleExecuteQuote} size="sm" variant="default">
                  Execute Quote
                </Button>
              )}
              {(demoStage === "done" || demoStage === "error") && (
                <Button
                  onClick={() => { setDemoStage("idle"); setDemoQuote(null); setDemoTxn(null); setDemoError(""); }}
                  size="sm"
                  variant="outline"
                >
                  Reset
                </Button>
              )}
            </div>

            {/* Quote preview */}
            {demoQuote && demoStage !== "idle" && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Quote</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${
                      demoStage === "done"
                        ? "bg-green-500/10 text-green-600"
                        : demoStage === "executing"
                        ? "bg-blue-500/10 text-blue-600"
                        : "bg-amber-500/10 text-amber-600"
                    }`}>
                      {demoStage === "executing" ? "PROCESSING" : demoStage === "done" ? "COMPLETED" : demoQuote.status}
                    </span>
                    {demoQuote.expiresAt && demoStage === "quoted" && (
                      <span className="text-[10px] text-muted-foreground">
                        expires {new Date(demoQuote.expiresAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Send: </span>
                    <span className="font-medium">
                      {demoQuote.sendingCurrency
                        ? formatLightsparkAmount(demoQuote.totalSendingAmount, demoQuote.sendingCurrency.code, demoQuote.sendingCurrency.decimals)
                        : demoQuote.totalSendingAmount}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Receive: </span>
                    <span className="font-medium text-primary">
                      {demoQuote.receivingCurrency
                        ? formatLightsparkAmount(demoQuote.totalReceivingAmount, demoQuote.receivingCurrency.code, demoQuote.receivingCurrency.decimals)
                        : demoQuote.totalReceivingAmount}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rate: </span>
                    <span className="font-medium">{demoQuote.exchangeRate ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fees: </span>
                    <span className="font-medium">{demoQuote.feesIncluded ?? 0}</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">{demoQuote.id}</p>
              </div>
            )}

            {/* Completed transaction */}
            {demoStage === "done" && demoTxn && (
              <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-sm text-green-700 dark:text-green-400">Transaction Completed</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {demoTxn.sentAmount && (
                    <div>
                      <span className="text-muted-foreground">Sent: </span>
                      <span className="font-medium">
                        {formatLightsparkAmount(demoTxn.sentAmount.amount, demoTxn.sentAmount.currency, 2)}
                      </span>
                    </div>
                  )}
                  {demoTxn.receivedAmount && (
                    <div>
                      <span className="text-muted-foreground">Received: </span>
                      <span className="font-medium text-primary">
                        {formatLightsparkAmount(
                          demoTxn.receivedAmount.amount,
                          demoTxn.receivedAmount.currency,
                          demoTxn.receivedAmount.currency === "USDC" || demoTxn.receivedAmount.currency === "USDB" ? 6 : 2
                        )}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">{demoTxn.id}</p>
              </div>
            )}

            {/* Error */}
            {demoStage === "error" && demoError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                {demoError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Exchange Rates Grid ──────────────────────────────────────────────── */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Live Exchange Rates
                {rates.length > 0 && (
                  <span className="rounded-full bg-primary/10 text-primary text-[11px] font-semibold px-2 py-0.5">
                    {rates.length} corridors
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Real-time rates with platform fees across all supported corridors
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {ratesError ? (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {ratesError}
            </div>
          ) : (
            <>
              {/* Source + search controls */}
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="flex rounded-lg border bg-muted p-1 gap-1">
                  {SOURCE_CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleSourceCurrency(c)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                        sourceCurrency === c
                          ? "bg-background shadow-sm text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-8 h-9"
                    placeholder="Filter by currency or rail..."
                    value={rateSearch}
                    onChange={(e) => setRateSearch(e.target.value)}
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchRates(sourceCurrency, sendingAmount)}
                  disabled={loadingRates}
                >
                  {loadingRates ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              {loadingRates && rates.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Fetching live rates...</span>
                </div>
              ) : filteredRates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No corridors match your search.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {displayedRates.map((rate, i) => (
                      <RateCard key={i} rate={rate} />
                    ))}
                  </div>

                  {filteredRates.length > 9 && (
                    <button
                      onClick={() => setShowAllRates((v) => !v)}
                      className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {showAllRates ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          Show fewer
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          Show all {filteredRates.length} corridors
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function RateCard({ rate }: { rate: LightsparkExchangeRate }) {
  const srcCode = rate.sourceCurrency.code;
  const dstCode = rate.destinationCurrency.code;
  const receivingFormatted = computeReceivingDisplay(rate);
  const effectiveRate = computeEffectiveRate(rate);
  const feeAmt = rate.fees?.totalAmount;
  const feeFormatted =
    feeAmt != null
      ? formatLightsparkAmount(feeAmt, srcCode, rate.sourceCurrency.decimals)
      : null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium text-sm">
          <span>{srcCode}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span>{dstCode}</span>
          {rate.destinationCurrency.name && (
            <span className="text-muted-foreground font-normal text-xs hidden sm:inline truncate max-w-[80px]">
              {rate.destinationCurrency.name}
            </span>
          )}
        </div>
        {railBadge(rate.destinationPaymentRail)}
      </div>

      <div className="flex justify-between items-end">
        <div className="text-xs text-muted-foreground">
          <span>1 {srcCode} = </span>
          <span className="font-medium text-foreground">
            {effectiveRate} {dstCode}
          </span>
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm tabular-nums text-primary">{receivingFormatted}</p>
          {feeFormatted && (
            <p className="text-[10px] text-muted-foreground tabular-nums">fee {feeFormatted}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SimulatorQuote({ rate }: { rate: LightsparkExchangeRate }) {
  const srcCode = rate.sourceCurrency.code;
  const dstCode = rate.destinationCurrency.code;
  const sendingFormatted = computeSendingDisplay(rate);
  const receivingFormatted = computeReceivingDisplay(rate);
  const effectiveRate = computeEffectiveRate(rate);
  const feeAmt = rate.fees?.totalAmount;
  const feeFormatted =
    feeAmt != null
      ? formatLightsparkAmount(feeAmt, srcCode, rate.sourceCurrency.decimals)
      : null;

  const settlementLabel: Record<string, string> = {
    PIX: "Instant (< 1 min)",
    UPI: "Instant (< 1 min)",
    RTP: "Instant (< 1 min)",
    FASTER_PAYMENTS: "Same day",
    SEPA_INSTANT: "Instant",
    SEPA: "1–2 business days",
    ACH: "1–3 business days",
    MOBILE_MONEY: "Minutes",
    PAYNOW: "Instant",
    SPEI: "Same day",
    BANK_TRANSFER: "1–3 business days",
  };

  const isOnramp = ["USDC", "USDT", "USDB", "BTC"].includes(dstCode);

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">Live Quote Preview</p>
        <span className="text-[10px] text-muted-foreground">
          {new Date(rate.updatedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="space-y-2.5 text-sm">
        <QuoteRow label="You send" value={sendingFormatted} bold />
        <QuoteRow label="You receive" value={receivingFormatted} bold highlight />
        <QuoteRow
          label="Exchange rate"
          value={`1 ${srcCode} = ${effectiveRate} ${dstCode}`}
        />
        {feeFormatted && <QuoteRow label="Fees" value={feeFormatted} />}
        <QuoteRow
          label="Settlement"
          value={settlementLabel[rate.destinationPaymentRail] ?? "Varies"}
        />
        <QuoteRow label="Rail" value={railLabel(rate.destinationPaymentRail)} />
      </div>

      <div className="border-t pt-3 space-y-2">
        {isOnramp ? (
          <p className="text-xs text-muted-foreground">
            <strong>Onramp flow:</strong> Customer funds via ACH/bank → LightSpark delivers{" "}
            {dstCode} to their wallet automatically.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            <strong>Offramp / remittance flow:</strong> Funds debited from{" "}
            {srcCode} balance → {dstCode} delivered via{" "}
            {railLabel(rate.destinationPaymentRail)} to recipient bank.
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          Requires: KYB-approved customer · registered destination account · funded {srcCode} balance or JIT funding
        </p>
      </div>
    </div>
  );
}

function QuoteRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`tabular-nums text-sm ${
          highlight ? "font-semibold text-primary" : bold ? "font-medium" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

