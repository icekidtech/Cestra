"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";

const OPTIONS = [
  {
    id: "local",
    title: "Local Bank Transfer",
    desc: "Deposit into your Cestra account through a local bank transfer.",
    icon: BankIcon,
  },
  {
    id: "ach",
    title: "Bank Account (ACH)",
    desc: "Pull funds directly from your linked US bank account.",
    icon: MoneyIcon,
  },
  {
    id: "crypto",
    title: "Crypto Deposit",
    desc: "Deposit using stablecoins. Your balance updates in USD.",
    icon: CoinsIcon,
  },
];

export default function DepositPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        <ScreenHeader
          title="Deposit Money"
          subtitle="Select an option and follow the instructions to deposit money into your account."
          onBack={() => router.push("/home")}
        />
        <div className="flex flex-col gap-3 px-4 pt-6">
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => router.push(`/deposit/${opt.id}`)}
              className="flex items-center gap-4 rounded-2xl bg-[#f7f2fa] p-4 text-left active:bg-[#eee8f3]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e0f4f2]">
                <opt.icon className="size-5 text-[#007a6e]" />
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#0d1b2a]">{opt.title}</span>
                <span className="text-xs text-[#667085]">{opt.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </MobileFrame>
  );
}

type IconProps = { className?: string };
function BankIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7 12 2" />
    </svg>
  );
}
function MoneyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function CoinsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    </svg>
  );
}
