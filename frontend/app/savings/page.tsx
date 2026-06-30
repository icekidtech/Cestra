"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import {
  getWalletBalance,
  enableYield,
  withdrawYield,
  type WalletBalance,
  ApiError,
} from "../lib/api";
import { formatUsd } from "../lib/format";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";
import { PrimaryButton } from "../components/primary-button";
import { BottomNav } from "../components/bottom-nav";

export default function SavingsPage() {
  const { isAuthenticated, isLoading, walletAddress } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [modal, setModal] = useState<"add" | "withdraw" | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  const load = () =>
    getWalletBalance()
      .then(setBalance)
      .catch(() =>
        setBalance({ balance_usdsui: 0, yield_balance: 0, yield_enabled: false, apy: 13.4 })
      );

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated]);

  const submit = async () => {
    if (modal === "withdraw") {
      const value = parseFloat(amount);
      if (!value || value <= 0) return;
      setBusy(true);
      setError("");
      try {
        await withdrawYield(value);
        setModal(null);
        setAmount("");
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Withdrawal failed. Try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // "add" → enable the yield wallet (risk acknowledged)
    setBusy(true);
    setError("");
    try {
      await enableYield();
      setModal(null);
      setAmount("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not enable savings. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const saved = balance?.yield_balance ?? 0;
  const apy = balance?.apy ?? 13.4;

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-[#f7f2fa]">
        <ScreenHeader title="Savings" onBack={() => router.push("/home")} />

        {/* Total savings ring */}
        <div className="mt-4 flex flex-col items-center gap-2 px-4">
          <div className="flex size-48 flex-col items-center justify-center rounded-full border-[10px] border-[#007a6e]/15 bg-white">
            <span className="text-xs text-[#667085]">Total Savings</span>
            <span className="text-3xl font-bold text-[#0d1b2a]">{formatUsd(saved)}</span>
            <span className="mt-1 flex items-center gap-1 text-xs text-[#007a6e]">
              ▲ {apy.toFixed(1)}% APY
            </span>
          </div>
        </div>

        {/* Add / Withdraw */}
        <div className="mx-4 mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => setModal("add")}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white py-4"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-[#e0f4f2] text-[#007a6e]">+</span>
            <span className="text-sm font-medium text-[#0d1b2a]">Add Funds</span>
          </button>
          <button
            onClick={() => setModal("withdraw")}
            className="flex flex-col items-center gap-2 rounded-2xl bg-white py-4"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-[#e0f4f2] text-[#007a6e]">↗</span>
            <span className="text-sm font-medium text-[#0d1b2a]">Withdraw</span>
          </button>
        </div>

        <div className="mx-4 mt-6 flex-1 rounded-3xl bg-white p-4">
          <h2 className="text-sm font-semibold text-[#0d1b2a]">How it works</h2>
          <p className="mt-2 text-xs leading-relaxed text-[#667085]">
            Funds you add to Savings earn yield via Cestra&apos;s on-chain vault. Your
            balance updates as interest accrues, and you can withdraw anytime.
          </p>
        </div>

        <BottomNav active="earn" />

        {modal && (
          <div className="absolute inset-0 flex items-end bg-black/40">
            <div className="w-full rounded-t-3xl bg-white p-5 pb-8">
              <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-black/10" />
              <h3 className="text-lg font-semibold text-[#0d1b2a]">
                {modal === "add" ? "Enable Savings" : "Withdraw Savings"}
              </h3>

              {modal === "add" ? (
                <p className="mt-3 text-sm leading-relaxed text-[#667085]">
                  Enable the Cestra yield wallet to earn{" "}
                  <span className="font-semibold text-[#007a6e]">
                    {apy.toFixed(1)}% APY
                  </span>{" "}
                  on your idle balance via on-chain lending. You can withdraw
                  anytime. By continuing you acknowledge the risk disclosure.
                </p>
              ) : (
                <input
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="mt-4 h-14 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-2xl font-bold outline-none focus:border-[#007a6e]"
                />
              )}

              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setModal(null);
                    setError("");
                  }}
                  className="h-12 flex-1 rounded-2xl border border-black/10 text-sm font-semibold text-[#0d1b2a]"
                >
                  Cancel
                </button>
                <div className="flex-1">
                  <PrimaryButton onClick={submit} loading={busy}>
                    {modal === "add" ? "Enable" : "Withdraw"}
                  </PrimaryButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
