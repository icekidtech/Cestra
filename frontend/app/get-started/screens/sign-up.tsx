"use client";

import Image from "next/image";
import { useAuth } from "../../lib/auth";

interface SignUpScreenProps {
  onNext: () => void;
}

export default function SignUpScreen({ onNext }: SignUpScreenProps) {
  const { login } = useAuth();

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      // In production: trigger zkLogin OAuth flow with Sui SDK
      // For now: create a dummy zkLogin token for development
      const dummyPayload = {
        wallet_address: "0x" + "a1b2c3d4e5f6".repeat(5).slice(0, 40),
        provider,
      };
      const zkloginToken = btoa(JSON.stringify(dummyPayload));

      await login(zkloginToken, provider);
      onNext();
    } catch (error) {
      // If backend is not running, still allow navigation for UI development
      console.warn("Auth API unavailable, proceeding in demo mode:", error);
      onNext();
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-[#007a6e]">
      {/* Header section - teal background */}
      <div className="flex flex-col items-center gap-2 px-4 pt-24">
        <div className="flex items-end justify-center gap-1">
          <Image
            src="/cestra-logo.png"
            alt="Cestra"
            width={48}
            height={48}
            className="size-12"
          />
          <span className="font-sans text-[28px] font-bold leading-9 text-white">
            Cestra
          </span>
        </div>
        <p className="text-sm font-normal text-white">
          Send money anywhere, instantly
        </p>
        <div className="mt-1 flex items-center gap-1 rounded-3xl border border-white/25 bg-white/20 px-3 py-1">
          <Image
            src="/icon-shield-white.svg"
            alt=""
            width={16}
            height={16}
            className="size-4"
          />
          <span className="text-xs font-medium text-white/90">
            Trusted by 2M+ users
          </span>
        </div>
      </div>

      {/* Bottom card */}
      <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-[#f7f2fa] px-4 pb-10 pt-[72px]">
        <div className="flex flex-col items-center gap-8">
          {/* Title */}
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="font-sans text-2xl font-bold text-[#0d1b2a]">
              Create your account
            </h1>
            <p className="text-sm font-normal text-[#667085]">
              Join millions sending money globally
            </p>
          </div>

          {/* OAuth buttons */}
          <div className="flex w-full flex-col gap-4">
            <div className="flex w-full flex-col gap-3">
              <button
                onClick={() => handleOAuth("google")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-3xl bg-[#007a6e] p-2.5"
              >
                <Image
                  src="/icon-google.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
                <span className="text-base font-semibold text-white">
                  Sign up with Google
                </span>
              </button>

              <button
                onClick={() => handleOAuth("apple")}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-3xl border border-[rgba(13,27,42,0.5)] bg-white p-2.5"
              >
                <Image
                  src="/icon-apple.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
                <span className="text-base font-semibold text-[#0d1b2a]">
                  Sign up with Apple
                </span>
              </button>
            </div>

            <p className="text-center text-xs text-[#667085]">
              By continuing, you agree to our{" "}
              <span className="font-medium underline">Terms</span> and{" "}
              <span className="font-medium underline">Privacy Policy</span>
            </p>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-[#667085]/30" />
              <span className="text-xs text-[#667085]">OR</span>
              <div className="h-px flex-1 bg-[#667085]/30" />
            </div>
          </div>

          {/* Sign in link */}
          <p className="text-center text-sm">
            <span className="text-[rgba(13,27,42,0.8)]">
              Already have an account?{" "}
            </span>
            <button className="font-semibold text-[#007a6e]">Sign in</button>
          </p>

          {/* Trust badges */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-3xl bg-[#e0f4f2] px-3 py-2">
              <Image
                src="/icon-shield.svg"
                alt=""
                width={16}
                height={16}
                className="size-4"
              />
              <span className="text-xs font-medium text-[#003d38]">
                Secure
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-3xl bg-[#e0f4f2] px-3 py-2">
              <Image
                src="/icon-lock.svg"
                alt=""
                width={16}
                height={16}
                className="size-4"
              />
              <span className="text-xs font-medium text-[#003d38]">
                Encrypted
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-3xl bg-[#e0f4f2] px-3 py-2">
              <Image
                src="/icon-zap.svg"
                alt=""
                width={16}
                height={16}
                className="size-4"
              />
              <span className="text-xs font-medium text-[#003d38]">
                Instant
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
