"use client";

import type { ReactNode } from "react";

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  variant?: "primary" | "secondary";
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  type = "button",
  variant = "primary",
}: PrimaryButtonProps) {
  const base =
    "flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-[#007a6e] text-white active:bg-[#006a60]"
      : "border border-[#0d1b2a]/30 bg-white text-[#0d1b2a]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${styles}`}
    >
      {loading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        children
      )}
    </button>
  );
}
