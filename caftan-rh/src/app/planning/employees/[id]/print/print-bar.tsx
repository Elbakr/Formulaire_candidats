"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft, Flame, User } from "lucide-react";

export function PrintBar({
  employeeId,
  weeks,
}: {
  employeeId: string;
  weeks: number;
  weekISO: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const audience = sp.get("audience") === "admin" ? "admin" : "employee";

  function setWeeks(n: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("weeks", String(n));
    router.replace(`${pathname}?${next.toString()}`);
  }

  function setAudience(a: "employee" | "admin") {
    const next = new URLSearchParams(sp.toString());
    if (a === "admin") next.set("audience", "admin");
    else next.delete("audience");
    router.replace(`${pathname}?${next.toString()}`);
  }

  const tabs = [
    { v: 1, label: "1 sem" },
    { v: 3, label: "3 sem" },
    { v: 4, label: "4 sem" },
    { v: 12, label: "12 sem" },
  ];

  return (
    <div className="flex items-center justify-between mb-3 print:hidden flex-wrap gap-2">
      <Link
        href={`/planning/employees/${employeeId}/calendar?view=week`}
        className="text-xs text-gold-dark font-bold inline-flex items-center gap-1 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour fiche
      </Link>
      <div className="flex gap-2 items-center flex-wrap">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
          {tabs.map((t) => (
            <button
              key={t.v}
              onClick={() => setWeeks(t.v)}
              className={`px-3 py-1.5 font-bold transition-colors ${
                weeks === t.v
                  ? "bg-gold text-[#1a1a0d]"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Sélecteur d'audience — seuls admin/RH peuvent passer en mode admin
            (côté serveur la valeur est forcée à 'employee' pour les autres). */}
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
          <button
            onClick={() => setAudience("employee")}
            className={`px-3 py-1.5 font-bold inline-flex items-center gap-1 transition-colors ${
              audience === "employee"
                ? "bg-gold text-[#1a1a0d]"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
            title="Vue employé : pas d'heures sup. Sûr à remettre à l'employé."
          >
            <User className="h-3 w-3" /> Vue employé
          </button>
          <button
            onClick={() => setAudience("admin")}
            className={`px-3 py-1.5 font-bold inline-flex items-center gap-1 transition-colors ${
              audience === "admin"
                ? "bg-orange-500 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
            title="Vue admin/RH : page 2 = heures sup. Document interne."
          >
            <Flame className="h-3 w-3" /> Vue admin
          </button>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-gold text-[#1a1a0d] font-bold rounded-md px-4 py-2 inline-flex items-center gap-2 text-sm"
        >
          <Printer className="h-4 w-4" /> Imprimer
        </button>
      </div>
    </div>
  );
}
