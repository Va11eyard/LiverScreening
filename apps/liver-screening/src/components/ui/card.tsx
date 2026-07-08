import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-[20px] bg-white px-4 py-4 text-sm text-card-foreground shadow-(--shadow-results-card)",
        className,
      )}
      {...props}
    />
  );
}
