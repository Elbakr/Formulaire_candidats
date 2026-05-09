import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-bold tracking-wide",
  {
    variants: {
      variant: {
        new: "bg-[#f4f4f5] text-[#71717a]",
        contacted: "bg-info-light text-info",
        rdv_scheduled: "bg-warn-light text-warn",
        rdv_done: "bg-success-light text-success",
        wait_decision: "bg-violet-light text-violet",
        hired: "bg-success text-white",
        refused: "bg-danger-light text-danger",
        gold: "bg-gold-light text-gold-dark",
        muted: "bg-surface-2 text-ink-2",
      },
    },
    defaultVariants: { variant: "new" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export const STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  rdv_scheduled: "RDV planifié",
  rdv_done: "RDV fait",
  wait_decision: "En attente",
  hired: "Embauché",
  refused: "Refusé",
};
