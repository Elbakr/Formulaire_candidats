"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Printer, User, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type View = "week" | "month" | "year";

export function ViewSwitcher({ current, dateISO }: { current: View; dateISO: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setView(v: View) {
    const next = new URLSearchParams(sp.toString());
    next.set("view", v);
    next.set("date", dateISO);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const tabs: { v: View; label: string }[] = [
    { v: "week", label: "Semaine" },
    { v: "month", label: "Mois" },
    { v: "year", label: "Année" },
  ];

  return (
    <div className="inline-flex rounded-md border border-line overflow-hidden text-xs">
      {tabs.map((t) => (
        <button
          key={t.v}
          onClick={() => setView(t.v)}
          className={`px-3 py-1.5 font-bold transition-colors ${
            current === t.v
              ? "bg-gold text-[#1a1a0d]"
              : "bg-white text-ink-2 hover:bg-surface-2"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PrintMenu({
  employeeId,
  canSeeOvertime = true,
}: {
  employeeId: string;
  /** Si false (manager/employé), seul le mode 'employee' est exposé. */
  canSeeOvertime?: boolean;
}) {
  const periods = [
    { v: 1, label: "1 semaine" },
    { v: 3, label: "3 semaines" },
    { v: 4, label: "Mois (4 sem.)" },
    { v: 12, label: "Trimestre (12 sem.)" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer className="h-3.5 w-3.5" /> Imprimer
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <User className="h-3 w-3" /> Vue employé (sans h. sup)
        </DropdownMenuLabel>
        {periods.map((p) => (
          <DropdownMenuItem key={`emp-${p.v}`} asChild>
            <Link
              href={`/planning/employees/${employeeId}/print?weeks=${p.v}&audience=employee`}
              target="_blank"
            >
              {p.label}
            </Link>
          </DropdownMenuItem>
        ))}
        {canSeeOvertime ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-orange-700">
              <Flame className="h-3 w-3" /> Vue admin/RH (avec h. sup)
            </DropdownMenuLabel>
            {periods.map((p) => (
              <DropdownMenuItem key={`adm-${p.v}`} asChild>
                <Link
                  href={`/planning/employees/${employeeId}/print?weeks=${p.v}&audience=admin`}
                  target="_blank"
                >
                  {p.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
