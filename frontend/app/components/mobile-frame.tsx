import type { ReactNode } from "react";

/**
 * Centers a 390×844 mobile viewport on a dark backdrop, matching the Figma
 * artboard size. All app screens render inside this frame.
 */
export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="relative h-[844px] w-[390px] overflow-hidden rounded-xl bg-[#f7f2fa]">
        {children}
      </div>
    </div>
  );
}
