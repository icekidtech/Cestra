import Image from "next/image";

interface PhoneNumberScreenProps {
  onNext: () => void;
  onBack: () => void;
}

export default function PhoneNumberScreen({
  onNext,
  onBack,
}: PhoneNumberScreenProps) {
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
          Verify your number
        </span>
        <span className="text-xs text-[#667085]">Step 2 of 4</span>
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
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-2.5">
            <h1 className="font-sans text-xl font-bold text-[#0d1b2a]">
              Enter Your Phone Number
            </h1>
            <p className="max-w-[302px] text-center text-sm text-[#667085]">
              We&apos;ll send a 6-digit verification code to confirm your number
            </p>
          </div>
        </div>

        {/* Phone input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[#0d1b2a]">
            Phone Number
          </label>
          <div className="flex gap-2">
            <div className="flex h-11 items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3">
              <span className="text-sm font-medium text-[#0d1b2a]">NG</span>
              <span className="text-sm text-[#667085]">+234</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#667085"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <input
              type="tel"
              placeholder="Phone number"
              className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#0d1b2a] placeholder:text-[#667085] focus:border-[#007a6e] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#667085"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-xs text-[#667085]">
              Standard SMS rates may apply
            </span>
          </div>
        </div>

        {/* Send code button */}
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
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          <span className="text-sm font-semibold text-white">Send Code</span>
        </button>

        {/* Info box */}
        <div className="flex gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e0f4f2]">
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
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[#0d1b2a]">
              How it works
            </span>
            <span className="text-xs text-[#667085]">
              Enter your number, receive a one-time code via SMS, and verify
              your number in seconds
            </span>
          </div>
        </div>

        {/* Login link */}
        <p className="text-center text-sm">
          <span className="text-[rgba(13,27,42,0.8)]">
            Already have an account?{" "}
          </span>
          <button className="font-semibold text-[#007a6e]">Login</button>
        </p>
      </div>
    </div>
  );
}
