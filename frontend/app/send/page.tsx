"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import {
  getRecipients,
  createRecipient,
  createSend,
  type Recipient,
  ApiError,
} from "../lib/api";
import { formatUsd } from "../lib/format";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";
import { PrimaryButton } from "../components/primary-button";

type Step = "recipient" | "amount" | "confirm" | "result";
const FEE_RATE = 0.008;

export default function SendPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("recipient");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "pending" | "failed" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/get-started");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    getRecipients()
      .then(setRecipients)
      .catch(() => setRecipients([]));
  }, [isAuthenticated]);

  const numericAmount = parseFloat(amount) || 0;
  const fee = numericAmount * FEE_RATE;
  const total = numericAmount + fee;

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await createSend(
        {
          amount: numericAmount,
          recipient_id: selected.id,
          corridor: selected.country || "NG",
        },
        crypto.randomUUID()
      );
      setResult(res.status === "COMPLETED" ? "success" : "pending");
      setStep("result");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Something went wrong. Please try again.");
      setResult("failed");
      setStep("result");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        {step === "recipient" && (
          <RecipientStep
            recipients={recipients}
            onBack={() => router.push("/home")}
            onRefresh={() =>
              getRecipients().then(setRecipients).catch(() => {})
            }
            onSelect={(r) => {
              setSelected(r);
              setStep("amount");
            }}
          />
        )}

        {step === "amount" && selected && (
          <AmountStep
            recipient={selected}
            amount={amount}
            onAmount={setAmount}
            onBack={() => setStep("recipient")}
            onNext={() => setStep("confirm")}
          />
        )}

        {step === "confirm" && selected && (
          <ConfirmStep
            recipient={selected}
            amount={numericAmount}
            fee={fee}
            total={total}
            submitting={submitting}
            onBack={() => setStep("amount")}
            onConfirm={handleSubmit}
          />
        )}

        {step === "result" && (
          <ResultStep
            result={result!}
            amount={numericAmount}
            recipientName={selected?.name ?? ""}
            error={error}
            onDone={() => router.push("/home")}
          />
        )}
      </div>
    </MobileFrame>
  );
}

