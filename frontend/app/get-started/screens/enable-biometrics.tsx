import { useRouter } from "next/navigation";

interface EnableBiometricsScreenProps {
  onBack: () => void;
}

export default function EnableBiometricsScreen({
  onBack,
}: EnableBiometricsScreenProps) {
  const router = useRouter();

  const handleComplete = () => {
    // Navigate to KYC after onboarding, then home
    router.push("/kyc");
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
          Enable Biometrics
        </span>
        <span className="text-xs text-[#667085]">Step 4 of 4</span>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-10 px-4 pt-24">
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
              <path d="M12 2a7 7 0 0 0-7 7c0 3.5 2 6.5 7 11 5-4.5 7-7.5 7-11a7 7 0 0 0-7-7z" />
              <circle cx="12" cy="9" r="2" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="font-sans text-2xl font-bold text-[#0d1b2a]">
              Enable Face ID/Touch ID
            </h1>
            <p className="max-w-[358px] text-center text-sm text-[#667085]">
              Use biometrics for faster, more secure access to your Cestra
              account.
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {/* Enable option */}
          <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-5">
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
                <path d="M12 2a7 7 0 0 0-7 7c0 3.5 2 6.5 7 11 5-4.5 7-7.5 7-11a7 7 0 0 0-7-7z" />
                <circle cx="12" cy="9" r="2" />
              </svg>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-[#0d1b2a]">
                Enable Biometrics
              </span>
              <span className="text-xs text-[#667085]">
                Sign in instantly with Face ID or Touch ID
              </span>
            </div>
            <button
              onClick={handleComplete}
              className="rounded-3xl bg-[#007a6e] px-4 py-2.5"
            >
              <span className="text-sm font-semibold text-white">Enable</span>
            </button>
          </div>

          {/* Skip option */}
          <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gray-100">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#667085"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-[#0d1b2a]">
                Skip for now
              </span>
              <span className="text-xs text-[#667085]">
                You can enable this later in the settings.
              </span>
            </div>
            <button
              onClick={handleComplete}
              className="rounded-3xl border border-gray-200 bg-white px-4 py-2.5"
            >
              <span className="text-sm font-semibold text-[#0d1b2a]">
                Skip
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
