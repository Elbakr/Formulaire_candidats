import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getNavSections } from "@/lib/navigation";
import { NavIcon } from "@/components/nav-icon";
import { getUrgentActions } from "@/lib/rh-action-center";
import { AllFunctionsMenu } from "./all-functions-menu";

export const dynamic = "force-dynamic";

// Karim 2026-06-11 : ECRAN HR "command center". Surface les fonctions
// ULTRA UTILES en grandes tuiles ; tout le reste (≈80 fonctions) est accessible
// via le bouton "Toutes les fonctions". La selection ci-dessous est ajustable.

type Tile = { href: string; label: string; icon: string; desc: string; badgeKey?: string };

const PRIMARY: Tile[] = [
  { href: "/admin/presence", label: "Présence live", icon: "Activity", desc: "Qui travaille maintenant", badgeKey: "present" },
  { href: "/admin/anomalies", label: "Pointages à corriger", icon: "AlertTriangle", desc: "Anomalies à traiter", badgeKey: "anomalies" },
  { href: "/admin/heures-prestees", label: "Heures prestées", icon: "Clock", desc: "Pointé vs planifié" },
  { href: "/planning/calendar", label: "Planning semaine", icon: "CalendarDays", desc: "Horaires de la semaine" },
  { href: "/rh/candidates", label: "Candidats", icon: "Users", desc: "Recrutement & suivi", badgeKey: "newCand" },
  { href: "/rh/pipeline", label: "Pipeline", icon: "KanbanSquare", desc: "Étapes de recrutement" },
  { href: "/planning/employees", label: "Travailleurs", icon: "UserCheck", desc: "Fiches, contrats, conformité" },
  { href: "/scoring", label: "Évaluations & notes", icon: "Star", desc: "Noter & commenter l'équipe" },
  { href: "/rh/inbox", label: "Inbox IA", icon: "Sparkles", desc: "Actions suggérées" },
  { href: "/planning/time-off", label: "Congés", icon: "CalendarOff", desc: "Demandes & validation" },
  { href: "/admin/cdd-renewals", label: "Renouvellements CDD", icon: "RefreshCw", desc: "Décisions à venir" },
  { href: "/admin/payslips", label: "Fiches de paie", icon: "Wallet", desc: "Paie + QR EPC" },
  { href: "/rh/dimona", label: "Dimona", icon: "FileText", desc: "Déclarations ONSS" },
  { href: "/chat", label: "Chat équipe", icon: "MessageSquare", desc: "Messagerie interne" },
];

export default async function HrHubPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const role = profile.role as string;
  const supabase = await createClient();

  const [{ count: present }, { count: newCand }, { count: anomalies }] = await Promise.all([
    supabase.from("clock_currently_in").select("employee_id", { count: "exact", head: true }),
    supabase.from("candidates").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("clock_entries").select("id", { count: "exact", head: true }).eq("is_anomalous", true),
  ]);
  const badges: Record<string, number> = {
    present: present ?? 0,
    newCand: newCand ?? 0,
    anomalies: anomalies ?? 0,
  };

  // Centre d'actions urgentes (deadline-driven + en attente).
  const actions = await getUrgentActions(supabase);
  const totalToDo = actions.reduce((s, a) => s + a.count, 0);

  // Nav complete du role -> ce qui est dispo + le menu "toutes les fonctions".
  // Karim 2026-07-08 : passe les permissions par user (fiches de paie OFF par
  // défaut pour les RH) — la tuile "Fiches de paie" (dérivée de `available`)
  // et l'entrée nav ne s'affichent que si l'utilisateur y a droit.
  const groups = getNavSections(role, profile.permissions);
  const available = new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
  const tiles = PRIMARY.filter((t) => available.has(t.href));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Centre RH</h1>
          <p className="text-sm text-ink-2">Tes fonctions essentielles. Le reste est dans « Toutes les fonctions ».</p>
        </div>
        <AllFunctionsMenu groups={groups} />
      </div>

      {/* Karim 2026-06-13 : Centre d'actions urgentes — agir AVANT l'échéance. */}
      {actions.length > 0 ? (
        <div className="rounded-2xl border border-line bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
            <span className="text-base">⚡</span>
            <h2 className="font-bold text-sm">Actions urgentes</h2>
            <span className="ml-auto text-[11px] font-semibold text-ink-3">{totalToDo} à traiter</span>
          </div>
          <ul className="divide-y divide-line">
            {actions.map((a) => {
              const cls =
                a.severity === "critical"
                  ? "bg-danger-light text-danger"
                  : a.severity === "warn"
                    ? "bg-warn-light text-warn"
                    : "bg-info-light text-info";
              return (
                <li key={a.key}>
                  <Link href={a.link} className="flex items-center gap-3 p-3 hover:bg-surface-2 active:bg-surface-2/70 transition-colors">
                    <span className={`inline-flex h-9 w-9 rounded-xl items-center justify-center shrink-0 ${cls}`}>
                      <NavIcon name={a.icon} className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-ink leading-tight">{a.label}</div>
                      {a.hint ? <div className="text-[11px] text-ink-3 truncate">{a.hint}</div> : null}
                    </div>
                    <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0 ${cls}`}>
                      {a.count > 99 ? "99+" : a.count}
                    </span>
                    <ArrowRight className="h-4 w-4 text-ink-3 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-success/30 bg-success-light/40 p-4 text-sm font-semibold text-success flex items-center gap-2">
          ✅ Rien d'urgent en attente — tout est à jour.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map((t) => {
          const badge = t.badgeKey ? badges[t.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="group relative flex flex-col gap-2 rounded-2xl border border-line bg-canvas p-4 hover:border-gold/50 hover:shadow-sm active:scale-[0.98] transition-all min-h-[110px]"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold-light text-gold-dark group-hover:bg-gold group-hover:text-[#1a1a0d] transition-colors">
                  <NavIcon name={t.icon} className="h-5 w-5" />
                </span>
                {badge > 0 ? (
                  <span className="text-[11px] font-bold text-white bg-gold-dark rounded-full min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </div>
              <div>
                <div className="font-bold text-sm leading-tight">{t.label}</div>
                <div className="text-[11px] text-ink-3 mt-0.5">{t.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
