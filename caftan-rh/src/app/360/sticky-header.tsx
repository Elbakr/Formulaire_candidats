// Sticky header for the 360° profile page. Client component because it
// includes a print trigger.

"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";

export type StickyHeaderFact = { label: string; value: string };

export function StickyHeader({
  name,
  subtitle,
  facts,
  badges,
  backHref,
  backLabel,
  printHref,
  actions,
}: {
  name: string;
  subtitle?: string | null;
  facts: StickyHeaderFact[];
  badges?: Array<{ label: string; tone?: "muted" | "gold" | "success" | "info" | "warn" | "danger" }>;
  backHref: string;
  backLabel: string;
  printHref: string;
  actions?: React.ReactNode;
}) {
  function toneCls(tone: string | undefined) {
    switch (tone) {
      case "gold":
        return "bg-gold-light text-gold-dark";
      case "success":
        return "bg-success-light text-success";
      case "info":
        return "bg-info-light text-info";
      case "warn":
        return "bg-warn-light text-warn";
      case "danger":
        return "bg-danger-light text-danger";
      default:
        return "bg-surface-2 text-ink-2";
    }
  }

  return (
    <div className="sticky top-[49px] z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-canvas/95 backdrop-blur-sm border-b border-line print:static print:border-0 print:bg-transparent print:py-0">
      <div className="flex items-center gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap gap-2 items-center">
          {actions}
          <Button asChild variant="outline" size="sm">
            <a href={printHref} target="_blank" rel="noopener noreferrer">
              <Printer className="h-3.5 w-3.5" /> Imprimer
            </a>
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-start gap-3 flex-wrap">
        <NameAvatar name={name} className="h-12 w-12 text-base rounded-xl" />
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{name}</h1>
            {(badges ?? []).map((b, i) => (
              <Badge key={i} variant="muted" className={`text-[10px] ${toneCls(b.tone)}`}>
                {b.label}
              </Badge>
            ))}
          </div>
          {subtitle ? <div className="text-xs text-ink-2 mt-0.5">{subtitle}</div> : null}
          {facts.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-ink-2">
              {facts.map((f, i) => (
                <span key={i}>
                  <span className="text-ink-3 font-bold uppercase tracking-wider mr-1">
                    {f.label}
                  </span>
                  <span className="font-semibold">{f.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
