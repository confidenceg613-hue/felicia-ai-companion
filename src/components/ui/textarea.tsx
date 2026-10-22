import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-border/70 placeholder:text-muted-foreground/75 hover:border-border focus-visible:border-ring/70 focus-visible:ring-ring/25 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-xl border bg-card/55 px-3.5 py-2.5 text-base shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-[color,box-shadow,border-color,background-color] duration-200 ease-[var(--ease-premium)] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
