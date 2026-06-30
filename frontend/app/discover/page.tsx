"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";
import { BottomNav } from "../components/bottom-nav";

const FEATURES = [
  { title: "Group Send", desc: "Pool money with others for a shared payout.", href: "/group-send" },
  { title: "Savings", desc: "Earn yield on idle balances.", href: "/savings" },
  { title: "Send Crypto", desc: "Send USDC/SUI to any wallet.", href: "/send-crypto" },
  { title: "Receive", desc: "Share your QR code to get paid.", href: "/receive" },
];

export default function DiscoverPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-[#f7f2fa]">
        <ScreenHeader title="Discover" subtitle="Explore everything Cestra can do." />
        <div className="flex flex-1 flex-col gap-3 px-4 pt-6">
          {FEATURES.map((f) => (
            <button
              key={f.title}
              onClick={() => router.push(f.href)}
              className="flex items-center justify-between rounded-2xl bg-white p-4 text-left active:bg-[#eee8f3]"
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#0d1b2a]">{f.title}</span>
                <span className="text-xs text-[#667085]">{f.desc}</span>
              </div>
              <span className="text-[#007a6e]">›</span>
            </button>
          ))}
        </div>
        <BottomNav active="discover" />
      </div>
    </MobileFrame>
  );
}
