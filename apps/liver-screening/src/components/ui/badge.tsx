import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-hub-cta text-white",
        secondary: "bg-(--odos-hub-cta-tint-10) text-hub-cta",
        success: "bg-(--odos-badge-success-bg) text-(--odos-badge-success)",
        warning: "bg-(--odos-badge-warning-bg) text-(--odos-badge-warning-text)",
        danger: "bg-(--odos-risk-high-tint) text-(--odos-risk-high)",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
