"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { config } from "@/lib/config";
import {
  Loader2,
  Copy,
  Check,
  ChevronRight,
  CheckCircle2,
  ArrowDownUp,
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
  OpenFXBalance,
  OpenFXTradingPair,
  OpenFXQuote,
  OpenFXTrade,
  OpenFXDeposit,
  OpenFXWithdrawal,
  OpenFXCryptoWithdrawalAddress,
  OpenFXFiatWithdrawalAddress,
} from "@/lib/services/openfx";

const STABLECOINS = ["USDC", "USDT", "EURC"];
const isFiat = (currency: string) => !STABLECOINS.includes(currency);

function formatAmount(amount: number, currency: string): string {
  const decimals = STABLECOINS.includes(currency) ? 4 : 2;
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}

type ActivityItem =
  | { kind: "trade"; date: string; item: OpenFXTrade }
  | { kind: "deposit"; date: string; item: OpenFXDeposit }
  | { kind: "withdrawal"; date: string; item: OpenFXWithdrawal };

export function OpenFXInterface() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Balances
  const [balances, setBalances] = useState<OpenFXBalance[]>([]);
  const [netBalanceInUSD, setNetBalanceInUSD] = useState(0);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [balancesError, setBalancesError] = useState("");

  // Markets
  const [tradingPairs, setTradingPairs] = useState<OpenFXTradingPair[]>([]);

  // Trade / swap
  const [sellCurrency, setSellCurrency] = useState("USD");
  const [buyCurrency, setBuyCurrency] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<(OpenFXQuote & { isMock?: boolean }) | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [tradeResult, setTradeResult] = useState<{ id: string; status: string; amount: number; buy: string; sell: string; isMock?: boolean } | null>(null);
  const expiryRef = useRef<number>(0);

  // Withdraw (offramp)
  const [cryptoAddresses, setCryptoAddresses] = useState<OpenFXCryptoWithdrawalAddress[]>([]);
  const [fiatAddresses, setFiatAddresses] = useState<OpenFXFiatWithdrawalAddress[]>([]);
  const [withdrawCurrency, setWithdrawCurrency] = useState("");
  const [withdrawAddressId, setWithdrawAddressId] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("10");
  const [withdrawResult, setWithdrawResult] = useState<OpenFXWithdrawal | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  // Activity
  const [trades, setTrades] = useState<OpenFXTrade[]>([]);
  const [deposits, setDeposits] = useState<OpenFXDeposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<OpenFXWithdrawal[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  const fetchAccountData = useCallback(async () => {
    setLoadingBalances(true);
    setBalancesError("");
    try {
      const [balancesRes, marketsRes, cryptoRes, fiatRes] = await Promise.all([
        fetch(`${config.api.baseUrl}/api/openfx/balances`),
        fetch(`${config.api.baseUrl}/api/openfx/markets`),
        fetch(`${config.api.baseUrl}/api/openfx/withdrawal-addresses`),
        fetch(`${config.api.baseUrl}/api/openfx/fiat-withdrawal-addresses`),
      ]);
      if (balancesRes.ok) {
        const d = await balancesRes.json();
        setBalances(d.data?.balances ?? []);
        setNetBalanceInUSD(d.data?.netBalanceInUSD ?? 0);
      } else {
        const d = await balancesRes.json().catch(() => ({}));
        setBalancesError(d.error || "Failed to load OpenFX balances.");
      }
      if (marketsRes.ok) {
        const d = await marketsRes.json();
        setTradingPairs(d.data?.tradingPairs ?? []);
      }
      if (cryptoRes.ok) {
        const d = await cryptoRes.json();
        setCryptoAddresses(d.data ?? []);
      }
      if (fiatRes.ok) {
        const d = await fiatRes.json();
        setFiatAddresses(d.data ?? []);
      }
    } catch {
      setBalancesError("Failed to load OpenFX account data.");
    } finally {
      setLoadingBalances(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const [tradesRes, depositsRes, withdrawalsRes] = await Promise.all([
        fetch(`${config.api.baseUrl}/api/openfx/trades?limit=15`),
        fetch(`${config.api.baseUrl}/api/openfx/deposits?limit=15`),
        fetch(`${config.api.baseUrl}/api/openfx/withdrawals?limit=15`),
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
    fetchAccountData();
    fetchActivity();
  }, [fetchAccountData, fetchActivity]);

  useEffect(() => {
    if (success) {
      fetchAccountData();
      fetchActivity();
    }
  }, [success, fetchAccountData, fetchActivity]);

  // Quote countdown
  useEffect(() => {
    if (!quote) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((expiryRef.current - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id]);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { /* silent */ }
  };

  const balanceCurrencies = useMemo(() => balances.map((b) => b.currency), [balances]);

  const buyOptions = useMemo(() => {
    const fromMarkets = tradingPairs.filter((p) => p.sell === sellCurrency).map((p) => p.buy);
    const options = fromMarkets.length > 0
      ? fromMarkets
      : balanceCurrencies.filter((c) => c !== sellCurrency);
    return Array.from(new Set(options));
  }, [tradingPairs, sellCurrency, balanceCurrencies]);

  const sellBalance = balances.find((b) => b.currency === sellCurrency);

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
    setTradeResult(null);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/openfx/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          buy: buyCurrency,
          sell: sellCurrency,
          referencedUnit: sellCurrency,
          quoteForSeconds: 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get quote");
      const q = data.data as OpenFXQuote & { isMock?: boolean };
      expiryRef.current = new Date(q.createdAt).getTime() + q.expiryTimeinSeconds * 1000;
      if (Number.isNaN(expiryRef.current) || expiryRef.current < Date.now()) {
        expiryRef.current = Date.now() + q.expiryTimeinSeconds * 1000;
      }
      setQuote(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTrade = async () => {
    if (!quote) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${config.api.baseUrl}/api/openfx/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quote),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute trade");
      setTradeResult({ ...data.data.trade, isMock: data.data.isMock });
      setSuccess("Trade executed successfully!");
      setQuote(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute trade");
    } finally {
      setLoading(false);
    }
  };

  const withdrawDestinations = useMemo(() => {
    if (!withdrawCurrency) return [];
    if (isFiat(withdrawCurrency)) {
      return fiatAddresses.filter((a) => a.currency === withdrawCurrency);
    }
    return cryptoAddresses.filter((a) => a.coinName === withdrawCurrency);
  }, [withdrawCurrency, fiatAddresses, cryptoAddresses]);

  const handleWithdraw = async () => {
    setError("");
    if (!withdrawCurrency || !withdrawAddressId) { setError("Select a currency and destination."); return; }
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) { setError("Enter a valid amount."); return; }

    setWithdrawing(true);
    setWithdrawResult(null);
    try {
      const res = await fetch(`${config.api.baseUrl}/api/openfx/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(withdrawAmount),
          currency: withdrawCurrency,
          withdrawalAddressId: withdrawAddressId,
        }),
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
      ...trades.map((t) => ({ kind: "trade" as const, date: t.createdAtUtc, item: t })),
      ...deposits.map((d) => ({ kind: "deposit" as const, date: d.createdAt, item: d })),
      ...withdrawals.map((w) => ({ kind: "withdrawal" as const, date: w.createdAt, item: w })),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);
  }, [trades, deposits, withdrawals]);

  return (
    <div className="space-y-6 mt-6 pb-20">
      {/* Balances Card */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle>OpenFX Organization</CardTitle>
          <CardDescription className="text-xs">OpenFX sandbox balances</CardDescription>
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
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {balances.map((b) => (
                  <div key={b.id} className="rounded-md border px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${
                        isFiat(b.currency) ? "bg-green-500/10 text-green-600" : "bg-blue-500/10 text-blue-600"
                      }`}>
                        {b.currency}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      {b.amount.toLocaleString("en-US", {
                        minimumFractionDigits: STABLECOINS.includes(b.currency) ? 4 : 2,
                        maximumFractionDigits: STABLECOINS.includes(b.currency) ? 4 : 2,
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      ${b.totalBalanceInUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">Connected to OpenFX sandbox</span>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  Net: ${netBalanceInUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Trade / Swap Card */}
      {!loadingBalances && !balancesError && balances.length > 0 && (
        <Card className="max-w-5xl mx-auto">
          <CardHeader>
            <CardTitle>Trade / Swap</CardTitle>
            <CardDescription>Quote-then-trade currency exchange via OpenFX</CardDescription>
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
              {/* Left: Form */}
              <div className="space-y-4">
                {!tradeResult && (
                  <>
                    <div className="space-y-1.5">
                      <Label>You sell</Label>
                      <Select value={sellCurrency} onValueChange={(v) => { setSellCurrency(v); setQuote(null); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sell currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {balanceCurrencies.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {sellBalance && (
                        <p className="text-xs text-muted-foreground">
                          Available: {formatAmount(sellBalance.withdrawableBalance, sellBalance.currency)}
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

                {tradeResult && (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">Trade Executed</p>
                      {tradeResult.isMock && (
                        <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
                          SIMULATED
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-xs">Trade</span>
                        <span className="text-xs">{tradeResult.sell} → {tradeResult.buy}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-xs">Trade ID</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{tradeResult.id.slice(0, 16)}…</span>
                          <button
                            className="shrink-0 p-0.5 rounded hover:bg-muted cursor-pointer"
                            onClick={() => handleCopy(tradeResult.id, "trade-id")}
                          >
                            {copiedField === "trade-id"
                              ? <Check className="h-3 w-3 text-green-500" />
                              : <Copy className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => { setTradeResult(null); setSuccess(""); }}>
                      New Trade
                    </Button>
                  </div>
                )}
              </div>

              {/* Right: Quote */}
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
                        <span className="font-medium">{formatAmount(quote.referencedAmount, quote.sell)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You receive</span>
                        <span className="font-medium">{formatAmount(quote.quoteAmount, quote.buy)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rate</span>
                        <span>
                          1 {quote.sell} = {(quote.quoteAmount / quote.referencedAmount).toFixed(6)} {quote.buy}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button className="flex-1" onClick={handleExecuteTrade} disabled={loading || secondsLeft <= 0}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Trade
                      </Button>
                      <Button variant="outline" onClick={() => setQuote(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-center p-6 rounded-lg border border-dashed">
                    <p className="text-sm text-muted-foreground">
                      Fill in the form and click <span className="font-medium">Get Quote</span>. OpenFX quotes are time-locked and expire quickly.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Withdraw (Offramp) Card */}
      {!loadingBalances && !balancesError && balances.length > 0 && (
        <Card className="max-w-5xl mx-auto">
          <CardHeader>
            <CardTitle>Withdraw</CardTitle>
            <CardDescription>Offramp funds to an approved bank account or crypto wallet</CardDescription>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl">
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={withdrawCurrency} onValueChange={(v) => { setWithdrawCurrency(v); setWithdrawAddressId(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {balances.filter((b) => b.withdrawableBalance > 0).map((b) => (
                        <SelectItem key={b.currency} value={b.currency}>{b.currency}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Destination</Label>
                  <Select value={withdrawAddressId} onValueChange={setWithdrawAddressId} disabled={!withdrawCurrency}>
                    <SelectTrigger>
                      <SelectValue placeholder={withdrawCurrency ? "Select destination" : "Pick a currency first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {withdrawDestinations.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {"bankName" in d
                            ? `${d.bankName} (...${d.accountNumber.slice(-4)})`
                            : `${d.name} (...${d.address.slice(-6)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {withdrawCurrency && withdrawDestinations.length === 0 && (
                    <p className="text-xs text-muted-foreground">No approved {isFiat(withdrawCurrency) ? "bank accounts" : "wallets"} for {withdrawCurrency}.</p>
                  )}
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
                <div className="md:col-span-4">
                  <Button onClick={handleWithdraw} disabled={withdrawing || !withdrawAddressId}>
                    {withdrawing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Withdraw
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  ? `${a.item.tradingPair} · ${a.item.amount} ${a.item.referencedUnit}`
                  : `${a.item.amount} ${a.item.currency}`;
                const status = a.kind === "trade" ? a.item.status : a.item.status;
                return (
                  <button
                    key={`${a.kind}-${a.item.id}`}
                    className="w-full text-left py-3 border-b last:border-0 text-sm space-y-1 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors cursor-pointer"
                    onClick={() => setSelectedActivity(a)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
                          {label}
                        </span>
                        <span className="text-muted-foreground text-xs font-mono">
                          {a.item.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${
                          status === "EXECUTED" || status === "COMPLETED" ? "text-green-600"
                          : status === "CANCELLED" || status === "ERROR" ? "text-destructive"
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
        <Row label="ID" value={t.id} copyKey="a-id" />
        <Row label="Pair" value={t.tradingPair} />
        <Row label="Direction" value={t.tradeDirection} />
        <Row label="Amount" value={`${t.amount} ${t.referencedUnit}`} />
        <Row label="Computed" value={t.computedAmount} />
        <Row label="Order Type" value={t.orderType} />
        <Row label="Status" value={t.status} />
        <Row label="Source" value={t.source} />
        <Row label="Created" value={new Date(t.createdAtUtc).toLocaleString()} />
      </div>
    );
  }
  if (activity.kind === "deposit") {
    const d = activity.item;
    return (
      <div className="rounded-md border px-3 text-sm">
        <Row label="ID" value={d.id} copyKey="a-id" />
        <Row label="Amount" value={`${d.amount} ${d.currency}`} />
        <Row label="Network" value={d.network} />
        <Row label="Status" value={d.status} />
        <Row label="Tx Hash" value={d.transactionHash} copyKey="a-hash" />
        <Row label="Reference" value={d.referenceId} />
        <Row label="Created" value={new Date(d.createdAt).toLocaleString()} />
      </div>
    );
  }
  const w = activity.item;
  return (
    <div className="rounded-md border px-3 text-sm">
      <Row label="ID" value={w.id} copyKey="a-id" />
      <Row label="Amount" value={`${w.amount} ${w.currency}`} />
      <Row label="Network" value={w.network} />
      <Row label="Status" value={w.status} />
      <Row label="Tx Hash" value={w.transactionHash} copyKey="a-hash" />
      <Row label="Created" value={new Date(w.createdAt).toLocaleString()} />
    </div>
  );
}