/* ── Step 1: Select / add recipient ─────────────────────────────────────── */
function RecipientStep({
  recipients,
  onBack,
  onSelect,
  onRefresh,
}: {
  recipients: Recipient[];
  onBack: () => void;
  onSelect: (r: Recipient) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    country: "NG",
    mobile_money_type: "bank",
    account_number: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = recipients.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase())
  );

  const submit = async () => {
    if (!form.name.trim() || !form.account_number.trim()) {
      setError("Name and account number are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createRecipient(form);
      onRefresh();
      onSelect(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add recipient.");
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <>
        <ScreenHeader
          title="Add Recipient"
          subtitle="Enter the recipient's payout details."
          onBack={() => setAdding(false)}
        />
        <div className="flex flex-1 flex-col gap-4 px-4 pt-6">
          <Field label="Full name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Jane Doe"
              className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
            />
          </Field>
          <Field label="Country (ISO code)">
            <input
              value={form.country}
              onChange={(e) =>
                setForm({ ...form, country: e.target.value.toUpperCase().slice(0, 2) })
              }
              placeholder="NG"
              className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
            />
          </Field>
          <Field label="Payout method">
            <select
              value={form.mobile_money_type}
              onChange={(e) =>
                setForm({ ...form, mobile_money_type: e.target.value })
              }
              className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
            >
              <option value="bank">Bank Transfer</option>
              <option value="mpesa">M-Pesa</option>
              <option value="mtn">MTN MoMo</option>
              <option value="airtel">Airtel Money</option>
            </select>
          </Field>
          <Field label="Account number">
            <input
              value={form.account_number}
              onChange={(e) =>
                setForm({ ...form, account_number: e.target.value })
              }
              placeholder="0123456789"
              className="h-12 w-full rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
            />
          </Field>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-4 pb-10">
          <PrimaryButton onClick={submit} loading={saving}>
            Save & Continue
          </PrimaryButton>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Select Recipient"
        subtitle="Enter account information or select a recipient for this transaction."
        onBack={onBack}
        action={{ label: "+ Add", onClick: () => setAdding(true) }}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pt-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipients"
          className="h-12 rounded-2xl border border-black/10 bg-[#f7f2fa] px-4 text-sm outline-none focus:border-[#007a6e]"
        />
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm font-medium text-[#0d1b2a]">No recipients yet</p>
              <p className="text-xs text-[#667085]">
                Add someone to send money to.
              </p>
              <button
                onClick={() => setAdding(true)}
                className="mt-1 rounded-2xl bg-[#007a6e] px-5 py-2.5 text-sm font-semibold text-white"
              >
                + Add Recipient
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-[#f7f2fa] p-3 text-left active:bg-[#eee8f3]"
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#007a6e] text-sm font-bold text-white">
                      {r.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-medium text-[#0d1b2a]">{r.name}</span>
                      <span className="text-xs text-[#667085]">
                        {r.country} · {r.mobile_money_type} · {r.account_number}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Step 2: Enter amount ───────────────────────────────────────────────── */
function AmountStep({
  recipient,
  amount,
  onAmount,
  onBack,
  onNext,
}: {
  recipient: Recipient;
  amount: string;
  onAmount: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const valid = parseFloat(amount) > 0;
  return (
    <>
      <ScreenHeader title="Enter Amount" onBack={onBack} subtitle={`Sending to ${recipient.name}`} />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
        <span className="text-xs text-[#667085]">Enter an amount</span>
        <div className="flex items-end gap-1">
          <input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0"
            className="w-40 bg-transparent text-center text-5xl font-bold text-[#0d1b2a] outline-none"
          />
          <span className="mb-2 text-lg font-semibold text-[#667085]">USD</span>
        </div>
      </div>
      <div className="px-4 pb-10">
        <PrimaryButton onClick={onNext} disabled={!valid}>
          Proceed
        </PrimaryButton>
      </div>
    </>
  );
}

/* ── Step 3: Confirm ────────────────────────────────────────────────────── */
function ConfirmStep({
  recipient,
  amount,
  fee,
  total,
  submitting,
  onBack,
  onConfirm,
}: {
  recipient: Recipient;
  amount: number;
  fee: number;
  total: number;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <ScreenHeader title="Confirm Details" onBack={onBack} />
      <div className="flex flex-1 flex-col gap-3 px-4 pt-6">
        <Row label="Recipient" value={recipient.name} />
        <Row label="Country" value={recipient.country} />
        <Row label="Method" value={recipient.mobile_money_type} />
        <div className="my-2 h-px bg-black/5" />
        <Row label="You send" value={formatUsd(amount)} />
        <Row label="Fee (0.80%)" value={formatUsd(fee)} />
        <Row label="Total" value={formatUsd(total)} strong />
      </div>
      <div className="px-4 pb-10">
        <PrimaryButton onClick={onConfirm} loading={submitting}>
          Send {formatUsd(total)}
        </PrimaryButton>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#667085]">{label}</span>
      <span className={`text-sm ${strong ? "font-bold text-[#0d1b2a]" : "font-medium text-[#0d1b2a]"}`}>
        {value}
      </span>
    </div>
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

/* ── Step 4: Result ─────────────────────────────────────────────────────── */
function ResultStep({
  result,
  amount,
  recipientName,
  error,
  onDone,
}: {
  result: "success" | "pending" | "failed";
  amount: number;
  recipientName: string;
  error: string;
  onDone: () => void;
}) {
  const config = {
    success: { color: "#007a6e", bg: "#e0f4f2", title: "Payment Sent", icon: "✓" },
    pending: { color: "#b45309", bg: "#fef3c7", title: "Payment Pending", icon: "…" },
    failed: { color: "#dc2626", bg: "#fee2e2", title: "Payment Failed", icon: "✕" },
  }[result];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <span
        className="flex size-20 items-center justify-center rounded-full text-3xl font-bold"
        style={{ background: config.bg, color: config.color }}
      >
        {config.icon}
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-[#0d1b2a]">{config.title}</h1>
        <p className="text-sm text-[#667085]">
          {result === "failed"
            ? error || "Your transfer could not be completed."
            : `${formatUsd(amount)} to ${recipientName}`}
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-10 px-4">
        <PrimaryButton onClick={onDone}>Return Home</PrimaryButton>
      </div>
    </div>
  );
}
