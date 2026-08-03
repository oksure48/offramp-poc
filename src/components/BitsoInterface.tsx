"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { config } from "@/lib/config";
import {
  Loader2,
  Copy,
  Check,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowDownUp,
  RefreshCw,
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
  BitsoTicker,
  BitsoBalance,
  BitsoConversionQuote,
  BitsoUserTrade,
  BitsoFunding,
  BitsoWithdrawal,
} from "@/lib/services/bitso";

const CRYPTO_CURRENCIES = ["BTC", "ETH", "USDT", "USDC", "XRP", "SOL"];
const FIAT_CURRENCIES = ["MXN", "USD", "ARS", "COP"];
const ALL_CURRENCIES = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES];

function isCrypto(currency: string): boolean {
  return CRYPTO_CURRENCIES.includes(currency.toUpperCase());
}

function formatAmount(amount: number | string, currency: string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const decimals = isCrypto(currency) ? 6 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency.toUpperCase()}`;
}

function bookLabel(book: string): string {
  const [major, minor] = book.split("_");
  return `${major.toUpperCase()}/${minor.toUpperCase()}`;
}

type ActivityItem =
  | { kind: "trade"; date: string; item: BitsoUserTrade }
  | { kind: "deposit"; date: string; item: BitsoFunding }
  | { kind: "withdrawal"; date: string; item: BitsoWithdrawal };

type ConnectionStatus =
  | { state: "loading" }
  | { state: "connected"; clientId: string; status: string }
  | { state: "error"; message: string };

export function BitsoInterface() {
  const [status, setStatus] = useState<ConnectionStatus>({ state: "loading" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Balances
  const [balances, setBalances] = useState<BitsoBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [balancesError, setBalancesError] = useState("");

  // Exchange rates
  const [tickers, setTickers] = useState<BitsoTicker[]>([]);
  const [loadingRates, setLoadingRates] = useState(true);

  // Swap / conversion
  const [sellCurrency, setSellCurrency] = useState("USDT");
  const [buyCurrency, setBuyCurrency] = useState("MXN");
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<(BitsoConversionQuote & { isMock?: boolean }) | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [convertResult, setConvertResult] = useState<{ oid: string; isMock?: boolean } | null>(null);
  const expiryRef = useRef<number>(0);

  // Withdraw (offramp)
  const [withdrawCurrency, setWithdrawCurrency] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("10");
  const [cryptoAddress, setCryptoAddress] = useState("");
  const [mxnClabe, setMxnClabe] = useState("");
  const [mxnBeneficiary, setMxnBeneficiary] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<BitsoWithdrawal | null>(null);

  // Activity
  const [trades, setTrades] = useState<BitsoUserTrade[]>([]);
  const [deposits, setDeposits] = useState<BitsoFunding[]>([]);
  const [withdrawals, setWithdrawals] = useState<BitsoWithdrawal[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  const fetchStatus = useCallback(async () => {
    setStatus({ state: "loading" });
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bitso/status`);
      const data = await res.json();
      const payload = data.data ?? data;
      if (payload.connected) {
        setStatus({ state: "connected", clientId: payload.clientId ?? "—", status: payload.status ?? "unknown" });
      } else {
        setStatus({ state: "error", message: payload.error ?? "Not connected" });
      }
    } catch {
      setStatus({ state: "error", message: "Failed to reach Bitso API" });
    }
  }, []);

  const fetchBalances = useCallback(async () => {
    setLoadingBalances(true);
    setBalancesError("");
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bitso/balances`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load balances");
      setBalances(data.data ?? []);
    } catch (err) {
      setBalancesError(err instanceof Error ? err.message : "Failed to load Bitso balances.");
    } finally {
      setLoadingBalances(false);
    }
  }, []);

  const fetchRates = useCallback(async () => {
    setLoadingRates(true);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bitso/markets`);
      const data = await res.json();
      if (res.ok) setTickers(data.data ?? []);
    } catch {
      /* silent */
    } finally {
      setLoadingRates(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const [tradesRes, depositsRes, withdrawalsRes] = await Promise.all([
        fetch(`${config.api.baseUrl}/api/bitso/trades?limit=15`),
        fetch(`${config.api.baseUrl}/api/bitso/deposits?limit=15`),
        fetch(`${config.api.baseUrl}/api/bitso/withdrawals?limit=15`),
      ]);
      if (tradesRes.ok) setTrades((await tradesRes.json()).data ?? []);
      if (depositsRes.ok) setDeposits((await depositsRes.json()).data ?? []);
      if (withdrawalsRes.ok) setWithdrawals((await withdrawalsRes.json()).data ?? []);
    } catch {
      /* silent */
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchBalances();
    fetchRates();
    fetchActivity();
  }, [fetchStatus, fetchBalances, fetchRates, fetchActivity]);

  useEffect(() => {
    if (success) {
      fetchBalances();
      fetchActivity();
    }
  }, [success, fetchBalances, fetchActivity]);

  // Quote countdown
  useEffect(() => {
    if (!quote) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((expiryRef.current - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [quote?.id]);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      /* silent */
    }
  };

  const balanceCurrencies = useMemo(() => balances.map((b) => b.currency.toUpperCase()), [balances]);
  const sellOptions = balanceCurrencies.length > 0 ? balanceCurrencies : ALL_CURRENCIES;
  const buyOptions = useMemo(
    () => ALL_CURRENCIES.filter((c) => c !== sellCurrency),
    [sellCurrency]
  );
  const sellBalance = balances.find((b) => b.currency.toUpperCase() === sellCurrency);

  const handleSwapDirection = () => {
    setSellCurrency(buyCurrency);
    setBuyCurrency(sellCurrency);
    setQuote(null);
  };

  const handleGetQuote = async () => {
    setError("");
    if (!amount || parseFloat(amount) <= 0) { setError("Enter a valid amount."); return; }
    if (sellCurrency === buyCurrency) { setError("Sell and buy currencies must differ."); return; }

    setLoading(true);
    setQuote(null);
    setConvertResult(null);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bitso/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCurrency: sellCurrency,
          toCurrency: buyCurrency,
          spendAmount: parseFloat(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get quote");
      const q = data.data as BitsoConversionQuote & { isMock?: boolean };
      expiryRef.current = q.expires ? q.expires * (q.expires < 10_000_000_000 ? 1000 : 1) : Date.now() + 30_000;
      if (Number.isNaN(expiryRef.current) || expiryRef.current < Date.now()) {
        expiryRef.current = Date.now() + 30_000;
      }
      setQuote(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteConvert = async () => {
    if (!quote) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${config.api.baseUrl}/api/bitso/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quote),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute conversion");
      setConvertResult(data.data);
      setSuccess("Conversion executed successfully!");
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute conversion");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setError("");
    if (!withdrawCurrency) { setError("Select a currency."); return; }
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) { setError("Enter a valid amount."); return; }

    const isCryptoWithdraw = isCrypto(withdrawCurrency);
    if (isCryptoWithdraw && !cryptoAddress.trim()) { setError("Enter a destination address."); return; }
    if (!isCryptoWithdraw && (!mxnClabe.trim() || !mxnBeneficiary.trim())) {
      setError("Enter beneficiary name and CLABE.");
      return;
    }

    setWithdrawing(true);
    setWithdrawResult(null);
    try {
      const body = isCryptoWithdraw
        ? { kind: "crypto", currency: withdrawCurrency, amount: parseFloat(withdrawAmount), address: cryptoAddress.trim() }
        : { kind: "mxn", amount: parseFloat(withdrawAmount), clabe: mxnClabe.trim(), beneficiary: mxnBeneficiary.trim() };

      const res = await fetch(`${config.api.baseUrl}/api/bitso/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate withdrawal");
      setWithdrawResult(data.data);
      setSuccess("Withdrawal initiated successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate withdrawal");
    } finally {
      setWithdrawing(false);
    }
  };

  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [
      ...trades.map((t) => ({ kind: "trade" as const, date: t.created_at, item: t })),
      ...deposits.map((d) => ({ kind: "deposit" as const, date: d.created_at, item: d })),
      ...withdrawals.map((w) => ({ kind: "withdrawal" as const, date: w.created_at, item: w })),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);
  }, [trades, deposits, withdrawals]);

  return (
    <div className="space-y-6 mt-6 pb-20">
      {/* Status Card */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Bitso</CardTitle>
          <CardDescription>Leading Latin American crypto exchange — MXN, ARS, COP on/off-ramps</CardDescription>
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
              <span className="text-xs text-muted-foreground">· client {status.clientId} · {status.status}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exchange Rates */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Exchange Rates</span>
            <Button variant="outline" size="sm" onClick={fetchRates} disabled={loadingRates}>
              {loadingRates ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </CardTitle>
          <CardDescription>Live tickers across Bitso&apos;s major books</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRates && tickers.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading rates…
            </div>
          ) : tickers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rates available.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {tickers.map((t) => {
                const change = parseFloat(t.change_24);
                const positive = change >= 0;
                return (
                  <div key={t.book} className="rounded-md border px-3 py-2">
                    <p className="text-xs font-semibold text-muted-foreground">{bookLabel(t.book)}</p>
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      {parseFloat(t.last).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                    </p>
                    <p className={`text-[11px] tabular-nums ${positive ? "text-green-600" : "text-destructive"}`}>
                      {positive ? "+" : ""}{isNaN(change) ? "—" : change.toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balances */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Balances</CardTitle>
          <CardDescription className="text-xs">Bitso account balances</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingBalances ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading balances...</span>
            </div>
          ) : balancesError ? (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {balancesError}
            </div>
          ) : balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No balances found.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {balances.map((b) => (
                <div key={b.currency} className="rounded-md border px-3 py-2">
                  <span className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${
                    isCrypto(b.currency) ? "bg-blue-500/10 text-blue-600" : "bg-green-500/10 text-green-600"
                  }`}>
                    {b.currency.toUpperCase()}
                  </span>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {parseFloat(b.available).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {parseFloat(b.locked) > 0 ? `${parseFloat(b.locked).toLocaleString("en-US", { maximumFractionDigits: 4 })} locked` : "available"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Swap / Convert */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Convert / Swap</CardTitle>
          <CardDescription>Quote-then-convert instant exchange via Bitso&apos;s currency conversion API (30s quote expiry)</CardDescription>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {!convertResult && (
                <>
                  <div className="space-y-1.5">
                    <Label>You sell</Label>
                    <Select value={sellCurrency} onValueChange={(v) => { setSellCurrency(v); setQuote(null); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sell currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {sellOptions.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {sellBalance && (
                      <p className="text-xs text-muted-foreground">
                        Available: {formatAmount(sellBalance.available, sellBalance.currency)}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-center -my-2">
                    <button
                      onClick={handleSwapDirection}
                      className="rounded-full border bg-background p-1.5 hover:bg-muted transition-colors cursor-pointer"
                      aria-label="Swap direction"
                    >
                      <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <Label>You buy</Label>
                    <Select value={buyCurrency} onValueChange={(v) => { setBuyCurrency(v); setQuote(null); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Buy currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {buyOptions.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Amount ({sellCurrency})</Label>
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                      placeholder="100"
                      min="0"
                      step="any"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleGetQuote}
                    disabled={loading}
                    variant={quote ? "outline" : "default"}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {quote ? "Refresh Quote" : "Get Quote"}
                  </Button>
                </>
              )}

              {convertResult && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">Conversion Executed</p>
                    {convertResult.isMock && (
                      <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
                        SIMULATED
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground text-xs">Conversion ID</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">{convertResult.oid}</span>
                      <button
                        className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer"
                        onClick={() => handleCopy(convertResult.oid, "convert-id")}
                      >
                        {copiedField === "convert-id"
                          ? <Check className="h-3 w-3 text-green-500" />
                          : <Copy className="h-3 w-3 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { setConvertResult(null); setSuccess(""); }}>
                    New Conversion
                  </Button>
                </div>
              )}
            </div>

            <div>
              {quote ? (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">Quote</p>
                      {quote.isMock && (
                        <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
                          SIMULATED — API unavailable
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-mono tabular-nums ${secondsLeft <= 5 ? "text-destructive" : "text-muted-foreground"}`}>
                      {secondsLeft > 0 ? `expires in ${secondsLeft}s` : "expired"}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">You send</span>
                      <span className="font-medium">{formatAmount(quote.from_amount, quote.from_currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">You receive</span>
                      <span className="font-medium">{formatAmount(quote.to_amount, quote.to_currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rate</span>
                      <span>1 {quote.from_currency.toUpperCase()} = {parseFloat(quote.plain_rate).toLocaleString("en-US", { maximumFractionDigits: 6 })} {quote.to_currency.toUpperCase()}</span>
                    </div>
                    {quote.fee_amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee</span>
                        <span>{formatAmount(quote.fee_amount, quote.fee_currency ?? quote.from_currency)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button className="flex-1" onClick={handleExecuteConvert} disabled={loading || secondsLeft <= 0}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm Conversion
                    </Button>
                    <Button variant="outline" onClick={() => setQuote(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center p-6 rounded-lg border border-dashed">
                  <p className="text-sm text-muted-foreground">
                    Fill in the form and click <span className="font-medium">Get Quote</span>. Bitso conversion quotes expire in 30 seconds.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdraw (Offramp) */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>Withdraw</CardTitle>
          <CardDescription>Offramp to a Mexican bank account (SPEI/CLABE) or a crypto wallet address</CardDescription>
        </CardHeader>
        <CardContent>
          {withdrawResult ? (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3 max-w-md">
              <p className="font-medium text-sm">Withdrawal Initiated</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Amount</span>
                  <span className="text-xs">{formatAmount(withdrawResult.amount, withdrawResult.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">Status</span>
                  <span className="text-xs">{withdrawResult.status}</span>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setWithdrawResult(null)}>
                New Withdrawal
              </Button>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={withdrawCurrency} onValueChange={setWithdrawCurrency}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {(balanceCurrencies.length > 0 ? balanceCurrencies : ALL_CURRENCIES).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    min="0"
                    step="any"
                  />
                </div>
              </div>

              {withdrawCurrency && isCrypto(withdrawCurrency) && (
                <div className="space-y-1.5">
                  <Label>Destination address</Label>
                  <Input
                    value={cryptoAddress}
                    onChange={(e) => setCryptoAddress(e.target.value)}
                    placeholder={`${withdrawCurrency} wallet address`}
                  />
                </div>
              )}

              {withdrawCurrency && !isCrypto(withdrawCurrency) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Beneficiary name</Label>
                    <Input value={mxnBeneficiary} onChange={(e) => setMxnBeneficiary(e.target.value)} placeholder="Full name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CLABE</Label>
                    <Input value={mxnClabe} onChange={(e) => setMxnClabe(e.target.value)} placeholder="18-digit CLABE" maxLength={18} />
                  </div>
                  {withdrawCurrency !== "MXN" && (
                    <p className="text-xs text-muted-foreground md:col-span-2">
                      Only MXN (SPEI/CLABE) fiat withdrawals are wired up in this demo — other fiat rails (ARS, COP) use separate Bitso Payouts endpoints not yet implemented here.
                    </p>
                  )}
                </div>
              )}

              <Button onClick={handleWithdraw} disabled={withdrawing || !withdrawCurrency}>
                {withdrawing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Withdraw
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="max-w-2xl mx-auto mb-6">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Trades, deposits, and withdrawals</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingActivity ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading activity...</span>
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-0">
              {activity.map((a) => {
                const badgeClass = a.kind === "trade"
                  ? "bg-purple-500/10 text-purple-600"
                  : a.kind === "deposit"
                  ? "bg-blue-500/10 text-blue-600"
                  : "bg-orange-500/10 text-orange-600";
                const label = a.kind === "trade" ? "Trade" : a.kind === "deposit" ? "Deposit" : "Withdrawal";
                const summary = a.kind === "trade"
                  ? `${a.item.book.toUpperCase()} · ${a.item.side} ${a.item.major} ${a.item.major_currency.toUpperCase()}`
                  : `${a.item.amount} ${a.item.currency.toUpperCase()}`;
                const status = a.kind === "trade" ? "COMPLETE" : a.item.status;
                const id = a.kind === "trade" ? String(a.item.tid) : a.kind === "deposit" ? a.item.fid : a.item.wid;
                return (
                  <button
                    key={`${a.kind}-${id}`}
                    className="w-full text-left py-3 border-b last:border-0 text-sm space-y-1 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors cursor-pointer"
                    onClick={() => setSelectedActivity(a)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                          {label}
                        </span>
                        <span className="text-muted-foreground text-xs font-mono">{String(id).slice(0, 10)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${
                          status === "complete" || status === "COMPLETE" ? "text-green-600"
                          : status === "failed" ? "text-destructive"
                          : "text-muted-foreground"
                        }`}>
                          {status}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{summary}</span>
                      <span>{new Date(a.date).toLocaleString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Detail Dialog */}
      <Dialog open={!!selectedActivity} onOpenChange={(o) => !o && setSelectedActivity(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedActivity?.kind === "trade" ? "Trade Details"
                : selectedActivity?.kind === "deposit" ? "Deposit Details"
                : "Withdrawal Details"}
            </DialogTitle>
          </DialogHeader>
          {selectedActivity && (
            <ActivityDetail activity={selectedActivity} onCopy={handleCopy} copiedField={copiedField} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivityDetail({
  activity,
  onCopy,
  copiedField,
}: {
  activity: ActivityItem;
  onCopy: (text: string, field: string) => void;
  copiedField: string | null;
}) {
  function Row({ label, value, copyKey }: { label: string; value?: string | number | null; copyKey?: string }) {
    if (value === null || value === undefined || value === "") return null;
    const str = String(value);
    return (
      <div className="flex items-center justify-between py-1 border-b last:border-0 text-sm">
        <span className="text-muted-foreground text-xs shrink-0 mr-3">{label}</span>
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-mono text-xs truncate">{str}</span>
          {copyKey && (
            <button className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer" onClick={() => onCopy(str, copyKey)}>
              {copiedField === copyKey
                ? <Check className="h-3 w-3 text-green-500" />
                : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (activity.kind === "trade") {
    const t = activity.item;
    return (
      <div className="rounded-md border px-3 text-sm">
        <Row label="Trade ID" value={t.tid} copyKey="a-id" />
        <Row label="Order ID" value={t.oid} />
        <Row label="Book" value={t.book.toUpperCase()} />
        <Row label="Side" value={t.side} />
        <Row label="Price" value={t.price} />
        <Row label="Major" value={`${t.major} ${t.major_currency.toUpperCase()}`} />
        <Row label="Minor" value={`${t.minor} ${t.minor_currency.toUpperCase()}`} />
        <Row label="Fees" value={`${t.fees_amount} ${t.fees_currency.toUpperCase()}`} />
        <Row label="Created" value={new Date(t.created_at).toLocaleString()} />
      </div>
    );
  }
  if (activity.kind === "deposit") {
    const d = activity.item;
    return (
      <div className="rounded-md border px-3 text-sm">
        <Row label="ID" value={d.fid} copyKey="a-id" />
        <Row label="Amount" value={`${d.amount} ${d.currency.toUpperCase()}`} />
        <Row label="Method" value={d.method_name ?? d.method} />
        <Row label="Status" value={d.status} />
        <Row label="Created" value={new Date(d.created_at).toLocaleString()} />
      </div>
    );
  }
  const w = activity.item;
  return (
    <div className="rounded-md border px-3 text-sm">
      <Row label="ID" value={w.wid} copyKey="a-id" />
      <Row label="Amount" value={`${w.amount} ${w.currency.toUpperCase()}`} />
      <Row label="Method" value={w.method_name ?? w.method} />
      <Row label="Status" value={w.status} />
      <Row label="Created" value={new Date(w.created_at).toLocaleString()} />
    </div>
  );
}
