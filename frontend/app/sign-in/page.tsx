"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../lib/auth";
import { startGoogleLogin, isGoogleConfigured } from "../lib/zklogin";
import { MobileFrame } from "../components/mobile-frame";

export default function SignInPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/home");
  }, [isLoading, isAuthenticated, router]);

  const handleGoogle = async () => {
    setError("");
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
    // Dev fallback
    setLoading("google");
    try {
      const payload = {
        wallet_address: "0x" + "a1b2c3d4e5f6".repeat(5).slice(0, 40),
        provider: "google",
      };
      await login(btoa(JSON.stringify(payload)), "google");
      router.replace("/home");
    } catch {
      router.replace("/home");
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
    } catch {
      router.replace("/home");
    } finally {
      setLoading(null);
    }
  };

  return (
    <MobileFrame>
      <div className="relative flex h-full w-full flex-col bg-[#007a6e]">
        <div className="flex flex-col items-center gap-2 px-4 pt-24">
          <div className="flex items-end justify-center gap-1">
            <Image src="/cestra-logo.png" alt="Cestra" width={48} height={48} className="size-12" />
            <span className="font-sans text-[28px] font-bold leading-9 text-white">Cestra</span>
          </div>
          <p className="text-sm text-white">Welcome back</p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-[#f7f2fa] px-4 pb-10 pt-[72px]">
          <div className="flex flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-1 text-center">
              <h1 className="font-sans text-2xl font-bold text-[#0d1b2a]">Sign in to Cestra</h1>
              <p className="text-sm text-[#667085]">Use the account you signed up with</p>
            </div>

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
                    <Image src="/icon-google.svg" alt="" width={24} height={24} className="size-6" />
                    <span className="text-base font-semibold text-white">Continue with Google</span>
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
                    <Image src="/icon-apple.svg" alt="" width={24} height={24} className="size-6" />
                    <span className="text-base font-semibold text-[#0d1b2a]">Continue with Apple</span>
                  </>
                )}
              </button>
            </div>

            {error && <p className="text-center text-xs text-red-600">{error}</p>}

            <p className="text-center text-sm">
              <span className="text-[rgba(13,27,42,0.8)]">New to Cestra? </span>
              <a href="/get-started" className="font-semibold text-[#007a6e]">Create an account</a>
            </p>
          </div>
        </div>
      </div>
    </MobileFrame>
  );
}
