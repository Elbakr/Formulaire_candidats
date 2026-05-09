import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatDate(d: string | Date, opts?: Intl.DateTimeFormatOptions) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-BE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

export function formatDateTime(d: string | Date) {
  return formatDate(d, { hour: "2-digit", minute: "2-digit" });
}
