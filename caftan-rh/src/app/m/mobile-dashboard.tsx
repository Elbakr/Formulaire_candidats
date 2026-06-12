"use client";

// Karim 2026-06-12 : refonte /m. Deux objectifs :
//   1) LISIBILITE — l'ancienne version utilisait des variantes `dark:` alors que
//      l'app n'a PAS de theme sombre (tokens texte non bascules) -> texte noir sur
//      fond noir en mode sombre iPhone. On verrouille en CLAIR (color-scheme light,
//      0 classe dark:, uniquement les tokens definis : ink/surface/canvas/line/gold
//      + accents success/info/danger/warn/violet).
//   2) BLOCS D'APPLICATION — infos cle en blocs "hero" + un lanceur de tuiles
//      colorees (icone + libelle + badge), facon ecran d'accueil, au lieu d'un
//      empilement de widgets "en vrac".
// La logique (prefs, periode, site, customizer) est inchangee.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, Clock, Calendar, AlertCircle, Zap, Wallet, Mail, UserCheck, Users,
  FileSignature, Settings, RefreshCw, Loader2, Check, LayoutGrid, ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { updateMobileDashboardPrefsAction } from "./actions";
import { WIDGETS_CATALOG, type WidgetId, type UserPrefs } from "./widgets-catalog";

const ICONS: Record<string, LucideIcon> = {
  Activity, Clock, Calendar, AlertCircle, Zap, Wallet, Mail, UserCheck, FileSignature,
};

