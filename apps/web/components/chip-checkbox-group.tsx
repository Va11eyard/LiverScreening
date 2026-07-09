"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  className?: string;
};

export function ChipCheckboxGroup({ options, values, onChange, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => {
        const on = values.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(on ? values.filter((v) => v !== opt) : [...values, opt])}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
              on
                ? "border-hub-cta bg-(--odos-hub-cta-tint-10) text-hub-cta"
                : "border-(--odos-input-border) bg-white text-hub-muted hover:border-hub-cta/40 hover:bg-hub-page",
            )}
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded border",
                on ? "border-hub-cta bg-hub-cta text-white" : "border-(--odos-input-border) bg-white",
              )}
            >
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}
