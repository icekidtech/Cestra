"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../lib/auth";
import { getWalletBalance, type WalletBalance } from "../lib/api";

export default function HomePage() {
  const { isAuthenticated, isLoading: authLoading, walletAddress, logout } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/get-started");
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchBalance() {
      try {
        const data = await getWalletBalance();
        setBalance(data);
      } catch (err) {
        // If API is not available, show demo data
        console.warn("Wallet API unavailable, showing demo data:", err);
        setBalance({
          balance_usdsui: 0,
          yield_balance: 0,
          yield_enabled: false,
          apy: 4.0,
        });
        setError("Demo mode — backend not connected");
      } finally {
        setBalanceLoading(false);
      }
    }

    fetchBalance();
  }, [isAuthenticated]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="size-8 animate-spin rounded-full border-2 border-[#007a6e] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-xl bg-[#f7f2fa]">
        {/* Top section with teal gradient */}
        <div className="relative flex flex-col gap-6 bg-[#007a6e] px-4 pb-10 pt-16">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                src="/cestra-logo.png"
                alt="Cestra"
                width={32}
                height={32}
                className="size-8"
              />
              <span className="font-sans text-lg font-bold text-white">
                Cestra
              </span>
            </div>
            <button
              onClick={logout}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white"
            >
              Sign Out
            </button>
          </div>

          {/* Wallet address */}
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-green-400" />
            <span className="font-mono text-xs text-white/70">
              {walletAddress
                ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : "—"}
            </span>
          </div>

          {/* Balance card */}
          <div className="rounded-2xl bg-white/10 p-5 backdrop-blur-sm">
            <p className="text-xs font-medium text-white/70">Total Balance</p>
            {balanceLoading ? (
              <div className="mt-2 h-8 w-32 animate-pulse rounded bg-white/20" />
            ) : (
              <p className="mt-1 font-sans text-3xl font-bold text-white">
                ${balance?.balance_usdsui.toFixed(2) ?? "0.00"}
                <span className="ml-1 text-sm font-normal text-white/60">
                  USDSui
                </span>
              </p>
            )}

            {balance?.yield_enabled && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                <span className="text-xs text-white/70">Yield earning:</span>
                <span className="text-xs font-semibold text-green-300">
                  ${balance.yield_balance.toFixed(2)} ({balance.apy}% APY)
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-yellow-500/20 px-3 py-1.5">
              <p className="text-xs text-yellow-100">{error}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3 px-4 py-6">
          {[
            { label: "Send", icon: "↗" },
            { label: "Fund", icon: "↓" },
            { label: "History", icon: "📋" },
          ].map((action) => (
            <button
              key={action.label}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-5 shadow-sm"
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="text-xs font-medium text-[#0d1b2a]">
                {action.label}
              </span>
            </button>
          ))}
        </div>

        {/* KYC prompt */}
        <div className="px-4">
          <button
            onClick={() => router.push("/kyc")}
            className="flex w-full items-center gap-4 rounded-2xl border border-[#007a6e]/20 bg-[#e0f4f2] p-4"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#007a6e]">
              <Image
                src="/icon-shield-white.svg"
                alt=""
                width={20}
                height={20}
                className="size-5"
              />
            </div>
            <div className="flex flex-1 flex-col text-left">
              <span className="text-sm font-semibold text-[#0d1b2a]">
                Complete Verification
              </span>
              <span className="text-xs text-[#667085]">
                Verify your identity to unlock higher limits
              </span>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#007a6e"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Recent activity placeholder */}
        <div className="flex flex-1 flex-col gap-3 px-4 pt-6">
          <h2 className="text-sm font-semibold text-[#0d1b2a]">
            Recent Activity
          </h2>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-white p-8">
            <span className="text-3xl">💸</span>
            <p className="text-sm font-medium text-[#0d1b2a]">
              No transactions yet
            </p>
            <p className="text-center text-xs text-[#667085]">
              Start by funding your wallet or sending money to someone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