// Accents disponibles (mappes sur les tokens definis dans globals.css)
type Accent = "success" | "info" | "danger" | "warn" | "violet" | "gold" | "ink";
const ACCENT_BG: Record<Accent, string> = {
  success: "bg-success-light", info: "bg-info-light", danger: "bg-danger-light",
  warn: "bg-warn-light", violet: "bg-violet-light", gold: "bg-gold-light", ink: "bg-surface-2",
};
const ACCENT_FG: Record<Accent, string> = {
  success: "text-success", info: "text-info", danger: "text-danger",
  warn: "text-warn", violet: "text-violet", gold: "text-gold-dark", ink: "text-ink-2",
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

  function persist(p: "day" | "week" | "month", s: string | null) {
    startTransition(async () => {
      const widgetsPrefs = WIDGETS_CATALOG.map((w) => {
        const cur = widgets.find((x) => x.id === w.id);
        return { id: w.id, enabled: !!cur, order: cur?.order ?? w.defaultOrder };
      });
      await updateMobileDashboardPrefsAction({ widgets: widgetsPrefs, period: p, site_filter: s });
      router.refresh();
    });
  }
  function updatePeriod(p: "day" | "week" | "month") { setPeriod(p); persist(p, siteFilter); }
  function updateSiteFilter(s: string | null) { setSiteFilter(s); persist(period, s); }

  // ── Infos cle (hero) derivees des data chargees ──
  const pl = (data.pointage_live ?? {}) as Record<string, number>;
  const hp = (data.heures_periode ?? {}) as Record<string, number>;
  const al = (data.alerts ?? {}) as Record<string, number>;
  const alertsTotal = ((al.screening_pending ?? 0) + (al.reinforcement_pending ?? 0) + (al.terminations_pending ?? 0)) as number;
  const hasPresence = data.pointage_live != null;
  const hasHeures = data.heures_periode != null;
  const hasAlerts = data.alerts != null;

  // ── Badges du lanceur (si data dispo) ──
  const candNew = ((data.candidates_pending as Record<string, number> | undefined)?.new_count) ?? 0;
  const mailsFailed = ((data.mails_pending as Record<string, number> | undefined)?.failed_count) ?? 0;
  const screeningN = (al.screening_pending ?? 0) as number;

  const APPS: Array<{ label: string; href: string; icon: LucideIcon; accent: Accent; badge?: number }> = [
    { label: "Pointage", href: "/admin/presence", icon: Activity, accent: "success", badge: hasPresence ? pl.present : undefined },
    { label: "Planning", href: "/planning/calendar", icon: Calendar, accent: "info" },
    { label: "Employés", href: "/planning/employees", icon: Users, accent: "violet" },
    { label: "Candidats", href: "/rh/candidates", icon: UserCheck, accent: "gold", badge: candNew },
    { label: "Fiches paie", href: "/admin/payslips", icon: Wallet, accent: "success" },
    { label: "Mails", href: "/rh/mails", icon: Mail, accent: "info", badge: mailsFailed },
    { label: "Screening", href: "/rh/screening", icon: ClipboardCheck, accent: "warn", badge: screeningN },
    { label: "Centre RH", href: "/rh/hub", icon: LayoutGrid, accent: "gold" },
    { label: "Aujourd'hui", href: "/today", icon: Zap, accent: "warn" },
    { label: "Réglages", href: "/admin/settings", icon: Settings, accent: "ink" },
  ];

  // Cartes detail : widgets actifs sauf quick_actions (remplace par le lanceur)
  const detailWidgets = widgets.filter((w) => w.id !== "quick_actions");

  return (
    <div
      style={{ colorScheme: "light" }}
      className="min-h-screen min-h-screen-mobile bg-canvas text-ink pb-safe overscroll-none"
    >
      {/* Header clair */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-surface/90 border-b border-line px-4 py-3 pt-safe px-safe">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight text-ink">CaftanRH</h1>
            <p className="text-[11px] text-ink-3 truncate max-w-[200px]">Bonjour, {profileName}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => router.refresh()}
              disabled={pending}
              aria-label="Rafraîchir"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 active:bg-line active:scale-95 transition-transform"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setShowCustomizer(true)}
              aria-label="Personnaliser"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 active:bg-line active:scale-95 transition-transform"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-thin">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => updatePeriod(p)}
              className={`px-3 py-2 min-h-[44px] text-[11px] rounded-full font-semibold whitespace-nowrap active:scale-95 transition-transform ${
                period === p ? "bg-ink text-canvas" : "bg-surface-2 text-ink-2 border border-line"
              }`}
            >
              {p === "day" ? "Aujourd'hui" : p === "week" ? "7j" : "30j"}
            </button>
          ))}
          <span className="text-ink-3 text-[10px] mx-1">·</span>
          <button
            onClick={() => updateSiteFilter(null)}
            className={`px-3 py-2 min-h-[44px] text-[11px] rounded-full font-semibold whitespace-nowrap active:scale-95 transition-transform ${
              !siteFilter ? "bg-ink text-canvas" : "bg-surface-2 text-ink-2 border border-line"
            }`}
          >
            Tous sites
          </button>
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => updateSiteFilter(s.id)}
              className={`px-3 py-2 min-h-[44px] text-[11px] rounded-full font-semibold whitespace-nowrap active:scale-95 transition-transform ${
                siteFilter === s.id ? "bg-ink text-canvas" : "bg-surface-2 text-ink-2 border border-line"
              }`}
            >
              {s.code}
            </button>
          ))}
        </div>
      </header>

      <main className="px-3 py-3 space-y-4">
        {/* ── Blocs info cle ── */}
        {(hasPresence || hasHeures || hasAlerts) && (
          <div className="grid grid-cols-3 gap-2.5">
            {hasPresence && (
              <HeroBlock label="Présents" value={pl.present ?? 0} sub={`/ ${pl.total ?? 0}`} accent="success" />
            )}
            {hasHeures && (
              <HeroBlock label="Heures" value={Number((hp.totalHours ?? 0).toFixed(1))} sub="h" accent="gold" />
            )}
            {hasAlerts && (
              <HeroBlock label="Alertes" value={alertsTotal} accent={alertsTotal > 0 ? "danger" : "ink"} />
            )}
          </div>
        )}

        {/* ── Lanceur d'applications ── */}
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-3 px-1 mb-2">Accès rapide</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {APPS.map((a) => (
              <AppTile key={a.href} {...a} />
            ))}
          </div>
        </section>

        {/* ── Cartes detail (widgets actifs, customizables) ── */}
        {detailWidgets.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-3 px-1">Détails</h2>
            {detailWidgets.map((w) => (
              <WidgetCard key={w.id} widget={w} data={data[w.id]} period={period} />
            ))}
          </section>
        )}
      </main>

      {showCustomizer && <Customizer prefs={prefs} onClose={() => setShowCustomizer(false)} />}
    </div>
  );
}

