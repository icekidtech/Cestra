"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth";
import { parseGoogleCallback } from "../../lib/zklogin";
import { MobileFrame } from "../../components/mobile-frame";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const { idToken, error: cbError } = parseGoogleCallback();
      if (cbError || !idToken) {
        setError(cbError || "Google sign-in failed");
        return;
      }

      try {
        // The backend verifies the Google id_token signature and derives the
        // deterministic zkLogin Sui address.
        await login(idToken, "google");
        router.replace("/home");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not complete sign-in",
        );
      }
    })();
  }, [login, router]);

  return (
    <MobileFrame>
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        {error ? (
          <>
            <span className="flex size-16 items-center justify-center rounded-full bg-red-50 text-2xl text-red-500">
              ✕
            </span>
            <h1 className="text-xl font-bold text-[#0d1b2a]">Sign-in failed</h1>
            <p className="text-sm text-[#667085]">{error}</p>
            <button
              onClick={() => router.replace("/get-started")}
              className="mt-2 rounded-2xl bg-[#007a6e] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="size-8 animate-spin rounded-full border-2 border-[#007a6e] border-t-transparent" />
            <p className="text-sm text-[#667085]">Completing secure sign-in…</p>
          </>
        )}
      </div>
    </MobileFrame>
  );
}
