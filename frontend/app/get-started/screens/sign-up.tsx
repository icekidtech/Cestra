"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../../lib/auth";
import { startGoogleLogin, isGoogleConfigured } from "../../lib/zklogin";

export default function SignUpScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);

  const handleGoogle = async () => {
    setError("");
    // Real zkLogin: redirect to Google for a signed id_token. The /auth/callback
    // page completes the login against the backend and routes to /home.
    if (isGoogleConfigured()) {
      setLoading("google");
      try {
        startGoogleLogin();
      } catch (e) {
        setLoading(null);
        setError(e instanceof Error ? e.message : "Could not start Google sign-in");
      }
      return;
    }

    // Dev fallback — no Google client configured. Creates a real session
    // (JWT + wallet) against the backend, then goes straight to the dashboard.
    setLoading("google");
    try {
      const payload = {
        wallet_address: "0x" + "a1b2c3d4e5f6".repeat(5).slice(0, 40),
        provider: "google",
      };
      await login(btoa(JSON.stringify(payload)), "google");
      router.replace("/home");
    } catch (e) {
      setError(
        e instanceof Error
          ? `Sign-in failed: ${e.message}`
          : "Sign-in failed. Is the backend running?",
      );
    } finally {
      setLoading(null);
    }
  };

  const handleApple = async () => {
    setError("");
    setLoading("apple");
    try {
      const payload = {
        wallet_address: "0x" + "f6e5d4c3b2a1".repeat(5).slice(0, 40),
        provider: "apple",
      };
      await login(btoa(JSON.stringify(payload)), "apple");
      router.replace("/home");
    } catch (e) {
      setError(
        e instanceof Error
          ? `Sign-in failed: ${e.message}`
          : "Sign-in failed. Is the backend running?",
      );
    } finally {
      setLoading(null);
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
                onClick={handleGoogle}
                disabled={loading !== null}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-3xl bg-[#007a6e] p-2.5 disabled:opacity-60"
              >
                {loading === "google" ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
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
                  </>
                )}
              </button>

              <button
                onClick={handleApple}
                disabled={loading !== null}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-3xl border border-[rgba(13,27,42,0.5)] bg-white p-2.5 disabled:opacity-60"
              >
                {loading === "apple" ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-[#0d1b2a] border-t-transparent" />
                ) : (
                  <>
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
                  </>
                )}
              </button>
            </div>

            {error && (
              <p className="text-center text-xs text-red-600">{error}</p>
            )}

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
            <a href="/sign-in" className="font-semibold text-[#007a6e]">
              Sign in
            </a>
          </p>

          {/* Trust badges */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-3xl bg-[#e0f4f2] px-3 py-2">
              <Image src="/icon-shield.svg" alt="" width={16} height={16} className="size-4" />
              <span className="text-xs font-medium text-[#003d38]">Secure</span>
            </div>
            <div className="flex items-center gap-2 rounded-3xl bg-[#e0f4f2] px-3 py-2">
              <Image src="/icon-lock.svg" alt="" width={16} height={16} className="size-4" />
              <span className="text-xs font-medium text-[#003d38]">Encrypted</span>
            </div>
            <div className="flex items-center gap-2 rounded-3xl bg-[#e0f4f2] px-3 py-2">
              <Image src="/icon-zap.svg" alt="" width={16} height={16} className="size-4" />
              <span className="text-xs font-medium text-[#003d38]">Instant</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
