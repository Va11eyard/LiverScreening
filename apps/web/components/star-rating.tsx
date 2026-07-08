"use client";

import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export function StarRating({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border text-xs font-semibold transition-colors",
            value === n
              ? "border-hub-cta bg-(--odos-hub-cta-tint-10) text-hub-cta"
              : "border-(--odos-input-border) bg-white text-hub-muted hover:border-hub-cta/40 hover:bg-hub-page",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
