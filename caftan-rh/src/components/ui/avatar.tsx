"use client";
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn, initials } from "@/lib/utils";

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-9 w-9 shrink-0 overflow-hidden rounded-lg", className)}
    {...props}
  />
));
Avatar.displayName = "Avatar";

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn("aspect-square h-full w-full", className)} {...props} />
));
AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center bg-gold text-white font-bold text-xs", className)}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";

export function NameAvatar({ name, className }: { name: string; className?: string }) {
  const inits = initials(name);
  const colors = ["bg-gold", "bg-info", "bg-violet", "bg-success", "bg-warn"];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <Avatar className={className}>
      <AvatarFallback className={colors[idx]}>{inits}</AvatarFallback>
    </Avatar>
  );
}
