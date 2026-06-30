"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import {
  getWalletBalance,
  getTransactions,
  type WalletBalance,
  type Transaction,
} from "../lib/api";
import { splitUsd, formatUsd, formatTxDate } from "../lib/format";
import { MobileFrame } from "../components/mobile-frame";
import { BottomNav } from "../components/bottom-nav";

const QUICK_ACTIONS = [
  { label: "Send", href: "/send", icon: ArrowUpRight },
  { label: "Receive", href: "/receive", icon: ArrowDown },
  { label: "Deposit", href: "/deposit", icon: Plus },
  { label: "Scan", href: "/scan", icon: ScanIcon },
];

const SECONDARY_ACTIONS = [
  { label: "Group Send", href: "/group-send", icon: UsersIcon },
  { label: "Savings", href: "/savings", icon: TargetIcon },
  { label: "Send Crypto", href: "/send-crypto", icon: CoinsIcon },
];

export default function DashboardPage() {
  const { isAuthenticated, isLoading: authLoading, walletAddress } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [hideBalance, setHideBalance] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/get-started");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const [bal, txList] = await Promise.all([
          getWalletBalance().catch(() => null),
          getTransactions(1, 5).catch(() => ({ data: [], total: 0, page: 1, limit: 5 })),
        ]);
        setBalance(
          bal ?? { balance_usdsui: 0, yield_balance: 0, yield_enabled: false, apy: 13.4 }
        );
        setTxs(txList.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated]);

  if (authLoading || loading) {
    return (
      <MobileFrame>
        <div className="flex h-full items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-[#007a6e] border-t-transparent" />
        </div>
      </MobileFrame>
    );
  }

  if (!isAuthenticated) return null;

  const total = balance?.balance_usdsui ?? 0;
  const { whole, fraction } = splitUsd(total);

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-[#f7f2fa]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-16">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-[#007a6e] text-sm font-bold text-white">
              {(walletAddress ?? "C").slice(2, 4).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-[#667085]">Welcome Back</span>
              <span className="text-base font-semibold text-[#0d1b2a]">Hi there</span>
            </div>
          </div>
          <button
            aria-label="Notifications"
            className="flex size-10 items-center justify-center rounded-full bg-white"
          >
            <BellIcon className="size-5 text-[#0d1b2a]" />
          </button>
        </div>

        {/* Balance card */}
        <div className="mx-4 mt-6 rounded-3xl bg-[#007a6e] p-5 text-white">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setHideBalance((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-white/80"
            >
              Total Balance
              <EyeSlashIcon className="size-3" />
            </button>
            <span className="font-mono text-xs text-white/60">
              {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "—"}
            </span>
          </div>
          <div className="mt-3 flex items-end gap-0.5">
            <span className="text-2xl font-bold">$</span>
            <span className="text-4xl font-bold leading-none">
              {hideBalance ? "••••" : whole}
            </span>
            <span className="text-2xl font-bold">
              {hideBalance ? "" : `.${fraction}`}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-200">
            <TriangleUp className="size-3" />
            {(balance?.apy ?? 0).toFixed(1)}% APY
          </div>

          {/* Quick actions */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => router.push(a.href)}
                className="flex flex-col items-center gap-2"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
                  <a.icon className="size-5 text-white" />
                </span>
                <span className="text-[11px] text-white">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Secondary actions */}
        <div className="mx-4 mt-4 grid grid-cols-3 gap-2 rounded-3xl bg-white p-4">
          {SECONDARY_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => router.push(a.href)}
              className="flex flex-col items-center gap-2"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[#e0f4f2]">
                <a.icon className="size-5 text-[#007a6e]" />
              </span>
              <span className="text-[11px] text-[#0d1b2a]">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Transaction history */}
        <div className="mx-4 mt-4 flex flex-1 flex-col overflow-hidden rounded-3xl bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0d1b2a]">Transaction History</h2>
            <button
              onClick={() => router.push("/transactions")}
              className="text-xs font-medium text-[#007a6e]"
            >
              See All
            </button>
          </div>
          <div className="mt-3 flex-1 overflow-y-auto">
            {txs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
                <span className="text-3xl">💸</span>
                <p className="text-sm font-medium text-[#0d1b2a]">No transactions yet</p>
                <p className="text-xs text-[#667085]">
                  Fund your wallet or send money to get started.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {txs.map((tx) => {
                  const { time, date } = formatTxDate(tx.created_at);
                  const outgoing = tx.type === "sent";
                  return (
                    <li key={tx.id} className="flex items-center gap-3">
                      <span
                        className={`flex size-9 items-center justify-center rounded-full ${
                          outgoing ? "bg-red-50" : "bg-emerald-50"
                        }`}
                      >
                        {outgoing ? (
                          <ArrowUpRight className="size-4 text-red-500" />
                        ) : (
                          <ArrowDown className="size-4 text-emerald-600" />
                        )}
                      </span>
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-medium capitalize text-[#0d1b2a]">
                          {tx.type}
                        </span>
                        <span className="text-[11px] text-[#667085]">
                          {time} · {date}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span
                          className={`text-sm font-semibold ${
                            outgoing ? "text-[#0d1b2a]" : "text-emerald-600"
                          }`}
                        >
                          {outgoing ? "-" : "+"}
                          {formatUsd(tx.amount)}
                        </span>
                        <span className="text-[10px] capitalize text-[#667085]">
                          {tx.status.toLowerCase()}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <BottomNav active="wallet" />
      </div>
    </MobileFrame>
  );
}

/* ── Inline icons (stroke-based, 24px viewBox) ──────────────────────────── */
type IconProps = { className?: string };

function ArrowUpRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}
function ArrowDown({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}
function Plus({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function ScanIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
function UsersIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function TargetIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function CoinsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="M16.71 13.88l.7.71-2.82 2.82" />
    </svg>
  );
}
function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function EyeSlashIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function TriangleUp({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 6l7 12H5z" />
    </svg>
  );
}
