"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";

export default function ScanPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        <ScreenHeader title="Scan QR Code" onBack={() => router.push("/home")} />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          {/* Viewfinder */}
          <div className="relative size-64 rounded-3xl border border-black/10 bg-[#f7f2fa]">
            <Corner className="left-3 top-3" />
            <Corner className="right-3 top-3 rotate-90" />
            <Corner className="bottom-3 left-3 -rotate-90" />
            <Corner className="bottom-3 right-3 rotate-180" />
          </div>
          <p className="text-sm text-[#667085]">Scan the QR code to make payment</p>
          <p className="text-xs text-[#9aa0ab]">
            Camera access is required on a real device.
          </p>
        </div>
      </div>
    </MobileFrame>
  );
}

function Corner({ className }: { className?: string }) {
  return (
    <span
      className={`absolute size-8 border-l-2 border-t-2 border-[#007a6e] ${className}`}
    />
  );
}
