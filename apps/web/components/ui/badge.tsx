import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-hub-cta text-white [a]:hover:opacity-90",
        secondary:
          "bg-[var(--odos-hub-cta-tint-10)] text-hub-cta [a]:hover:opacity-90",
        destructive:
          "bg-[var(--odos-risk-high-tint)] text-[var(--odos-risk-high)] [a]:hover:opacity-90",
        success:
          "bg-[var(--odos-badge-success-bg)] text-[var(--odos-badge-success)] [a]:hover:opacity-90",
        warning:
          "bg-[var(--odos-badge-warning-bg)] text-[var(--odos-badge-warning-text)] [a]:hover:opacity-90",
        neutral:
          "bg-hub-page text-hub-muted [a]:hover:opacity-90",
        outline:
          "border-[var(--odos-input-border)] text-hub-heading [a]:hover:bg-[var(--odos-input-bg-subtle)]",
        ghost:
          "hover:bg-hub-selected/50 hover:text-hub-heading",
        link: "text-hub-cta underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
