"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";
import { devCreditWallet, ApiError } from "../../lib/api";
import { shortenAddress } from "../../lib/format";
import { MobileFrame } from "../../components/mobile-frame";
import { ScreenHeader } from "../../components/screen-header";
import { PrimaryButton } from "../../components/primary-button";

const META: Record<string, { title: string; subtitle: string }> = {
  local: {
    title: "Local Bank Transfer",
    subtitle: "Transfer to the account below; funds credit in USD once received.",
  },
  ach: {
    title: "Bank Account (ACH)",
    subtitle: "Pull funds from your linked US bank account.",
  },
  crypto: {
    title: "Crypto Deposit",
    subtitle: "Send USDC, USDT (TRC20) or SUI to your deposit address.",
  },
};

export default function DepositMethodPage({
  params,
}: {
  params: Promise<{ method: string }>;
}) {
  const { method } = use(params);
  const { isAuthenticated, isLoading, walletAddress } = useAuth();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  const meta = META[method] ?? META.local;

  const submitDeposit = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) return;
    setBusy(true);
    setError("");
    try {
      // Demo mode: instantly credit the wallet so the full app loop works.
      // Swap for real ACH/crypto rails when those integrations go live.
      await devCreditWallet(value);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Deposit failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        <ScreenHeader title={meta.title} subtitle={meta.subtitle} onBack={() => router.push("/deposit")} />

        <div className="flex flex-1 flex-col gap-4 px-4 pt-6">
          {done ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-20 items-center justify-center rounded-full bg-[#e0f4f2] text-3xl font-bold text-[#007a6e]">
                ✓
              </span>
              <h2 className="text-xl font-bold text-[#0d1b2a]">Deposit Successful</h2>
              <p className="text-sm text-[#667085]">
                Your balance has been credited.
              </p>
              <button
                onClick={() => router.push("/home")}
                className="mt-2 rounded-2xl bg-[#007a6e] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Back to Dashboard
              </button>
            </div>
          ) : method === "crypto" ? (
            <>
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-44 items-center justify-center rounded-3xl border border-black/10 bg-[#f7f2fa]">
                  <span className="px-6 text-center text-xs text-[#9aa0ab]">
                    QR for your deposit address
                  </span>
                </div>
                <p className="text-xs text-[#667085]">Send only USDC/USDT/SUI to this address</p>
              </div>
              <div className="rounded-2xl bg-[#f7f2fa] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#667085]">Deposit Address</span>
                  <button
                    onClick={() => walletAddress && navigator.clipboard?.writeText(walletAddress)}
                    className="text-sm font-medium text-[#007a6e]"
                  >
                    {shortenAddress(walletAddress)} · Copy
                  </button>
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[#667085]">
                  Amount received (USD)
                </span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
                />
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </>
          ) : (
            <>
              {method === "local" && (
                <div className="rounded-2xl bg-[#f7f2fa] p-4 text-sm">
                  <DetailRow label="Bank" value="Cestra Partner Bank" />
                  <DetailRow label="Account Name" value="Cestra Holdings" />
                  <DetailRow label="Account Number" value="0123456789" />
                  <DetailRow label="Reference" value={shortenAddress(walletAddress)} />
                </div>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[#667085]">Amount (USD)</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
                />
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </>
          )}
        </div>

        {!done && (
          <div className="px-4 pb-10">
            <PrimaryButton
              onClick={submitDeposit}
              disabled={!(parseFloat(amount) > 0)}
              loading={busy}
            >
              {method === "ach"
                ? "Deposit via ACH"
                : method === "crypto"
                  ? "Confirm Crypto Deposit"
                  : "I've Sent the Transfer"}
            </PrimaryButton>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[#667085]">{label}</span>
      <span className="font-medium text-[#0d1b2a]">{value}</span>
    </div>
  );
}
