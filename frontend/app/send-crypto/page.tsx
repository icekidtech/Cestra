"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { formatUsd } from "../lib/format";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";
import { PrimaryButton } from "../components/primary-button";
import { BottomNav } from "../components/bottom-nav";

type Step = "form" | "confirm" | "result";
const ASSETS = ["USDC", "SUI", "USDT"];

export default function SendCryptoPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [asset, setAsset] = useState("USDC");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  const value = parseFloat(amount) || 0;
  const valid = address.startsWith("0x") && address.length >= 10 && value > 0;

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        {step === "form" && (
          <>
            <ScreenHeader
              title="Send Crypto"
              subtitle="Send stablecoins or SUI to any wallet address."
              onBack={() => router.push("/home")}
            />
            <div className="flex flex-1 flex-col gap-4 px-4 pt-6">
              <div className="flex gap-2">
                {ASSETS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAsset(a)}
                    className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold ${
                      asset === a
                        ? "bg-[#007a6e] text-white"
                        : "bg-[#f7f2fa] text-[#0d1b2a]"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value.trim())}
                placeholder="Recipient wallet address (0x…)"
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
              />
              <div className="flex flex-col items-center gap-1 py-6">
                <span className="text-xs text-[#667085]">Enter an amount</span>
                <div className="flex items-end gap-1">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0"
                    className="w-36 bg-transparent text-center text-5xl font-bold text-[#0d1b2a] outline-none"
                  />
                  <span className="mb-2 text-lg font-semibold text-[#667085]">{asset}</span>
                </div>
              </div>
            </div>
            <div className="px-4 pb-10">
              <PrimaryButton onClick={() => setStep("confirm")} disabled={!valid}>
                Proceed
              </PrimaryButton>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <ScreenHeader title="Confirm Details" onBack={() => setStep("form")} />
            <div className="flex flex-1 flex-col gap-3 px-4 pt-6">
              <Row label="Asset" value={asset} />
              <Row label="To" value={`${address.slice(0, 8)}…${address.slice(-6)}`} />
              <div className="my-2 h-px bg-black/5" />
              <Row label="You send" value={`${value} ${asset}`} strong />
            </div>
            <div className="px-4 pb-10">
              <PrimaryButton onClick={() => setStep("result")}>Send</PrimaryButton>
            </div>
          </>
        )}

        {step === "result" && (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-[#e0f4f2] text-3xl font-bold text-[#007a6e]">
              ✓
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-[#0d1b2a]">Sent</h1>
              <p className="text-sm text-[#667085]">
                {value} {asset} to {address.slice(0, 8)}…{address.slice(-6)}
              </p>
            </div>
            <div className="absolute inset-x-0 bottom-10 px-4">
              <PrimaryButton onClick={() => router.push("/home")}>Return Home</PrimaryButton>
            </div>
          </div>
        )}

        {step === "form" && <BottomNav active="swap" />}
      </div>
    </MobileFrame>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#667085]">{label}</span>
      <span className={`text-sm ${strong ? "font-bold" : "font-medium"} text-[#0d1b2a]`}>{value}</span>
    </div>
  );
}
