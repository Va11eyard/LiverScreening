import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full min-w-0 rounded-xl border border-(--odos-input-border) bg-white px-3.5 py-2 text-base transition-colors outline-none file:inline-flex file:h-6 file:cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-(--odos-input-placeholder) focus-visible:border-hub-cta focus-visible:ring-2 focus-visible:ring-hub-cta/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm",
        type === "file" && "cursor-pointer",
        className
      )}
      {...props}
    />
  )
}

export { Input }
