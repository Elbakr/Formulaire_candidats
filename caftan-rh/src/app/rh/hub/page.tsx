import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getNavSections } from "@/lib/navigation";
import { NavIcon } from "@/components/nav-icon";
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

  // Nav complete du role -> ce qui est dispo + le menu "toutes les fonctions".
  const groups = getNavSections(role);
  const available = new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
  const tiles = PRIMARY.filter((t) => available.has(t.href));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Centre RH</h1>
          <p className="text-sm text-ink-2">Tes fonctions essentielles. Le reste est dans « Toutes les fonctions ».</p>
        </div>
        <AllFunctionsMenu groups={groups} />
      </div>

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
