"use client";

import { useState } from "react";

interface OtpVerificationScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export default function OtpVerificationScreen({
  onNext,
  onBack,
}: OtpVerificationScreenProps) {
  const [otp, setOtp] = useState(["5", "7", "3", "5", "", ""]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 pb-4 pt-[77px]">
        <button onClick={onBack} className="flex size-6 items-center justify-center">
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
          Verify code
        </span>
        <span className="text-xs text-[#667085]">Step 3 of 4</span>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-8 px-4 pt-16">
        {/* Icon + title */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-full bg-[#e0f4f2]">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#007a6e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="font-sans text-2xl font-bold text-[#0d1b2a]">
              Check Your Messages
            </h1>
            <p className="max-w-[358px] text-center text-sm text-[#667085]">
              We sent a 6-digit code to your number. Enter the code below to
              continue.
            </p>
          </div>
        </div>

        {/* OTP inputs */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between gap-2">
            {otp.map((digit, i) => (
              <input
                key={i}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                className="flex h-11 w-[53px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-center text-2xl font-bold text-[#0d1b2a] focus:border-[#007a6e] focus:outline-none"
              />
            ))}
          </div>
          <p className="text-sm text-[#667085]">
            Didn&apos;t get a code,{" "}
            <button className="font-semibold text-[#007a6e]">
              Resend code
            </button>{" "}
            (0:12)
          </p>
        </div>

        {/* Verify button */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onNext}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-3xl bg-[#007a6e]"
          >
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
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span className="text-sm font-semibold text-white">
              Verify Code
            </span>
          </button>
          <p className="text-center text-xs text-[#667085]">
            Code expires in 9:55
          </p>
        </div>
      </div>
    </div>
  );
}
