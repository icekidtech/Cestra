"use client";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  action?: { label: string; onClick: () => void };
}

/** Standard screen header: back chevron + title + optional subtitle/action. */
export function ScreenHeader({ title, subtitle, onBack, action }: ScreenHeaderProps) {
  return (
    <div className="px-4 pt-16">
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full"
          >
            <svg
              className="size-6 text-[#0d1b2a]"
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
        ) : (
          <span className="size-11" />
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="text-sm font-medium text-[#667085]"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="mt-4">
        <h1 className="text-2xl font-bold text-[#0d1b2a]">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-[#667085]">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
