import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[60px] w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-3 py-2 text-sm",
      "placeholder:text-ink-3 outline-none transition-colors leading-relaxed",
      "focus:border-gold disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
