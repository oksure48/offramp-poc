"use client";

import { type ReactNode, useState, useEffect, useCallback, useMemo } from "react";
import { useDynamicContext, useUserWallets } from "@dynamic-labs/sdk-react-core";
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

function normalizeCurrencyCode(code: unknown): string {
  if (typeof code === "string") {
    return code.trim().toUpperCase();
  }
  if (code && typeof code === "object" && "code" in code && typeof (code as any).code === "string") {
    return (code as any).code.trim().toUpperCase();
  }
  return String(code ?? "").toUpperCase();
}

function isSixDecimalToken(code: unknown): boolean {
  const normalized = normalizeCurrencyCode(code);
  return ["USDC", "USDT", "USDB", "EURC"].includes(normalized);
}

const SOLANA_TOKEN_SYMBOLS: Record<string, string> = {
  "Es9vMFrzaCER5Dk7cmBKnU7D44ujHLrcu1YfRZ2Agwr7": "USDC",
  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": "USDT",
  "2ndSuk6AMB1XA1fRpSE4Jpuj1TaC4nnZLezTv8z6jPY": "USDB",
};

async function fetchSolanaWalletBalances(address: string) {
  const res = await fetch(`/api/solana/wallet-balances?address=${encodeURIComponent(address)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch wallet balances");
  return data.data as Array<{ symbol: string; amount: string; mint?: string }>;
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

// ─── flow types ───────────────────────────────────────────────────────────────

type FlowId = "onramp" | "swap" | "offramp-usd" | "offramp-fiat";

interface FlowDef {
  label: string;
  from: string;
  to: string;
  srcCurrency: string;
  rail: string;
  defaultAmount: string;
  minAmountNote?: string;
  badge: string;
  badgeColor: string;
}

const FLOW_DEFS: Record<FlowId, FlowDef> = {
  onramp: {
    label: "Onramp",
    from: "USD",
    to: "USDC",
    srcCurrency: "USD",
    rail: "Platform internal",
    defaultAmount: "10",
    badge: "Buy",
    badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  swap: {
    label: "Swap",
    from: "USDC",
    to: "USD",
    srcCurrency: "USDC",
    rail: "Platform internal",
    defaultAmount: "5",
    badge: "Redeem",
    badgeColor: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  },
  "offramp-usd": {
    label: "Offramp USD",
    from: "USDC",
    to: "USD Bank",
    srcCurrency: "USDC",
    rail: "ACH / Wire / RTP",
    defaultAmount: "5",
    badge: "Bank",
    badgeColor: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  },
  "offramp-fiat": {
    label: "Offramp Fiat",
    from: "USDC",
    to: "BRL (PIX)",
    srcCurrency: "USDC",
    rail: "PIX",
    defaultAmount: "20",
    minAmountNote: "Minimum ~$12 USD for BRL corridor",
    badge: "Global",
    badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
};

// ─── main component ──────────────────────────────────────────────────────────

export function LightsparkInterface() {
  const { primaryWallet } = useDynamicContext();
  const userWallets = useUserWallets();

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
  const [solanaAddress, setSolanaAddress] = useState("");
  const [useConnectedDynamicWallet, setUseConnectedDynamicWallet] = useState(false);
  const [solanaDestinationAccountId, setSolanaDestinationAccountId] = useState<string | null>(null);
  const [solanaDestinationLabel, setSolanaDestinationLabel] = useState("");
  const [solanaDestinationChain, setSolanaDestinationChain] = useState<string | null>(null);
  const [creatingSolanaDestination, setCreatingSolanaDestination] = useState(false);
  const [solanaDestinationError, setSolanaDestinationError] = useState("");
  const [solanaDestinationStatus, setSolanaDestinationStatus] = useState<"idle" | "created" | "reused">("idle");

  // ── platform accounts + execution demo ────────────────────────────────────
  const [platformAccounts, setPlatformAccounts] = useState<LightsparkInternalAccount[]>([]);
  const [externalAccounts, setExternalAccounts] = useState<LightsparkExternalAccount[]>([]);
  const [loadingPlatformAccounts, setLoadingPlatformAccounts] = useState(false);
  const [fundingAccountId, setFundingAccountId] = useState<string | null>(null);
  const [transactionsByCurrency, setTransactionsByCurrency] = useState<Record<string, LightsparkTransaction[]>>({});
  const [loadingTransactions, setLoadingTransactions] = useState<Record<string, boolean>>({});
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const [transactionsFallbackByCurrency, setTransactionsFallbackByCurrency] = useState<Record<string, boolean>>({});
  const [dynamicWalletBalances, setDynamicWalletBalances] = useState<Array<{ symbol: string; amount: string; mint?: string }>>([]);
  const [loadingDynamicWalletBalances, setLoadingDynamicWalletBalances] = useState(false);
  const [dynamicWalletBalanceError, setDynamicWalletBalanceError] = useState("");

  type DemoStage = "idle" | "quoting" | "quoted" | "executing" | "settling" | "done" | "error";
  const [activeFlow, setActiveFlow] = useState<FlowId>("onramp");
  const [demoStage, setDemoStage] = useState<DemoStage>("idle");
  const [demoQuote, setDemoQuote] = useState<LightsparkQuote | null>(null);
  const [demoTxn, setDemoTxn] = useState<LightsparkTransaction | null>(null);
  const [demoError, setDemoError] = useState("");
  const [demoAmount, setDemoAmount] = useState("10");
  const [preExecutionOnChainBalance, setPreExecutionOnChainBalance] = useState<number | null>(null);
  const [expectedOnrampAmount, setExpectedOnrampAmount] = useState<number | null>(null);
  const [onrampAssetSymbol, setOnrampAssetSymbol] = useState<string | null>(null);

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

  const connectedSolanaAddress = useMemo(() => {
    const directAddress = primaryWallet?.address;
    if (typeof directAddress === "string" && directAddress.trim() && !directAddress.startsWith("0x")) {
      return directAddress.trim();
    }
    const wallet = userWallets.find((wallet: { address?: string }) => {
      const address = wallet?.address;
      return typeof address === "string" && address.trim() && !address.startsWith("0x");
    });
    return wallet?.address?.trim() ?? "";
  }, [primaryWallet, userWallets]);

  const getOnChainTokenAmount = useCallback(
    (symbol: string, balances: Array<{ symbol: string; amount: string; mint?: string }>) => {
      const entry = balances.find((balance) => balance.symbol === symbol);
      return entry ? parseFloat(entry.amount) : 0;
    },
    []
  );

  useEffect(() => {
    if (useConnectedDynamicWallet && !solanaAddress && connectedSolanaAddress) {
      setSolanaAddress(connectedSolanaAddress);
    }
  }, [connectedSolanaAddress, solanaAddress, useConnectedDynamicWallet]);

  useEffect(() => {
    let mounted = true;
    const loadDynamicWalletBalances = async () => {
      if (!connectedSolanaAddress) {
        setDynamicWalletBalances([]);
        setDynamicWalletBalanceError("");
        return;
      }

      setLoadingDynamicWalletBalances(true);
      setDynamicWalletBalanceError("");
      try {
        const balances = await fetchSolanaWalletBalances(connectedSolanaAddress);
        if (mounted) {
          setDynamicWalletBalances(balances);
        }
      } catch (err) {
        if (mounted) {
          setDynamicWalletBalanceError(err instanceof Error ? err.message : "Failed to load connected wallet balances");
          setDynamicWalletBalances([]);
        }
      } finally {
        if (mounted) setLoadingDynamicWalletBalances(false);
      }
    };

    loadDynamicWalletBalances();
    return () => {
      mounted = false;
    };
  }, [connectedSolanaAddress]);

  useEffect(() => {
    if (demoStage !== "settling" || expectedOnrampAmount == null || !onrampAssetSymbol) return;
    const currentOnChainBalance = getOnChainTokenAmount(onrampAssetSymbol, dynamicWalletBalances);
    const previousBalance = preExecutionOnChainBalance ?? 0;
    const balanceDelta = currentOnChainBalance - previousBalance;

    if (balanceDelta >= expectedOnrampAmount - 0.000001) {
      setDemoStage("done");
    }
  }, [demoStage, dynamicWalletBalances, expectedOnrampAmount, onrampAssetSymbol, preExecutionOnChainBalance, getOnChainTokenAmount]);

  useEffect(() => {
    if (demoStage !== "settling" || !connectedSolanaAddress || !onrampAssetSymbol) return;
    let intervalId: number | undefined;
    const pollBalances = async () => {
      try {
        const balances = await fetchSolanaWalletBalances(connectedSolanaAddress);
        setDynamicWalletBalances(balances);
      } catch {
        // Keep trying until settlement or user reset.
      }
    };

    pollBalances();
    intervalId = window.setInterval(pollBalances, 5000);
    return () => {
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [demoStage, connectedSolanaAddress, onrampAssetSymbol]);

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

  const expectedOnrampFormatted = useMemo(() => {
    if (!demoQuote?.receivingCurrency) return null;
    return formatLightsparkAmount(
      demoQuote.totalReceivingAmount,
      demoQuote.receivingCurrency.code,
      demoQuote.receivingCurrency.decimals ?? (isSixDecimalToken(demoQuote.receivingCurrency.code) ? 6 : 2)
    );
  }, [demoQuote]);

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
    const acct = platformAccounts.find((a) => a.id === accountId);
    // $1,000 USD (2 decimals) or 1,000 USDC (6 decimals)
    const amount = acct?.type === "INTERNAL_CRYPTO" ? 1_000_000_000 : 100_000;
    setFundingAccountId(accountId);
    try {
      await fetch(`${config.api.baseUrl}/api/lightspark/sandbox-fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, amount }),
      });
      await fetchPlatformAccounts(customers[0]?.id);
    } finally {
      setFundingAccountId(null);
    }
  };

  const toggleAccountTransactions = async (currencyCode: string, accountId: string) => {
    setExpandedAccounts((s) => ({ ...s, [accountId]: !s[accountId] }));
    // If already loaded or toggling closed, do nothing else
    if (transactionsByCurrency[currencyCode] || expandedAccounts[accountId]) return;
    setLoadingTransactions((s) => ({ ...s, [currencyCode]: true }));
    try {
      const res = await fetch(`${config.api.baseUrl}/api/lightspark/transactions`);
      const data = await res.json();
      const txns: LightsparkTransaction[] = data.data ?? [];
      const filtered = txns.filter((t) => {
        const sent = t.sentAmount?.currency?.toUpperCase?.() ?? "";
        const recv = t.receivedAmount?.currency?.toUpperCase?.() ?? "";
        return sent === currencyCode.toUpperCase() || recv === currencyCode.toUpperCase();
      });
      if (filtered.length > 0) {
        setTransactionsByCurrency((s) => ({ ...s, [currencyCode]: filtered }));
        setTransactionsFallbackByCurrency((s) => ({ ...s, [currencyCode]: false }));
      } else if (txns.length > 0) {
        // Fallback: show recent transactions if none match the currency code
        setTransactionsByCurrency((s) => ({ ...s, [currencyCode]: txns.slice(0, 10) }));
        setTransactionsFallbackByCurrency((s) => ({ ...s, [currencyCode]: true }));
      } else {
        setTransactionsByCurrency((s) => ({ ...s, [currencyCode]: [] }));
        setTransactionsFallbackByCurrency((s) => ({ ...s, [currencyCode]: false }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingTransactions((s) => ({ ...s, [currencyCode]: false }));
    }
  };

  const handleFlowChange = (flowId: FlowId) => {
    setActiveFlow(flowId);
    setDemoAmount(FLOW_DEFS[flowId].defaultAmount);
    setDemoStage("idle");
    setDemoQuote(null);
    setDemoTxn(null);
    setDemoError("");
    setPreExecutionOnChainBalance(null);
    setExpectedOnrampAmount(null);
    setOnrampAssetSymbol(null);
  };

  const handleReset = () => {
    setDemoStage("idle");
    setDemoQuote(null);
    setDemoTxn(null);
    setDemoError("");
    setPreExecutionOnChainBalance(null);
    setExpectedOnrampAmount(null);
    setOnrampAssetSymbol(null);
  };

  const handleCreateSolanaDestination = async () => {
    const trimmedAddress = solanaAddress.trim();
    if (!trimmedAddress) {
      setSolanaDestinationError("Enter a Solana wallet address to register a destination.");
      return null;
    }
    if (!customers[0]?.id) {
      setSolanaDestinationError("Create or select a customer before registering the destination.");
      return null;
    }

    setCreatingSolanaDestination(true);
    setSolanaDestinationError("");
    setSolanaDestinationStatus("idle");
    setSolanaDestinationAccountId(null);
    setSolanaDestinationLabel("");
    setSolanaDestinationChain(null);

    const requestBody = {
      customerId: customers[0].id,
      currency: "USDC",
      accountInfo: {
        accountType: "SOLANA_WALLET",
        assetType: "USDC",
        address: trimmedAddress,
        chain: "Solana",
      },
    };

    try {
      const res = await fetch(`${config.api.baseUrl}/api/lightspark/external-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register Solana destination");
      }

      const account = data.data;
      if (!account?.id) {
        throw new Error("Failed to register Solana destination");
      }

      const chain = account.accountInfo?.chain ? String(account.accountInfo.chain) : "Solana";
      setSolanaDestinationAccountId(account.id);
      setSolanaDestinationLabel(account.accountInfo?.address ? String(account.accountInfo.address) : trimmedAddress);
      setSolanaDestinationChain(chain);
      setSolanaDestinationStatus(data.duplicate ? "reused" : "created");
      return account.id;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Duplicate external account exists")) {
        try {
          const lookupRes = await fetch(
            `${config.api.baseUrl}/api/lightspark/external-accounts?customerId=${encodeURIComponent(customers[0].id)}`
          );
          const lookupData = await lookupRes.json();
          const existingAccount = (lookupData.data ?? []).find((acct: any) => {
            const info = acct.accountInfo ?? {};
            return info.accountType === requestBody.accountInfo.accountType && info.address === requestBody.accountInfo.address;
          });
          if (existingAccount?.id) {
            const chain = existingAccount.accountInfo?.chain ? String(existingAccount.accountInfo.chain) : "Solana";
            setSolanaDestinationAccountId(existingAccount.id);
            setSolanaDestinationLabel(
              existingAccount.accountInfo?.address ? String(existingAccount.accountInfo.address) : trimmedAddress
            );
            setSolanaDestinationChain(chain);
            setSolanaDestinationStatus("reused");
            return existingAccount.id;
          }
        } catch {
          // continue to expose the duplicate error below if lookup fails
        }
        setSolanaDestinationStatus("reused");
      } else {
        setSolanaDestinationStatus("idle");
      }
      setSolanaDestinationError(err instanceof Error ? err.message : "Failed to register Solana destination");
      return null;
    } finally {
      setCreatingSolanaDestination(false);
    }
  };

  const handleCreateQuote = async () => {
    const parsed = parseFloat(demoAmount);
    if (isNaN(parsed) || parsed <= 0) return;

    let effectiveWalletAccountId: string | undefined;
    if (useConnectedDynamicWallet && !solanaDestinationAccountId && connectedSolanaAddress) {
      const createdAccountId = await handleCreateSolanaDestination();
      effectiveWalletAccountId = createdAccountId ?? solanaDestinationAccountId ?? undefined;
      if (!effectiveWalletAccountId) {
        setDemoError("Create a wallet destination before quoting.");
        setDemoStage("error");
        return;
      }
    } else if (useConnectedDynamicWallet && !solanaDestinationAccountId && !connectedSolanaAddress) {
      setDemoError("Connect a Dynamic Solana wallet or register a destination before quoting.");
      setDemoStage("error");
      return;
    } else {
      effectiveWalletAccountId = solanaDestinationAccountId ?? undefined;
    }

    const usdInternal = platformAccounts.find((a) => a.type === "INTERNAL_FIAT");
    const usdcInternal = platformAccounts.find((a) => a.type === "INTERNAL_CRYPTO");
    const brlExternal = externalAccounts.find((a) => a.accountInfo.accountType === "BRL_ACCOUNT");
    const usdExternal = externalAccounts.find((a) => a.accountInfo.accountType === "USD_ACCOUNT");

    const flowIds: Record<FlowId, { srcId?: string; dstId?: string }> = {
      onramp: { srcId: usdInternal?.id, dstId: useConnectedDynamicWallet ? effectiveWalletAccountId ?? usdcInternal?.id : usdcInternal?.id },
      swap: { srcId: useConnectedDynamicWallet ? effectiveWalletAccountId ?? usdcInternal?.id : usdcInternal?.id, dstId: usdInternal?.id },
      "offramp-usd": { srcId: useConnectedDynamicWallet ? effectiveWalletAccountId ?? usdcInternal?.id : usdcInternal?.id, dstId: usdExternal?.id },
      "offramp-fiat": { srcId: useConnectedDynamicWallet ? effectiveWalletAccountId ?? usdcInternal?.id : usdcInternal?.id, dstId: brlExternal?.id },
    };

    const { srcId, dstId } = flowIds[activeFlow];
    if (!srcId || !dstId) return;

    const srcAcct = platformAccounts.find((a) => a.id === srcId);
    const srcDecimals = srcAcct?.balance?.currency?.decimals ?? 2;
    const lockedCurrencyAmount = Math.round(parsed * Math.pow(10, srcDecimals));
    const senderCustomerInfo =
      activeFlow === "offramp-fiat"
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
        body: JSON.stringify({ sourceAccountId: srcId, destinationAccountId: dstId, lockedCurrencyAmount, senderCustomerInfo }),
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

    const receivingSymbol = demoQuote.receivingCurrency ? normalizeCurrencyCode(demoQuote.receivingCurrency.code) : null;
    const receivingDecimals = demoQuote.receivingCurrency
      ? demoQuote.receivingCurrency.decimals ?? (isSixDecimalToken(demoQuote.receivingCurrency.code) ? 6 : 2)
      : 2;
    const expectedAmount = demoQuote.receivingCurrency
      ? demoQuote.totalReceivingAmount / Math.pow(10, receivingDecimals)
      : null;

    let preExecutionBalance = null;
    if (useConnectedDynamicWallet && connectedSolanaAddress && receivingSymbol && expectedAmount != null) {
      try {
        const balances = await fetchSolanaWalletBalances(connectedSolanaAddress);
        setDynamicWalletBalances(balances);
        preExecutionBalance = getOnChainTokenAmount(receivingSymbol, balances);
        setPreExecutionOnChainBalance(preExecutionBalance);
      } catch {
        setPreExecutionOnChainBalance(null);
      }
      setExpectedOnrampAmount(expectedAmount);
      setOnrampAssetSymbol(receivingSymbol);
    } else {
      setPreExecutionOnChainBalance(null);
      setExpectedOnrampAmount(null);
      setOnrampAssetSymbol(null);
    }

    try {
      const res = await fetch(`${config.api.baseUrl}/api/lightspark/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: demoQuote.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      if (data.transaction) setDemoTxn(data.transaction);

      const shouldAwaitOnChain = useConnectedDynamicWallet && connectedSolanaAddress && receivingSymbol && expectedAmount != null;
      if (shouldAwaitOnChain) {
        setDemoStage("settling");
        try {
          const balances = await fetchSolanaWalletBalances(connectedSolanaAddress);
          setDynamicWalletBalances(balances);
        } catch {
          // Balance refresh may fail while waiting for on-chain settlement.
        }
      } else {
        setDemoStage("done");
      }

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

      {/* ── Payment Flows ───────────────────────────────────────────────────── */}
      <Card className="max-w-5xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Payment Flows
          </CardTitle>
          <CardDescription>
            Four live flows against real sandbox accounts — onramp, swap, and offramp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Platform balances */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Platform Balances
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
                  const isCrypto = acct.type === "INTERNAL_CRYPTO";
                  const isEmbedded = acct.type === "EMBEDDED_WALLET";
                  const held = totalBal - bal;
                  return (
                    <div key={acct.id}>
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-medium w-12 shrink-0">{curr.code}</span>
                          <span className="tabular-nums font-semibold">
                            {isFiat
                              ? `${curr.symbol}${bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `${bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: Math.min(curr.decimals ?? 6, 4) })} ${curr.code}`}
                          </span>
                          {held > 0.0001 && (
                            <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                              ({totalBal.toLocaleString("en-US", { maximumFractionDigits: 2 })} total, {held.toLocaleString("en-US", { maximumFractionDigits: 2 })} held)
                            </span>
                          )}
                          <span className={`text-[10px] rounded-full px-1.5 py-0.5 shrink-0 ${
                            isEmbedded ? "bg-purple-500/10 text-purple-600"
                            : isFiat ? "bg-blue-500/10 text-blue-600"
                            : "bg-teal-500/10 text-teal-600"
                          }`}>
                            {acct.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isEmbedded && (
                            <span className="text-[10px] text-muted-foreground">Spark — read-only</span>
                          )}
                          {(isFiat || isCrypto) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={fundingAccountId === acct.id}
                              onClick={() => handleFundAccount(acct.id)}
                            >
                              {fundingAccountId === acct.id && (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              )}
                              {isFiat ? "+$1,000" : "+1,000 USDC"} (sandbox)
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toggleAccountTransactions(curr.code, acct.id)}
                          >
                            {expandedAccounts[acct.id] ? "Hide transactions" : "Transactions"}
                          </Button>
                        </div>
                      </div>

                      {expandedAccounts[acct.id] && (
                        <div className="mt-2 rounded-md border bg-muted/5 p-3 text-xs">
                          {loadingTransactions[curr.code] ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Loading transactions…</span>
                            </div>
                            ) : (transactionsByCurrency[curr.code] ?? []).length === 0 ? (
                              transactionsFallbackByCurrency[curr.code] ? (
                                <p className="text-muted-foreground">No transactions matched {curr.code}; showing recent transactions instead.</p>
                              ) : (
                                <p className="text-muted-foreground">No recent transactions for {curr.code}.</p>
                              )
                            ) : (
                            <div className="space-y-2">
                              {(transactionsByCurrency[curr.code] ?? []).map((t) => (
                                <div key={t.id} className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium">{t.type} · {t.status}</p>
                                    <p className="text-muted-foreground text-[11px]">{new Date(t.createdAt).toLocaleString()}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-semibold tabular-nums">
                                      {t.sentAmount && t.sentAmount.currency === curr.code
                                        ? formatLightsparkAmount(t.sentAmount.amount, t.sentAmount.currency, curr.decimals)
                                        : t.receivedAmount
                                        ? formatLightsparkAmount(t.receivedAmount.amount, t.receivedAmount.currency, curr.decimals)
                                        : "—"}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground font-mono truncate" title={t.id}>{t.id}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Flow selector */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Select Flow
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.entries(FLOW_DEFS) as [FlowId, FlowDef][]).map(([id, def]) => {
                const isActive = activeFlow === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleFlowChange(id)}
                    disabled={demoStage === "quoting" || demoStage === "executing" || demoStage === "settling"}
                    className={`rounded-lg border p-3 text-left transition-all cursor-pointer ${
                      isActive
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${def.badgeColor}`}>
                        {def.badge}
                      </span>
                    </div>
                    <p className={`font-semibold text-sm mb-0.5 ${isActive ? "text-primary" : ""}`}>
                      {def.label}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">{def.from}</span>
                      <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                      <span className="font-medium text-foreground/70 truncate">{def.to}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{def.rail}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Execution panel */}
          <div className="border rounded-lg p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{FLOW_DEFS[activeFlow].label}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{FLOW_DEFS[activeFlow].from}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-foreground/80">{FLOW_DEFS[activeFlow].to}</span>
                  <span>·</span>
                  <span>{FLOW_DEFS[activeFlow].rail}</span>
                </div>
              </div>
              {FLOW_DEFS[activeFlow].minAmountNote && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 pt-0.5">
                  {FLOW_DEFS[activeFlow].minAmountNote}
                </span>
              )}
            </div>

            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Solana destination</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Register a Solana wallet with LightSpark so the quote targets a real wallet address.
                  </p>
                </div>
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                  Solana
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground/80">
                  <input
                    type="checkbox"
                    checked={useConnectedDynamicWallet}
                    onChange={(e) => {
                      setUseConnectedDynamicWallet(e.target.checked);
                      if (e.target.checked && connectedSolanaAddress) {
                        setSolanaAddress(connectedSolanaAddress);
                      }
                    }}
                    className="h-3.5 w-3.5"
                  />
                  Use connected Dynamic wallet
                </label>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={solanaAddress}
                  onChange={(e) => {
                    setSolanaAddress(e.target.value);
                    if (solanaDestinationError) setSolanaDestinationError("");
                  }}
                  placeholder="Solana wallet address"
                  className="sm:max-w-md"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleCreateSolanaDestination} disabled={creatingSolanaDestination}>
                  {creatingSolanaDestination ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Registering…</>
                  ) : "Register wallet"}
                </Button>
              </div>
              {solanaDestinationAccountId ? (
                <div className={`rounded-md border p-2 text-xs ${solanaDestinationStatus === "reused" ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"}`}>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{solanaDestinationStatus === "reused" ? "Existing wallet destination reused" : "Destination ready for quotes"}</p>
                    {solanaDestinationChain ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {solanaDestinationChain}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono truncate">{solanaDestinationLabel || solanaAddress}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Use a connected Solana wallet or paste any Solana address to create a LightSpark external account.
                </p>
              )}
              {solanaDestinationError && (
                <p className="text-xs text-destructive">{solanaDestinationError}</p>
              )}

              {connectedSolanaAddress && (
                <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected Dynamic wallet</p>
                      <p className="font-mono text-[11px] mt-1 break-all">{connectedSolanaAddress}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {loadingDynamicWalletBalances ? "Loading balances…" : "On-chain balances"}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {loadingDynamicWalletBalances ? (
                      <p className="text-xs text-muted-foreground">Fetching SOL and token balances from Solana RPC.</p>
                    ) : dynamicWalletBalanceError ? (
                      <p className="text-xs text-destructive">{dynamicWalletBalanceError}</p>
                    ) : dynamicWalletBalances.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No on-chain balances detected, or wallet is not on Solana mainnet.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {dynamicWalletBalances.map((balance) => (
                          <div key={balance.symbol} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <p className="font-semibold">{balance.symbol}</p>
                            <p className="mt-1 text-sm font-medium">{balance.amount}</p>
                            {balance.mint && balance.symbol !== "SOL" && (
                              <p className="mt-1 text-[10px] text-muted-foreground truncate">{balance.mint}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Amount + actions */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount ({FLOW_DEFS[activeFlow].srcCurrency})</Label>
                <Input
                  type="number"
                  value={demoAmount}
                  onChange={(e) => setDemoAmount(e.target.value)}
                  min="0.01"
                  step="any"
                  className="w-36"
                  disabled={demoStage === "quoting" || demoStage === "executing" || demoStage === "settling"}
                />
              </div>
              <div className="flex gap-2 pb-0.5">
                <Button
                  onClick={handleCreateQuote}
                  disabled={platformAccounts.length === 0 || demoStage === "quoting" || demoStage === "executing" || demoStage === "settling"}
                  size="sm"
                >
                  {demoStage === "quoting" ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Quoting…</>
                  ) : "Get Quote"}
                </Button>
                {demoStage === "quoted" && demoQuote && (
                  <Button onClick={handleExecuteQuote} size="sm">
                    Execute
                  </Button>
                )}
                {(demoStage === "done" || demoStage === "error") && (
                  <Button onClick={handleReset} size="sm" variant="outline">
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Quote preview */}
            {demoQuote && demoStage !== "idle" && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quote</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                      demoStage === "done" ? "bg-green-500/10 text-green-600"
                      : demoStage === "executing" ? "bg-blue-500/10 text-blue-600"
                      : demoStage === "settling" ? "bg-amber-500/10 text-amber-600"
                      : "bg-slate-500/10 text-slate-500"
                    }`}>
                      {demoStage === "executing" ? "PROCESSING"
                        : demoStage === "settling" ? "SETTLING"
                        : demoStage === "done" ? "CONFIRMED"
                        : "PENDING"}
                    </span>
                    {demoQuote.expiresAt && demoStage === "quoted" && (
                      <span className="text-[10px] text-muted-foreground">
                        expires {new Date(demoQuote.expiresAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-0.5">You send</p>
                    <p className="font-semibold">
                      {demoQuote.sendingCurrency
                        ? formatLightsparkAmount(demoQuote.totalSendingAmount, demoQuote.sendingCurrency.code, demoQuote.sendingCurrency.decimals)
                        : demoQuote.totalSendingAmount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">They receive</p>
                    <p className="font-semibold text-primary">
                      {demoQuote.receivingCurrency
                        ? formatLightsparkAmount(demoQuote.totalReceivingAmount, demoQuote.receivingCurrency.code, demoQuote.receivingCurrency.decimals)
                        : demoQuote.totalReceivingAmount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">Rate</p>
                    <p className="font-medium tabular-nums">
                      {demoQuote.exchangeRate != null
                        ? `${(1 / demoQuote.exchangeRate).toFixed(4)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">Fees</p>
                    <p className="font-medium tabular-nums">
                      {demoQuote.feesIncluded != null && demoQuote.sendingCurrency
                        ? formatLightsparkAmount(demoQuote.feesIncluded, demoQuote.sendingCurrency.code, demoQuote.sendingCurrency.decimals)
                        : "—"}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{demoQuote.id}</p>
              </div>
            )}

            {/* Completed transaction */}
            {(demoStage === "done" || demoStage === "settling") && (
              <div className={`rounded-lg p-3 space-y-2 ${demoStage === "done" ? "bg-green-500/5 border border-green-500/20" : "bg-amber-500/5 border border-amber-500/20"}`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 shrink-0 ${demoStage === "done" ? "text-green-500" : "text-amber-500"}`} />
                  <span className={`font-semibold text-sm ${demoStage === "done" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-300"}`}>
                    {activeFlow === "onramp"
                      ? demoStage === "done"
                        ? "Onramp complete"
                        : "Onramp awaiting on-chain settlement"
                      : activeFlow === "swap"
                      ? demoStage === "done"
                        ? "Swap complete"
                        : "Swap awaiting settlement"
                      : activeFlow === "offramp-usd"
                      ? demoStage === "done"
                        ? "Offramp to USD initiated"
                        : "Offramp awaiting settlement"
                      : demoStage === "done"
                      ? "Offramp to fiat initiated"
                      : "Offramp awaiting settlement"}
                  </span>
                </div>
                {demoTxn ? (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {demoTxn.sentAmount && (
                      <div>
                        <p className="text-muted-foreground mb-0.5">Debited</p>
                        <p className="font-semibold">
                          {formatLightsparkAmount(
                            demoTxn.sentAmount.amount,
                            demoTxn.sentAmount.currency,
                            isSixDecimalToken(demoTxn.sentAmount.currency) ? 6 : 2
                          )}
                        </p>
                      </div>
                    )}
                    {demoTxn.receivedAmount && (
                      <div>
                        <p className="text-muted-foreground mb-0.5">Credited</p>
                        <p className="font-semibold text-primary">
                          {formatLightsparkAmount(
                            demoTxn.receivedAmount.amount,
                            demoTxn.receivedAmount.currency,
                            isSixDecimalToken(demoTxn.receivedAmount.currency) ? 6 : 2
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Transaction is processing — check the transactions tab for status.</p>
                )}
                {demoStage === "settling" && expectedOnrampAmount != null && onrampAssetSymbol && (
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                    <p className="font-medium">On-chain settlement pending</p>
                    <p className="mt-1">
                      Waiting for {expectedOnrampFormatted ?? expectedOnrampAmount.toFixed(6)} {onrampAssetSymbol} to arrive in the connected Solana wallet.
                    </p>
                    <p className="mt-1 text-[10px] text-amber-700/90">
                      Funds have left the fiat/onramp leg and are currently in the gap until on-chain arrival.
                    </p>
                  </div>
                )}
                {demoTxn && (
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{demoTxn.id}</p>
                )}
              </div>
            )}

            {/* Error */}
            {demoStage === "error" && demoError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
                <p className="font-medium mb-0.5">Quote failed</p>
                <p>{demoError}</p>
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

function Stat({ label, children }: { label: string; children: ReactNode }) {
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

