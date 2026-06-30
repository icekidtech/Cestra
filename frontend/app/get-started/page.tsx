"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { MobileFrame } from "../components/mobile-frame";
import SignUpScreen from "./screens/sign-up";

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // Already signed in? Skip onboarding entirely.
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/home");
  }, [isLoading, isAuthenticated, router]);

  return (
    <MobileFrame>
      <SignUpScreen />
    </MobileFrame>
  );
}
