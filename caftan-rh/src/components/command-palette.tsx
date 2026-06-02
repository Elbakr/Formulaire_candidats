"use client";

// Karim 2026-05-31 : Cmd+K palette globale style Linear.
// Recherche fuzzy sur : employees + pages + actions rapides.
// Activable via Cmd+K / Ctrl+K. ESC ferme.

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Users, FileText, Calendar, Mail, Wallet, Settings,
  LayoutDashboard, Briefcase, FileSignature, ClipboardEdit,
  UserCheck, Upload, ArrowRight, Building2, Sparkles,
} from "lucide-react";
import { searchEmployeesForPaletteAction } from "@/app/api/palette/actions";
import { useViewerRole } from "./user-role-context";

type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Users;
  action: () => void;
  group: "Pages" | "Actions" | "Employés";
};

const STATIC_PAGES: Omit<PaletteItem, "action">[] = [
  { id: "p-dashboard", label: "Tableau de bord", icon: LayoutDashboard, group: "Pages", hint: "/" },
  { id: "p-employees", label: "Employés", icon: Users, group: "Pages", hint: "/planning/employees" },
  { id: "p-planning", label: "Planning", icon: Calendar, group: "Pages", hint: "/planning" },
  { id: "p-contracts", label: "Contrats (via fiche employee)", icon: FileSignature, group: "Pages", hint: "/planning/employees" },
  { id: "p-payslips", label: "Fiches de paie", icon: Wallet, group: "Pages", hint: "/admin/payslips" },
  { id: "p-mails-sent", label: "Mails envoyés", icon: Mail, group: "Pages", hint: "/rh/mails" },
  { id: "p-mails-compose", label: "Composer un mail", icon: Mail, group: "Pages", hint: "/rh/mails/new" },
  { id: "p-screening", label: "Screening candidats", icon: ClipboardEdit, group: "Pages", hint: "/rh/screening" },
  { id: "p-candidates", label: "Candidats", icon: UserCheck, group: "Pages", hint: "/rh/candidates" },
  { id: "p-settings", label: "Paramètres", icon: Settings, group: "Pages", hint: "/admin/settings" },
];

const QUICK_ACTIONS: Omit<PaletteItem, "action">[] = [
  { id: "a-payslip-upload", label: "Uploader fiches de paie (PDF)", icon: Upload, group: "Actions", hint: "Drop sur /admin/payslips" },
  { id: "a-new-mail", label: "Nouveau mail manuel", icon: Mail, group: "Actions", hint: "Composer + pièces jointes" },
  { id: "a-new-employee", label: "Créer un employé", icon: Sparkles, group: "Actions", hint: "Form rapide" },
  { id: "a-contracts", label: "Préparer un contrat", icon: FileSignature, group: "Actions" },
];

type EmployeeMini = { id: string; full_name: string; status: string };

export function CommandPalette() {
  const router = useRouter();
  const role = useViewerRole();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<EmployeeMini[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle Cmd+K / Ctrl+K + ESC - admin/rh only
  useEffect(() => {
    if (role !== "admin" && role !== "rh") return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, role]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Recherche employees debounced via server action
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (query.trim().length < 1) {
        setEmployees([]);
        return;
      }
      try {
        const res = await searchEmployeesForPaletteAction(query.trim());
        if (res.ok) setEmployees(res.employees);
      } catch {
        // silent
      }
    }, 120);
    return () => clearTimeout(t);
  }, [query, open]);

  const items: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    const empItems: PaletteItem[] = employees.map((e) => ({
      id: `e-${e.id}`,
      label: e.full_name,
      hint: e.status === "active" ? "Actif" : e.status === "on_leave" ? "En congé" : e.status,
      icon: Users,
      group: "Employés",
      action: () => {
        setOpen(false);
        router.push(`/planning/employees/${e.id}`);
      },
    }));

    const pages: PaletteItem[] = STATIC_PAGES.filter((p) => !q || p.label.toLowerCase().includes(q) || p.hint?.toLowerCase().includes(q)).map((p) => ({
      ...p,
      action: () => {
        setOpen(false);
        router.push(p.hint!);
      },
    }));

    const actions: PaletteItem[] = QUICK_ACTIONS.filter((a) => !q || a.label.toLowerCase().includes(q)).map((a) => ({
      ...a,
      action: () => {
        setOpen(false);
        switch (a.id) {
          case "a-payslip-upload":
            router.push("/admin/payslips?focus=upload");
            break;
          case "a-new-mail":
            router.push("/rh/mails/new");
            break;
          case "a-new-employee":
            router.push("/planning/employees?new=1");
            break;
          case "a-contracts":
            router.push("/planning/employees");
            break;
        }
      },
    }));

    return [...empItems, ...pages, ...actions];
  }, [query, employees, router]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[active]?.action();
      }
    },
    [items, active],
  );

  if (!open) return null;

  // Group by group label, preserving insertion order
  const grouped: Record<string, PaletteItem[]> = {};
  for (const it of items) {
    if (!grouped[it.group]) grouped[it.group] = [];
    grouped[it.group].push(it);
  }
  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-line overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <Search className="w-4 h-4 text-ink-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Rechercher un employé, une page, une action..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-3"
          />
          <kbd className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-ink-3">ESC</kbd>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-ink-3">
              Aucun résultat pour <span className="font-semibold">{query}</span>
            </div>
          )}
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-ink-3">
                {group}
              </div>
              {list.map((it) => {
                flatIndex++;
                const isActive = flatIndex === active;
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onMouseEnter={() => setActive(flatIndex)}
                    onClick={it.action}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm ${
                      isActive ? "bg-blue-50 text-blue-900" : "hover:bg-muted/30"
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-blue-700" : "text-ink-3"}`} />
                    <span className="flex-1 truncate font-medium">{it.label}</span>
                    {it.hint && (
                      <span className="text-[11px] text-ink-3 font-mono truncate max-w-[180px]">{it.hint}</span>
                    )}
                    {isActive && <ArrowRight className="w-3.5 h-3.5 text-blue-700" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-line bg-muted/20 flex items-center justify-between text-[10px] text-ink-3 font-mono">
          <div className="flex gap-3">
            <span>↑↓ naviguer</span>
            <span>↵ ouvrir</span>
            <span>esc fermer</span>
          </div>
          <span>{items.length} résultats</span>
        </div>
      </div>
    </div>
  );
}
