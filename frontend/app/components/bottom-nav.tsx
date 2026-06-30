"use client";

import { useRouter } from "next/navigation";

type Tab = "wallet" | "discover" | "swap" | "earn";

const TABS: { id: Tab; label: string; href: string }[] = [
  { id: "wallet", label: "Wallet", href: "/home" },
  { id: "discover", label: "Discover", href: "/discover" },
  { id: "swap", label: "Swap", href: "/send-crypto" },
  { id: "earn", label: "Earn", href: "/savings" },
];

export function BottomNav({ active }: { active: Tab }) {
  const router = useRouter();
  return (
    <nav className="flex items-center justify-around border-t border-black/5 bg-white px-2 py-3">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <TabIcon tab={tab.id} active={isActive} />
            <span
              className={`text-[10px] ${
                isActive ? "font-semibold text-[#007a6e]" : "text-[#667085]"
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  const cls = `size-6 ${active ? "text-[#007a6e]" : "text-[#667085]"}`;
  const common = {
    className: cls,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (tab) {
    case "wallet":
      return (
        <svg {...common}>
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
        </svg>
      );
    case "discover":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    case "swap":
      return (
        <svg {...common}>
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case "earn":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
        </svg>
      );
  }
}
