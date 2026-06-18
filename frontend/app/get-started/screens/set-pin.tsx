"use client";

import { useState } from "react";

interface SetPinScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export default function SetPinScreen({ onNext, onBack }: SetPinScreenProps) {
  const [pin, setPin] = useState<string[]>(["", "", "", "", "", ""]);
  const filledCount = pin.filter((d) => d !== "").length;

  const handleDotClick = () => {
    // Simulate filling dots one by one
    const nextEmpty = pin.findIndex((d) => d === "");
    if (nextEmpty !== -1) {
      const newPin = [...pin];
      newPin[nextEmpty] = "•";
      setPin(newPin);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-[77px]">
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
          Create Your PIN
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
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="font-sans text-2xl font-bold text-[#0d1b2a]">
              Set a 6-Digit PIN
            </h1>
            <p className="max-w-[358px] text-center text-sm text-[#667085]">
              Your PIN keeps your account secure. Never share it with anyone.
            </p>
          </div>
        </div>

        {/* PIN dots */}
        <div className="flex flex-col items-center gap-6">
          <button
            onClick={handleDotClick}
            className="flex items-center justify-center gap-6"
          >
            {pin.map((digit, i) => (
              <div
                key={i}
                className={`size-4 rounded-full border-2 ${
                  digit
                    ? "border-[#007a6e] bg-[#007a6e]"
                    : "border-gray-300 bg-transparent"
                }`}
              />
            ))}
          </button>
          <p className="text-xs text-[#667085]">
            Avoid using obvious sequences like 123456
          </p>
        </div>

        {/* Continue button */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              // Auto-fill all dots then advance
              setPin(["•", "•", "•", "•", "•", "•"]);
              setTimeout(onNext, 300);
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-3xl bg-[#007a6e]"
          >
            <span className="text-sm font-semibold text-white">Continue</span>
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
          </button>
          <p className="text-center text-xs text-[#667085]">
            You&apos;ll confirm this PIN on the next screen.
          </p>
        </div>
      </div>

      {/* Dummy number pad */}
      <div className="mt-auto grid grid-cols-3 gap-px bg-gray-100">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((key, i) => (
          <button
            key={i}
            onClick={handleDotClick}
            className="flex h-14 items-center justify-center bg-white text-xl font-medium text-[#0d1b2a] active:bg-gray-50"
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
