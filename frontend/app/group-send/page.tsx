"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { formatUsd } from "../lib/format";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";
import { PrimaryButton } from "../components/primary-button";

type Step = "details" | "result";

export default function GroupSendPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [groupCode, setGroupCode] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  const valid = name.trim() && parseFloat(amount) > 0 && recipient.trim();

  const create = () => {
    // Group code is generated client-side for the share flow; the on-chain pool
    // is created via POST /v1/pool/create once contributors join.
    setGroupCode(Math.random().toString(36).slice(2, 9).toUpperCase());
    setStep("result");
  };

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        {step === "details" ? (
          <>
            <ScreenHeader
              title="Create Group Send"
              subtitle="Create a group contributing toward a common payout."
              onBack={() => router.push("/home")}
            />
            <div className="flex flex-1 flex-col gap-4 px-4 pt-6">
              <Field label="Group name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mum's birthday"
                  className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
                />
              </Field>
              <Field label="Target amount (USD)">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
                />
              </Field>
              <Field label="Recipient">
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Recipient name or address"
                  className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
                />
              </Field>
            </div>
            <div className="px-4 pb-10">
              <PrimaryButton onClick={create} disabled={!valid}>
                Create Group
              </PrimaryButton>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-[#e0f4f2] text-3xl font-bold text-[#007a6e]">
              ✓
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-[#0d1b2a]">Group Created</h1>
              <p className="text-sm text-[#667085]">
                {name} · {formatUsd(parseFloat(amount) || 0)}
              </p>
              <p className="mt-2 text-xs text-[#667085]">Share this code to invite contributors</p>
              <p className="text-2xl font-bold tracking-widest text-[#007a6e]">{groupCode}</p>
            </div>
            <div className="absolute inset-x-0 bottom-10 flex gap-3 px-4">
              <button
                onClick={() => navigator.clipboard?.writeText(groupCode)}
                className="h-12 flex-1 rounded-2xl border border-black/10 text-sm font-semibold text-[#0d1b2a]"
              >
                Copy Code
              </button>
              <div className="flex-1">
                <PrimaryButton onClick={() => router.push("/home")}>Return Home</PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[#667085]">{label}</span>
      {children}
    </label>
  );
}
