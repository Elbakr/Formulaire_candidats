"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { formatDate } from "@/lib/utils";
import { EmployeesBulkBar } from "./bulk-bar";

type SiteAssignBadge = {
  code: string;
  color: string | null;
  is_primary: boolean;
};

type Employee = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  weekly_hours: number | null;
  contract_type: string | null;
  status: "active" | "on_leave" | "archived";
  start_date: string;
  department: { id: string; name: string } | null;
};

export function EmployeesList({
  employees,
  sitesByEmp,
  isAdmin,
}: {
  employees: Employee[];
  sitesByEmp: Map<string, SiteAssignBadge[]>;
  isAdmin: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(employees.map((e) => e.id)));
  }
  function clear() {
    setSelected(new Set());
  }

  const selectedEmployees = employees
    .filter((e) => selected.has(e.id))
    .map((e) => ({ id: e.id, full_name: e.full_name }));

  return (
    <>
      <Card>
        {employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-3">
            Pas encore d'employé. Quand un candidat passe au statut "Embauché",
            il est automatiquement créé ici.
          </div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-line flex items-center gap-3 text-xs">
              <input
                type="checkbox"
                checked={selected.size === employees.length}
                onChange={(e) =>
                  e.target.checked ? selectAll() : clear()
                }
                className="cursor-pointer"
                aria-label="Tout sélectionner"
              />
              <span className="text-ink-3">
                {selected.size > 0
                  ? `${selected.size} sélectionné${selected.size > 1 ? "s" : ""}`
                  : "Sélectionne pour archiver/supprimer en masse"}
              </span>
              {selected.size > 0 ? (
                <button
                  onClick={clear}
                  className="ml-auto text-gold-dark font-bold hover:underline"
                >
                  Tout désélectionner
                </button>
              ) : null}
            </div>
            <div className="divide-y divide-line">
              {employees.map((e) => {
                const isSelected = selected.has(e.id);
                const sites = sitesByEmp.get(e.id) ?? [];
                return (
                  <div
                    key={e.id}
                    className={`p-3 flex items-center gap-3 flex-wrap transition-colors ${
                      isSelected
                        ? "bg-gold-light/40"
                        : "hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(e.id)}
                      className="cursor-pointer shrink-0"
                      aria-label={`Sélectionner ${e.full_name}`}
                    />
                    <div
                      className={`flex-1 min-w-[200px] ${e.status !== "active" ? "opacity-60" : ""}`}
                    >
                      <EmployeeQuickLink
                        employeeId={e.id}
                        fullName={e.full_name}
                        subtitle={
                          <>
                            {e.job_title ?? "—"} ·{" "}
                            {e.department?.name ?? "Sans service"} ·{" "}
                            {e.contract_type ?? "—"} · {e.weekly_hours ?? 38}h/sem
                          </>
                        }
                        variant="block"
                        withAvatar
                        avatarSize="md"
                        primaryHref={`/planning/employees/${e.id}`}
                        fullWidth
                      />
                    </div>
                    <div className="hidden md:flex items-center gap-1">
                      {sites.length === 0 ? (
                        <span className="text-[10px] text-ink-3 italic">
                          aucun site
                        </span>
                      ) : (
                        sites.slice(0, 4).map((a, i) => (
                          <span
                            key={i}
                            title={a.is_primary ? "Site principal" : "Site secondaire"}
                            className="inline-flex items-center justify-center w-6 h-6 rounded text-white font-bold text-[10px]"
                            style={{ backgroundColor: a.color ?? "#666" }}
                          >
                            {a.code}
                          </span>
                        ))
                      )}
                    </div>
                    <span className="text-[11px] text-ink-3 hidden lg:inline">
                      depuis {formatDate(e.start_date)}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                        e.status === "active"
                          ? "bg-success-light text-success"
                          : e.status === "on_leave"
                            ? "bg-warn-light text-warn"
                            : "bg-surface-2 text-ink-3"
                      }`}
                    >
                      {e.status === "active"
                        ? "Actif"
                        : e.status === "on_leave"
                          ? "En congé"
                          : "Archivé"}
                    </span>
                    <Link
                      href={`/360/employee/${e.id}`}
                      title="Vue 360°"
                      aria-label="Vue 360°"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-2 hover:border-gold hover:text-gold-dark transition-colors shrink-0"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <EmployeesBulkBar
        selected={selectedEmployees}
        onClear={clear}
        isAdmin={isAdmin}
      />
    </>
  );
}
