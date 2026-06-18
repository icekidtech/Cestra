import Image from "next/image";
import Link from "next/link";

export default function WelcomeScreen() {
  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-black">
      {/* Gradient glow background */}
      <div className="absolute left-1/2 top-[-440px] -translate-x-1/2">
        <div className="size-[800px] rounded-full bg-[#14ffe8] blur-[92px]" />
        <div className="absolute left-1/2 top-[34px] size-[766px] -translate-x-1/2 rounded-full bg-[#00ad9c] blur-[92px]" />
        <div className="absolute left-1/2 top-[68px] size-[517px] -translate-x-1/2 rounded-full bg-[#007a6e] blur-[92px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 mt-auto flex w-full max-w-[358px] flex-col gap-12 px-4 pb-16">
        {/* Logo and text */}
        <div className="flex flex-col items-center gap-6">
          <Image
            src="/cestra-logo.png"
            alt="Cestra"
            width={48}
            height={48}
            className="size-12"
          />

          <div className="flex flex-col items-center gap-2 text-white">
            <h1 className="text-center font-sans text-2xl font-bold">
              Send Money Globally Instantly
            </h1>
            <p className="w-[300px] text-center font-sans text-xs font-normal leading-normal text-white">
              Real exchange rates. Transparent fees. Fast delivery to your people
              anywhere.
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <Link
            href="/get-started"
            className="flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2.5"
          >
            <span className="text-sm font-semibold text-black">
              Get Started
            </span>
            <Image
              src="/arrow-right.svg"
              alt=""
              width={20}
              height={20}
              className="size-5"
            />
          </Link>

          <Link
            href="/sign-in"
            className="flex items-center justify-center rounded-2xl border-[1.5px] border-white px-4 py-2.5"
          >
            <span className="text-sm font-semibold text-white">Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
