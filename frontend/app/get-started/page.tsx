"use client";

import { useState } from "react";
import SignUpScreen from "./screens/sign-up";
import PhoneNumberScreen from "./screens/phone-number";
import OtpVerificationScreen from "./screens/otp-verification";
import SetPinScreen from "./screens/set-pin";
import EnableBiometricsScreen from "./screens/enable-biometrics";

export default function OnboardingPage() {
  const [step, setStep] = useState(0);

  const goNext = () => setStep((s) => Math.min(s + 1, 4));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="relative h-[844px] w-[390px] overflow-hidden rounded-xl">
        {step === 0 && <SignUpScreen onNext={goNext} />}
        {step === 1 && <PhoneNumberScreen onNext={goNext} onBack={goBack} />}
        {step === 2 && (
          <OtpVerificationScreen onNext={goNext} onBack={goBack} />
        )}
        {step === 3 && <SetPinScreen onNext={goNext} onBack={goBack} />}
        {step === 4 && <EnableBiometricsScreen onBack={goBack} />}
      </div>
    </div>
  );
}
