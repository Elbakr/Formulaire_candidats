import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-ink text-white hover:bg-ink-2",
        gold: "bg-gold text-[#1a1a0d] hover:bg-gold-dark hover:text-white",
        outline: "border-[1.5px] border-line bg-surface hover:border-gold hover:text-gold-dark",
        ghost: "hover:bg-surface-2",
        danger: "border-[1.5px] border-danger-light text-danger hover:bg-danger-light",
        success: "bg-success text-white hover:bg-success/90",
        info: "bg-info text-white hover:bg-info/90",
        link: "text-gold-dark underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3 py-2",
        sm: "h-8 px-2.5 text-xs rounded-md",
        lg: "h-11 px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * État de chargement (server action / async). Quand `true` : affiche un spinner,
   * désactive le bouton et empêche les clics multiples. Optionnel — comportement
   * inchangé si non fourni (rétro-compatibilité totale).
   */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, ...props }, ref) => {
    // asChild = Slot : un seul enfant autorisé -> on ne peut PAS injecter le spinner.
    // On préserve STRICTEMENT le comportement d'origine (spread inchangé, incl.
    // disabled/children). La barre de navigation globale couvre déjà les <Link>.
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
      );
    }

    const { children, disabled, ...rest } = props;
    const isDisabled = disabled || loading;

    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        aria-busy={loading || undefined}
        {...rest}
        disabled={isDisabled}
      >
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
