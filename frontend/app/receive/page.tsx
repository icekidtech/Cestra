"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { shortenAddress } from "../lib/format";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";

export default function ReceivePage() {
  const { isAuthenticated, isLoading, walletAddress } = useAuth();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  const copy = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        <ScreenHeader
          title="Receive Payment"
          subtitle="Have the sender scan the QR code or copy your account number."
          onBack={() => router.push("/home")}
        />

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          {/* QR placeholder */}
          <div className="relative flex size-64 items-center justify-center rounded-3xl border border-black/10 bg-[#f7f2fa]">
            <QrPattern address={walletAddress ?? ""} />
            <span className="absolute flex size-12 items-center justify-center rounded-xl bg-[#007a6e] text-xs font-bold text-white">
              C
            </span>
          </div>
          <p className="text-sm text-[#667085]">Scan the QR code to make payment</p>
        </div>

        {/* Account info */}
        <div className="mx-4 mb-10 rounded-3xl bg-[#f7f2fa] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#667085]">Wallet Address</span>
            <button onClick={copy} className="flex items-center gap-1.5 text-sm font-medium text-[#0d1b2a]">
              {shortenAddress(walletAddress)}
              <CopyIcon className="size-4 text-[#007a6e]" />
            </button>
          </div>
          {copied && <p className="mt-2 text-right text-xs text-[#007a6e]">Copied!</p>}
        </div>
      </div>
    </MobileFrame>
  );
}

function QrPattern({ address }: { address: string }) {
  // Deterministic pseudo-QR grid derived from the address (visual placeholder).
  const seed = address.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const cells = Array.from({ length: 121 }, (_, i) => ((seed >> (i % 16)) ^ i) % 3 === 0);
  return (
    <div className="grid size-48 grid-cols-11 gap-0.5">
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-[#0d1b2a]" : "bg-transparent"} />
      ))}
    </div>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
