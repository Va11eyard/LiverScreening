import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-hub-cta/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "rounded-full bg-hub-cta text-white shadow-(--shadow-hub-cta) hover:opacity-90",
        outline:
          "rounded-full border-(--odos-input-border) bg-white text-hub-heading hover:bg-(--odos-input-bg-subtle)",
        ghost: "rounded-lg text-hub-cta hover:bg-hub-selected/50",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-full px-3 text-xs",
        lg: "min-h-11 px-5 text-base",
        icon: "size-9 rounded-full p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
