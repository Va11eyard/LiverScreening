"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type ChipOption =
  | string
  | {
      value: string;
      label: string;
      icon?: LucideIcon;
      iconClassName?: string;
    };

type Props = {
  options: ChipOption[];
  value?: string;
  onChange: (value: string) => void;
  className?: string;
};

function normalize(opt: ChipOption) {
  if (typeof opt === "string") {
    return { value: opt, label: opt, icon: undefined, iconClassName: undefined };
  }
  return opt;
}

export function ChipGroup({ options, value, onChange, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((raw) => {
        const opt = normalize(raw);
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
              value === opt.value
                ? "border-hub-cta bg-(--odos-hub-cta-tint-10) text-hub-cta"
                : "border-(--odos-input-border) bg-white text-hub-muted hover:border-hub-cta/40 hover:bg-hub-page",
            )}
          >
            {Icon ? <Icon className={cn("size-3.5 shrink-0", opt.iconClassName)} aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChipHint({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="text-xs text-hub-muted">Выберите вариант</p>;
}
