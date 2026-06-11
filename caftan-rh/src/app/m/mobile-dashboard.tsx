"use client";

// Karim 2026-06-02 : client wrapper du dashboard /m. Gere :
//   - Filtre periode (jour/semaine/mois) + site
//   - Bouton ⚙ personnaliser (modal toggle widgets)
//   - Affichage des widgets actifs

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, Clock, Calendar, AlertCircle, Zap, Wallet, Mail, UserCheck,
  FileSignature, Settings, RefreshCw, Loader2, Check,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { updateMobileDashboardPrefsAction } from "./actions";
import { WIDGETS_CATALOG, type WidgetId, type UserPrefs } from "./widgets-catalog";

const ICONS: Record<string, LucideIcon> = {
  Activity, Clock, Calendar, AlertCircle, Zap, Wallet, Mail, UserCheck, FileSignature,
};

interface Props {
  profileName: string;
  widgets: Array<{ id: WidgetId; label: string; icon: string; order: number }>;
  data: Record<string, unknown>;
  sites: Array<{ id: string; name: string; code: string }>;
  prefs: UserPrefs;
}

export function MobileDashboard({ profileName, widgets, data, sites, prefs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [period, setPeriod] = useState<"day" | "week" | "month">(prefs.period ?? "day");
  const [siteFilter, setSiteFilter] = useState<string | null>(prefs.site_filter ?? null);

  function updatePeriod(p: "day" | "week" | "month") {
    setPeriod(p);
    startTransition(async () => {
      const widgetsPrefs = WIDGETS_CATALOG.map((w) => {
        const cur = widgets.find((x) => x.id === w.id);
        return { id: w.id, enabled: !!cur, order: cur?.order ?? w.defaultOrder };
      });
      await updateMobileDashboardPrefsAction({ widgets: widgetsPrefs, period: p, site_filter: siteFilter });
      router.refresh();
    });
  }

  function updateSiteFilter(s: string | null) {
    setSiteFilter(s);
    startTransition(async () => {
      const widgetsPrefs = WIDGETS_CATALOG.map((w) => {
        const cur = widgets.find((x) => x.id === w.id);
        return { id: w.id, enabled: !!cur, order: cur?.order ?? w.defaultOrder };
      });
      await updateMobileDashboardPrefsAction({ widgets: widgetsPrefs, period, site_filter: s });
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen min-h-screen-mobile bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 pb-safe overscroll-none">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-line px-4 py-3 pt-safe px-safe">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold leading-tight">CaftanRH</h1>
            <p className="text-[10px] text-ink-3 truncate max-w-[200px]">{profileName}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => router.refresh()}
              disabled={pending}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-line active:bg-line/80 active:scale-95 transition-transform"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setShowCustomizer(true)}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-line active:bg-line/80 active:scale-95 transition-transform"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 -mx-4 px-4">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => updatePeriod(p)}
              className={`px-3 py-2 min-h-[44px] text-[11px] rounded-full font-semibold whitespace-nowrap active:scale-95 transition-transform ${
                period === p ? "bg-foreground text-background" : "bg-muted text-ink-2"
              }`}
            >
              {p === "day" ? "Aujourd'hui" : p === "week" ? "7j" : "30j"}
            </button>
          ))}
          <span className="text-ink-3 text-[10px] mx-1">·</span>
          <button
            onClick={() => updateSiteFilter(null)}
            className={`px-3 py-2 min-h-[44px] text-[11px] rounded-full font-semibold whitespace-nowrap active:scale-95 transition-transform ${
              !siteFilter ? "bg-foreground text-background" : "bg-muted text-ink-2"
            }`}
          >
            Tous sites
          </button>
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => updateSiteFilter(s.id)}
              className={`px-3 py-2 min-h-[44px] text-[11px] rounded-full font-semibold whitespace-nowrap active:scale-95 transition-transform ${
                siteFilter === s.id ? "bg-foreground text-background" : "bg-muted text-ink-2"
              }`}
            >
              {s.code}
            </button>
          ))}
        </div>
      </header>

      {/* Widgets stack */}
      <main className="px-3 py-3 space-y-3">
        {widgets.length === 0 && (
          <div className="text-center py-12 text-sm text-ink-3">
            Aucun widget actif. Clique sur ⚙ pour en activer.
          </div>
        )}
        {widgets.map((w) => (
          <WidgetCard key={w.id} widget={w} data={data[w.id]} period={period} />
        ))}
      </main>

      {showCustomizer && <Customizer prefs={prefs} onClose={() => setShowCustomizer(false)} />}
    </div>
  );
}

