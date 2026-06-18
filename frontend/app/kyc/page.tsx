"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../lib/auth";
import { initiateKyc, ApiError } from "../lib/api";

type KycStatus = "idle" | "loading" | "error" | "redirecting";

export default function KycPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<KycStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleStartKyc = async () => {
    if (!isAuthenticated) {
      router.push("/get-started");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await initiateKyc(1);
      setStatus("redirecting");
      // Redirect to Persona hosted verification
      window.location.href = response.session_url;
    } catch (error) {
      setStatus("error");
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to start verification. Please try again.");
      }
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="size-8 animate-spin rounded-full border-2 border-[#007a6e] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-xl bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-[77px]">
          <button
            onClick={() => router.back()}
            className="flex size-6 items-center justify-center"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="font-sans text-base font-semibold text-[#0d1b2a]">
            Identity Verification
          </span>
          <span className="text-xs text-[#667085]">KYC</span>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-8 px-4 pt-16">
          {/* Icon + title */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-[#e0f4f2]">
              <Image
                src="/icon-shield.svg"
                alt=""
                width={32}
                height={32}
                className="size-8"
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h1 className="font-sans text-2xl font-bold text-[#0d1b2a]">
                Verify Your Identity
              </h1>
              <p className="max-w-[320px] text-center text-sm text-[#667085]">
                Complete a quick identity check to unlock full access to sending
                and receiving money.
              </p>
            </div>
          </div>

          {/* Tier info */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[#0d1b2a]">
              What you&apos;ll need:
            </h2>
            <div className="flex flex-col gap-2">
              {[
                { icon: "📧", text: "Valid email address" },
                { icon: "📱", text: "Phone number (already verified)" },
                { icon: "🪪", text: "Government-issued ID (Tier 2)" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-[#0d1b2a]">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tier benefits */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[#0d1b2a]">
              Verification Tiers:
            </h2>
            <div className="flex flex-col gap-2">
              {[
                {
                  tier: "Tier 1",
                  desc: "Email verification — Send up to $500/day",
                  active: true,
                },
                {
                  tier: "Tier 2",
                  desc: "Government ID — Send up to $5,000/day",
                  active: false,
                },
                {
                  tier: "Tier 3",
                  desc: "Enhanced check — Unlimited transfers",
                  active: false,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    item.active
                      ? "border border-[#007a6e] bg-[#e0f4f2]"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="flex flex-col">
                    <span
                      className={`text-sm font-semibold ${item.active ? "text-[#007a6e]" : "text-[#0d1b2a]"}`}
                    >
                      {item.tier}
                    </span>
                    <span className="text-xs text-[#667085]">{item.desc}</span>
                  </div>
                  {item.active && (
                    <span className="text-xs font-medium text-[#007a6e]">
                      Start here →
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Error message */}
          {status === "error" && (
            <div className="rounded-xl bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          {/* CTA */}
          <div className="mt-auto pb-8">
            <button
              onClick={handleStartKyc}
              disabled={status === "loading" || status === "redirecting"}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-3xl bg-[#007a6e] disabled:opacity-60"
            >
              {status === "loading" || status === "redirecting" ? (
                <div className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span className="text-sm font-semibold text-white">
                    Begin Verification
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
            {status === "redirecting" && (
              <p className="mt-2 text-center text-xs text-[#667085]">
                Redirecting to verification partner...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
