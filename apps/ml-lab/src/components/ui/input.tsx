import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-[box-shadow,border-color] duration-150 placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 focus-visible:shadow-[0_0_0_3px_rgba(13,148,136,0.12)]",
        className,
      )}
      {...props}
    />
  );
}