function WidgetCard({ widget, data, period }: {
  widget: { id: WidgetId; label: string; icon: string };
  data: unknown;
  period: "day" | "week" | "month";
}) {
  const Icon = ICONS[widget.icon] ?? Activity;
  const d = (data ?? {}) as Record<string, unknown>;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-line/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line/30">
        <Icon className="w-4 h-4 text-gold" />
        <h2 className="font-semibold text-sm">{widget.label}</h2>
      </div>
      <div className="p-4">
        {widget.id === "pointage_live" && <PointageLive data={d} />}
        {widget.id === "heures_periode" && <HeuresPeriode data={d} period={period} />}
        {widget.id === "planning_today" && <PlanningToday data={d} />}
        {widget.id === "alerts" && <Alerts data={d} />}
        {widget.id === "quick_actions" && <QuickActions />}
        {widget.id === "stats_salaires" && <StatsSalaires data={d} />}
        {widget.id === "mails_pending" && <MailsPending data={d} />}
        {widget.id === "candidates_pending" && <CandidatesPending data={d} />}
        {widget.id === "terminations_pending" && <TerminationsPending data={d} />}
      </div>
    </div>
  );
}

// ────────────────────────── WIDGETS ──────────────────────────

function PointageLive({ data }: { data: Record<string, unknown> }) {
  const total = (data.total as number) ?? 0;
  const present = (data.present as number) ?? 0;
  const done = (data.done as number) ?? 0;
  const upcoming = (data.upcoming as number) ?? 0;
  const bySite = (data.bySite as Array<{ code: string; name: string; color: string; count: number }>) ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Présents" value={present} color="text-green-600" />
        <Stat label="À venir" value={upcoming} color="text-blue-600" />
        <Stat label="Terminés" value={done} color="text-ink-3" />
        <Stat label="Planifié" value={total} color="text-foreground" />
      </div>
      {bySite.length > 0 && (
        <div className="border-t border-line/30 pt-2 space-y-1">
          <div className="text-[10px] text-ink-3 font-semibold">Par site (présents)</div>
          {bySite.map((s) => (
            <div key={s.code} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-bold tabular-nums">{s.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeuresPeriode({ data, period }: { data: Record<string, unknown>; period: string }) {
  const hours = ((data.totalHours as number) ?? 0).toFixed(1);
  const count = (data.count as number) ?? 0;
  const periodLbl = period === "day" ? "Aujourd'hui" : period === "week" ? "7 derniers jours" : "30 derniers jours";
  return (
    <div>
      <div className="text-3xl font-bold">{hours}<span className="text-base text-ink-3 ml-1">h</span></div>
      <div className="text-xs text-ink-3 mt-1">{count} shifts · {periodLbl}</div>
    </div>
  );
}

function PlanningToday({ data }: { data: Record<string, unknown> }) {
  const shifts = (data.shifts as Array<{ id: string; start_time: string; end_time: string; employee?: { full_name: string } | null; site?: { code: string; color: string | null } | null }>) ?? [];
  if (shifts.length === 0) return <div className="text-xs text-ink-3">Aucun shift aujourd&apos;hui.</div>;
  return (
    <div className="space-y-1.5">
      {shifts.slice(0, 8).map((s) => (
        <div key={s.id} className="flex items-center gap-2 text-xs">
          <div className="w-1.5 h-6 rounded-full" style={{ background: s.site?.color ?? "#888" }} />
          <span className="font-mono text-[10px] text-ink-3 w-20 flex-shrink-0">{s.start_time?.slice(0, 5)}-{s.end_time?.slice(0, 5)}</span>
          <span className="flex-1 truncate font-medium">{s.employee?.full_name ?? "—"}</span>
          <span className="text-[10px] text-ink-3 font-mono">{s.site?.code ?? ""}</span>
        </div>
      ))}
      {shifts.length > 8 && (
        <div className="text-[10px] text-ink-3 text-center mt-2">+ {shifts.length - 8} autres</div>
      )}
    </div>
  );
}

function Alerts({ data }: { data: Record<string, unknown> }) {
  const screening = (data.screening_pending as number) ?? 0;
  const reinforcement = (data.reinforcement_pending as number) ?? 0;
  const terminations = (data.terminations_pending as number) ?? 0;
  return (
    <div className="space-y-1.5">
      <AlertLine label="Demandes rupture amiable" value={terminations} href="/planning/employees?filter=termination_pending" />
      <AlertLine label="Renforts à valider" value={reinforcement} href="/planning/calendar" />
      <AlertLine label="Screening en attente" value={screening} href="/rh/screening" />
    </div>
  );
}

function QuickActions() {
  // Karim 2026-06-02 : routes verifiees (les contrats sont geres par
  // employee, pas en liste globale → on pointe vers /planning/employees).
  const actions = [
    { label: "Planning", href: "/planning/calendar", icon: "Calendar" },
    { label: "Employés", href: "/planning/employees", icon: "UserCheck" },
    { label: "Fiches paie", href: "/admin/payslips", icon: "Wallet" },
    { label: "Contrats", href: "/planning/employees", icon: "FileSignature" },
    { label: "Candidats", href: "/rh/candidates", icon: "UserCheck" },
    { label: "Mails envoyés", href: "/rh/mails", icon: "Mail" },
    { label: "Nouveau mail", href: "/rh/mails/new", icon: "Mail" },
    { label: "Screening RH", href: "/rh/screening", icon: "Activity" },
    { label: "Aujourd'hui", href: "/today", icon: "Zap" },
    { label: "Paramètres", href: "/admin/settings", icon: "Settings" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((a) => {
        const Icon = ICONS[a.icon] ?? Settings;
        return (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-2 p-2.5 min-h-[44px] rounded-xl bg-muted/40 hover:bg-muted active:bg-muted/80 active:scale-[0.98] transition-transform text-xs font-medium"
          >
            <Icon className="w-3.5 h-3.5 text-gold flex-shrink-0" />
            <span className="truncate">{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function StatsSalaires({ data }: { data: Record<string, unknown> }) {
  const total = ((data.total as number) ?? 0).toFixed(0);
  const unpaidTotal = ((data.unpaidTotal as number) ?? 0).toFixed(0);
  const unpaidCount = (data.unpaidCount as number) ?? 0;
  const totalCount = (data.totalCount as number) ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="text-xs text-ink-3">Total à payer ce mois</div>
        <div className="text-xl font-bold">{total} €</div>
        <div className="text-[10px] text-ink-3">{totalCount} fiches</div>
      </div>
      <div>
        <div className="text-xs text-ink-3">Restant à payer</div>
        <div className="text-xl font-bold text-red-600">{unpaidTotal} €</div>
        <div className="text-[10px] text-ink-3">{unpaidCount} en attente</div>
      </div>
    </div>
  );
}

function MailsPending({ data }: { data: Record<string, unknown> }) {
  const failed = (data.failed_count as number) ?? 0;
  return (
    <Link href="/rh/mails?status=failed" className="block">
      <div className="text-xs text-ink-3">Mails en échec</div>
      <div className="text-2xl font-bold text-red-600">{failed}</div>
    </Link>
  );
}

function CandidatesPending({ data }: { data: Record<string, unknown> }) {
  const n = (data.new_count as number) ?? 0;
  return (
    <Link href="/admin/candidates?status=new" className="block">
      <div className="text-xs text-ink-3">Nouveaux candidats</div>
      <div className="text-2xl font-bold">{n}</div>
    </Link>
  );
}

function TerminationsPending({ data }: { data: Record<string, unknown> }) {
  const list = (data.list as Array<{ id: string; requested_at: string; earliest_effective_date: string; employee?: { full_name: string } | null }>) ?? [];
  if (list.length === 0) return <div className="text-xs text-ink-3">Aucune demande en attente.</div>;
  return (
    <div className="space-y-1.5">
      {list.map((t) => (
        <Link key={t.id} href={`/planning/employees`} className="flex items-center justify-between gap-2 p-2 min-h-[44px] rounded-lg bg-amber-50 dark:bg-amber-900/20 active:scale-[0.98] transition-transform text-xs">
          <span className="font-medium">{t.employee?.full_name ?? "—"}</span>
          <span className="text-[10px] text-ink-3">min {t.earliest_effective_date}</span>
        </Link>
      ))}
    </div>
  );
}

// ──────── Helpers ────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-ink-3 mt-0.5">{label}</div>
    </div>
  );
}

function AlertLine({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-2 p-2 min-h-[44px] rounded-lg bg-muted/40 active:bg-muted active:scale-[0.98] transition-transform text-xs">
      <span className="truncate">{label}</span>
      <span className={`font-bold tabular-nums ${value > 0 ? "text-red-600" : "text-ink-3"}`}>{value}</span>
    </Link>
  );
}

// ──────── Customizer ────────

function Customizer({ prefs, onClose }: { prefs: UserPrefs; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Array<{ id: WidgetId; enabled: boolean; order: number; label: string; description: string }>>(
    WIDGETS_CATALOG.map((w) => {
      const stored = prefs.widgets?.find((x) => x.id === w.id);
      return {
        id: w.id,
        enabled: stored?.enabled ?? w.defaultEnabled,
        order: stored?.order ?? w.defaultOrder,
        label: w.label,
        description: w.description,
      };
    }).sort((a, b) => a.order - b.order),
  );

  function toggle(id: WidgetId) {
    setState((s) => s.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));
  }
  function move(id: WidgetId, dir: -1 | 1) {
    setState((s) => {
      const idx = s.findIndex((x) => x.id === id);
      const targetIdx = idx + dir;
      if (idx < 0 || targetIdx < 0 || targetIdx >= s.length) return s;
      const next = [...s];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      // Re-affecte order selon nouvelle position
      return next.map((x, i) => ({ ...x, order: i + 1 }));
    });
  }

  function save() {
    startTransition(async () => {
      const widgets = state.map((x) => ({ id: x.id, enabled: x.enabled, order: x.order }));
      const res = await updateMobileDashboardPrefsAction({ ...prefs, widgets });
      if (res.ok) {
        toast.success("Préférences enregistrées");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "Erreur");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-line px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm">Personnaliser</h2>
            <p className="text-[10px] text-ink-3">Active/ordonne les blocs visibles</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-2 min-h-[44px] rounded-full bg-muted active:scale-95 transition-transform">Annuler</button>
        </div>

        <div className="p-3 space-y-2">
          {state.map((w, i) => (
            <div key={w.id} className={`flex items-center gap-2 p-2.5 rounded-xl border ${w.enabled ? "border-gold/40 bg-gold/5" : "border-line bg-muted/20"}`}>
              <button
                onClick={() => toggle(w.id)}
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${w.enabled ? "bg-gold text-white" : "bg-muted"}`}
              >
                {w.enabled ? <Check className="w-4 h-4" /> : null}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{w.label}</div>
                <div className="text-[10px] text-ink-3 truncate">{w.description}</div>
              </div>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => move(w.id, -1)} disabled={i === 0} className="px-1.5 py-0.5 text-xs rounded bg-muted disabled:opacity-30">↑</button>
                <button onClick={() => move(w.id, 1)} disabled={i === state.length - 1} className="px-1.5 py-0.5 text-xs rounded bg-muted disabled:opacity-30">↓</button>
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-line p-3 pb-safe">
          <button
            onClick={save}
            disabled={pending}
            className="w-full bg-foreground text-background font-semibold py-3 min-h-[44px] rounded-xl text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