// ────────────────────────── BLOCS ──────────────────────────

function HeroBlock({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent: Accent }) {
  return (
    <div className="rounded-2xl bg-surface border border-line shadow-sm p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${ACCENT_FG[accent]}`}>
        {value}{sub && <span className="text-xs text-ink-3 ml-0.5 font-medium">{sub}</span>}
      </div>
      <div className="text-[10px] text-ink-3 mt-0.5 font-semibold">{label}</div>
    </div>
  );
}

function AppTile({ label, href, icon: Icon, accent, badge }: {
  label: string; href: string; icon: LucideIcon; accent: Accent; badge?: number;
}) {
  return (
    <Link
      href={href}
      className="relative flex items-center gap-3 p-3 min-h-[64px] rounded-2xl bg-surface border border-line shadow-sm active:scale-[0.97] active:bg-surface-2 transition-transform"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${ACCENT_BG[accent]}`}>
        <Icon className={`w-5 h-5 ${ACCENT_FG[accent]}`} />
      </div>
      <span className="font-semibold text-sm text-ink truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
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
    <div className="bg-surface rounded-2xl shadow-sm border border-line overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
        <Icon className="w-4 h-4 text-gold-dark" />
        <h2 className="font-semibold text-sm text-ink">{widget.label}</h2>
      </div>
      <div className="p-4">
        {widget.id === "pointage_live" && <PointageLive data={d} />}
        {widget.id === "heures_periode" && <HeuresPeriode data={d} period={period} />}
        {widget.id === "planning_today" && <PlanningToday data={d} />}
        {widget.id === "alerts" && <Alerts data={d} />}
        {widget.id === "stats_salaires" && <StatsSalaires data={d} />}
        {widget.id === "mails_pending" && <MailsPending data={d} />}
        {widget.id === "candidates_pending" && <CandidatesPending data={d} />}
        {widget.id === "terminations_pending" && <TerminationsPending data={d} />}
      </div>
    </div>
  );
}

// ────────────────────────── WIDGETS (clair) ──────────────────────────

function PointageLive({ data }: { data: Record<string, unknown> }) {
  const total = (data.total as number) ?? 0;
  const present = (data.present as number) ?? 0;
  const done = (data.done as number) ?? 0;
  const upcoming = (data.upcoming as number) ?? 0;
  const bySite = (data.bySite as Array<{ code: string; name: string; color: string; count: number }>) ?? [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Présents" value={present} color="text-success" />
        <Stat label="À venir" value={upcoming} color="text-info" />
        <Stat label="Terminés" value={done} color="text-ink-3" />
        <Stat label="Planifié" value={total} color="text-ink" />
      </div>
      {bySite.length > 0 && (
        <div className="border-t border-line pt-2 space-y-1">
          <div className="text-[10px] text-ink-3 font-semibold">Par site (présents)</div>
          {bySite.map((s) => (
            <div key={s.code} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="flex-1 truncate text-ink-2">{s.name}</span>
              <span className="font-bold tabular-nums text-ink">{s.count}</span>
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
      <div className="text-3xl font-bold text-ink">{hours}<span className="text-base text-ink-3 ml-1">h</span></div>
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
          <span className="flex-1 truncate font-medium text-ink-2">{s.employee?.full_name ?? "—"}</span>
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

function StatsSalaires({ data }: { data: Record<string, unknown> }) {
  const total = ((data.total as number) ?? 0).toFixed(0);
  const unpaidTotal = ((data.unpaidTotal as number) ?? 0).toFixed(0);
  const unpaidCount = (data.unpaidCount as number) ?? 0;
  const totalCount = (data.totalCount as number) ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="text-xs text-ink-3">Total à payer ce mois</div>
        <div className="text-xl font-bold text-ink">{total} €</div>
        <div className="text-[10px] text-ink-3">{totalCount} fiches</div>
      </div>
      <div>
        <div className="text-xs text-ink-3">Restant à payer</div>
        <div className="text-xl font-bold text-danger">{unpaidTotal} €</div>
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
      <div className="text-2xl font-bold text-danger">{failed}</div>
    </Link>
  );
}

function CandidatesPending({ data }: { data: Record<string, unknown> }) {
  const n = (data.new_count as number) ?? 0;
  return (
    <Link href="/admin/candidates?status=new" className="block">
      <div className="text-xs text-ink-3">Nouveaux candidats</div>
      <div className="text-2xl font-bold text-ink">{n}</div>
    </Link>
  );
}

function TerminationsPending({ data }: { data: Record<string, unknown> }) {
  const list = (data.list as Array<{ id: string; requested_at: string; earliest_effective_date: string; employee?: { full_name: string } | null }>) ?? [];
  if (list.length === 0) return <div className="text-xs text-ink-3">Aucune demande en attente.</div>;
  return (
    <div className="space-y-1.5">
      {list.map((t) => (
        <Link key={t.id} href={`/planning/employees`} className="flex items-center justify-between gap-2 p-2 min-h-[44px] rounded-lg bg-warn-light active:scale-[0.98] transition-transform text-xs">
          <span className="font-medium text-ink">{t.employee?.full_name ?? "—"}</span>
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
    <Link href={href} className="flex items-center justify-between gap-2 p-2 min-h-[44px] rounded-lg bg-surface-2 active:scale-[0.98] transition-transform text-xs">
      <span className="truncate text-ink-2">{label}</span>
      <span className={`font-bold tabular-nums ${value > 0 ? "text-danger" : "text-ink-3"}`}>{value}</span>
    </Link>
  );
}

// ──────── Customizer (clair) ────────

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
    <div style={{ colorScheme: "light" }} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-surface w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-line px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm text-ink">Personnaliser</h2>
            <p className="text-[10px] text-ink-3">Active/ordonne les blocs de détail</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-2 min-h-[44px] rounded-full bg-surface-2 text-ink-2 active:scale-95 transition-transform">Annuler</button>
        </div>

        <div className="p-3 space-y-2">
          {state.map((w, i) => (
            <div key={w.id} className={`flex items-center gap-2 p-2.5 rounded-xl border ${w.enabled ? "border-gold/50 bg-gold-light" : "border-line bg-surface-2"}`}>
              <button
                onClick={() => toggle(w.id)}
                aria-label={w.enabled ? "Désactiver" : "Activer"}
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${w.enabled ? "bg-gold text-white" : "bg-line text-ink-3"}`}
              >
                {w.enabled ? <Check className="w-4 h-4" /> : null}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-ink">{w.label}</div>
                <div className="text-[10px] text-ink-3 truncate">{w.description}</div>
              </div>
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button onClick={() => move(w.id, -1)} disabled={i === 0} aria-label="Monter" className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-ink-2 disabled:opacity-30">↑</button>
                <button onClick={() => move(w.id, 1)} disabled={i === state.length - 1} aria-label="Descendre" className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-ink-2 disabled:opacity-30">↓</button>
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-line p-3 pb-safe">
          <button
            onClick={save}
            disabled={pending}
            className="w-full bg-ink text-canvas font-semibold py-3 min-h-[44px] rounded-xl text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
