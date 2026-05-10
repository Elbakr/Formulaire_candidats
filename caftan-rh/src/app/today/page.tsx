import Link from "next/link";
import {
  AlertCircle, Mail, FileText, Calendar, Users, Briefcase,
  Sparkles, CheckCircle2, ArrowRight, Clock, UserCheck, Activity,
  Building2, ShieldAlert,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { EmployeeQuickLink } from "@/components/employee-quick-link";
import { formatDateTime, formatDate } from "@/lib/utils";
import { countWeekOverages } from "@/lib/quotas";
import { loadSeasonalEvents, pickActiveSeasonalForToday } from "@/lib/seasonal";

/**
 * Vue "Aujourd'hui" — la liste opérationnelle de ce que le patron / RH / manager
 * doit traiter dans la journée. Conçue pour être consultée 1-3 fois par jour
 * en début / milieu / fin de journée.
 */
export default async function TodayPage() {
  const { profile } = await requireRole(["admin", "rh", "manager"]);
  const supabase = await createClient();

  const todayISO = new Date().toISOString().split("T")[0];
  const tomorrowISO = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
  const in3DaysISO = new Date(Date.now() + 3 * 86_400_000).toISOString().split("T")[0];
  const in7DaysISO = new Date(Date.now() + 7 * 86_400_000).toISOString().split("T")[0];
  const in60DaysISO = new Date(Date.now() + 60 * 86_400_000).toISOString().split("T")[0];
  const yesterdayISO = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

  // Parallel fetch all metrics
  const [
    { count: newCandidates },
    { count: pendingActions },
    { count: criticalAnomalies },
    { count: warningAnomalies },
    { count: pendingTimeOff },
    { count: pendingDocs },
    { count: unmatchedEmails },
    { data: todayInterviews },
    { data: tomorrowInterviews },
    { data: trialEndingSoon },
    { data: ackPendingCandidates },
    { data: latestUnreadInbound },
    { data: upcomingHolidays },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .gte("created_at", yesterdayISO),
    supabase
      .from("agent_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "proposed"),
    supabase
      .from("anomaly_flags")
      .select("id", { count: "exact", head: true })
      .eq("severity", "critical")
      .is("resolved_at", null),
    supabase
      .from("anomaly_flags")
      .select("id", { count: "exact", head: true })
      .eq("severity", "warning")
      .is("resolved_at", null),
    supabase
      .from("time_off_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("validation_status", "pending"),
    supabase
      .from("inbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", "unmatched"),
    supabase
      .from("interviews")
      .select(`id, scheduled_at, type, location, status,
               application:applications(id, candidate:candidates(id, full_name, email, phone))`)
      .gte("scheduled_at", `${todayISO}T00:00:00`)
      .lt("scheduled_at", `${tomorrowISO}T00:00:00`)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("interviews")
      .select(`id, scheduled_at, type, location, status,
               application:applications(id, candidate:candidates(id, full_name, email, phone))`)
      .gte("scheduled_at", `${tomorrowISO}T00:00:00`)
      .lt("scheduled_at", `${in3DaysISO}T00:00:00`)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("employees")
      .select("id, full_name, job_title, trial_end_date, contract_type")
      .eq("status", "active")
      .gte("trial_end_date", todayISO)
      .lte("trial_end_date", in7DaysISO)
      .order("trial_end_date", { ascending: true })
      .limit(5),
    supabase
      .from("applications")
      .select(`id, status, created_at,
               candidate:candidates(id, full_name, email, applied_at)`)
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("inbound_emails")
      .select("id, from_email, from_name, subject, received_at, matched_application_id, status")
      .order("received_at", { ascending: false })
      .limit(5),
    // Fériés notables des 60 prochains jours (priority >= 2 : Aïd, Mawlid,
    // début Ramadan, fériés légaux). Pour anticiper l'organisation.
    supabase
      .from("holidays")
      .select("id, date, label, kind, priority, tradition")
      .eq("is_active", true)
      .gte("date", todayISO)
      .lte("date", in60DaysISO)
      .gte("priority", 2)
      .order("date", { ascending: true })
      .limit(5),
  ]);

  // Compte des employés en dépassement quota cette semaine — best-effort,
  // si la table shifts est trop lourde on tolère l'erreur.
  let weekOverages = 0;
  try {
    weekOverages = await countWeekOverages();
  } catch {
    weekOverages = 0;
  }

  // Saisonnalité événementielle en cours (Soldes / Ramadan / Aïd / Noël …)
  // → bandeau d'info + recommandation effectif.
  let seasonalToday: Awaited<ReturnType<typeof pickActiveSeasonalForToday>> = null;
  try {
    const seasonalList = await loadSeasonalEvents(todayISO, todayISO);
    seasonalToday = pickActiveSeasonalForToday(seasonalList, todayISO);
  } catch {
    seasonalToday = null;
  }

  // Dimona urgentes — employés démarrant aujourd'hui ou demain sans dimona
  // déclarée. Bloc top-of-page si > 0.
  const { data: dimonaCandRaw } = await supabase
    .from("employees")
    .select("id, full_name, start_date, status")
    .eq("status", "active")
    .gte("start_date", todayISO)
    .lte("start_date", tomorrowISO);
  type DimonaCand = {
    id: string;
    full_name: string;
    start_date: string;
  };
  const dimonaCands = (dimonaCandRaw ?? []) as DimonaCand[];
  let dimonaUrgent: DimonaCand[] = [];
  if (dimonaCands.length > 0) {
    const { data: declared } = await supabase
      .from("dimona_declarations")
      .select("employee_id, start_date, status")
      .in(
        "employee_id",
        dimonaCands.map((e) => e.id),
      )
      .in("status", ["declared_onss", "confirmed"]);
    const declaredKey = new Set(
      ((declared ?? []) as Array<{
        employee_id: string;
        start_date: string;
      }>).map((d) => `${d.employee_id}::${d.start_date}`),
    );
    dimonaUrgent = dimonaCands.filter(
      (e) => !declaredKey.has(`${e.id}::${e.start_date}`),
    );
  }

  const interviews = (todayInterviews ?? []) as unknown as Array<{
    id: string; scheduled_at: string; type: string; location: string | null; status: string;
    application: { id: string; candidate: { id: string; full_name: string; email: string; phone: string | null } | null } | null;
  }>;
  const interviewsTomorrow = (tomorrowInterviews ?? []) as unknown as typeof interviews;
  const trials = (trialEndingSoon ?? []) as unknown as Array<{
    id: string; full_name: string; job_title: string | null; trial_end_date: string; contract_type: string | null;
  }>;
  const acks = (ackPendingCandidates ?? []) as unknown as Array<{
    id: string; status: string; created_at: string;
    candidate: { id: string; full_name: string; email: string; applied_at: string } | null;
  }>;
  const latestEmails = (latestUnreadInbound ?? []) as Array<{
    id: string; from_email: string; from_name: string | null; subject: string | null;
    received_at: string; matched_application_id: string | null; status: string;
  }>;
  const holidays = (upcomingHolidays ?? []) as Array<{
    id: string; date: string; label: string;
    kind: "legal" | "school_break" | "company_closure" | "event_other" | "religious" | "international";
    priority: number | null;
    tradition: string | null;
  }>;

  const totalUrgent =
    (criticalAnomalies ?? 0) +
    (interviews.length) +
    (pendingActions ?? 0);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bonjour";
    if (h < 18) return "Bon après-midi";
    return "Bonsoir";
  })();

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">
          {greeting}, {profile.full_name?.split(" ")[0] ?? "patron"} 👋
        </h1>
        <p className="text-sm text-ink-2 mt-1">
          {totalUrgent === 0
            ? "Tout est sous contrôle. Profite de ta journée."
            : `${totalUrgent} chose${totalUrgent > 1 ? "s" : ""} requièrent ton attention aujourd'hui.`}
        </p>
      </div>

      {dimonaUrgent.length > 0 ? (
        <Card className="border-l-4 border-l-danger">
          <div className="p-3 sm:p-4 flex items-start gap-3 flex-wrap">
            <ShieldAlert className="h-5 w-5 text-danger shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider font-bold text-danger mb-1">
                🚨 Dimona urgentes — démarrage imminent
              </div>
              <div className="text-sm">
                {dimonaUrgent.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 ? ", " : ""}
                    <Link
                      href={`/planning/employees/${e.id}/dimona`}
                      className="font-bold text-danger hover:underline"
                    >
                      {e.full_name}
                    </Link>
                    <span className="text-ink-3 text-xs">
                      {" "}
                      ({new Date(e.start_date + "T00:00:00").toLocaleDateString(
                        "fr-BE",
                        { weekday: "short", day: "2-digit", month: "short" },
                      )})
                    </span>
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-ink-3 mt-1">
                Si pas déclarée AVANT 8h le jour J, l'ONSS peut amender. Clique
                sur le nom pour ouvrir la checklist.
              </div>
            </div>
            {dimonaUrgent.length === 1 ? (
              <Button asChild variant="gold" size="sm">
                <Link href={`/planning/employees/${dimonaUrgent[0].id}/dimona`}>
                  Ouvrir checklist
                </Link>
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {seasonalToday ? (
        <Card
          className={`border-l-4 ${
            seasonalToday.kind === "peak"
              ? "border-l-rose-500"
              : seasonalToday.kind === "low"
                ? "border-l-sky-500"
                : "border-l-ink-3"
          }`}
        >
          <div className="p-3 sm:p-4 flex items-start gap-3 flex-wrap">
            <Sparkles
              className={`h-5 w-5 shrink-0 mt-0.5 ${
                seasonalToday.kind === "peak"
                  ? "text-rose-500"
                  : seasonalToday.kind === "low"
                    ? "text-sky-500"
                    : "text-ink-3"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider font-bold text-ink-3 mb-1">
                {seasonalToday.kind === "peak"
                  ? "Pic saisonnier en cours"
                  : seasonalToday.kind === "low"
                    ? "Période creuse"
                    : "Fermeture saisonnière"}
              </div>
              <div className="text-sm">
                <span className="font-bold">{seasonalToday.name}</span>
                <span className="text-ink-3">
                  {" "}— jusqu'au {formatDate(seasonalToday.end_date)}
                </span>
              </div>
              {seasonalToday.kind === "peak" &&
              (seasonalToday.staff_multiplier ?? 1) > 1 ? (
                <div className="text-xs text-ink-2 mt-1">
                  Recommandation : <strong>renforcer effectif ×{(seasonalToday.staff_multiplier ?? 1).toFixed(2)}</strong>
                  {" "}sur les boutiques. Le solver applique automatiquement le multiplier
                  pendant la génération de planning.
                </div>
              ) : null}
              {seasonalToday.notes ? (
                <div className="text-[11px] text-ink-3 mt-1">{seasonalToday.notes}</div>
              ) : null}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/seasonal">Gérer</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {holidays.length > 0 ? (
        <Card className="border-l-4 border-l-emerald-500">
          <div className="p-3 flex items-start gap-3">
            <Calendar className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider font-bold text-ink-3 mb-1">
                À anticiper — fériés &amp; fêtes (60 j)
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {holidays.map((h) => {
                  const days = Math.round(
                    (new Date(h.date).getTime() - Date.now()) / 86_400_000,
                  );
                  const tone =
                    h.kind === "legal"
                      ? "text-red-700"
                      : h.tradition === "islamic"
                        ? "text-emerald-700"
                        : h.tradition === "jewish"
                          ? "text-indigo-700"
                          : h.kind === "international"
                            ? "text-sky-700"
                            : "text-cyan-700";
                  return (
                    <li key={h.id} className={`flex items-center gap-1.5 ${tone}`}>
                      <span className="font-mono text-[11px] text-ink-3">
                        {new Date(h.date).toLocaleDateString("fr-BE", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <span className="font-bold">{h.label}</span>
                      <span className="text-[10px] text-ink-3">
                        ({days <= 0 ? "aujourd'hui" : `J-${days}`})
                      </span>
                      {(h.priority ?? 0) >= 3 ? (
                        <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-px rounded bg-current text-white opacity-80">
                          Critique
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      {/* KPI strip — 8 indicateurs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile
          icon={Users} label="Candidatures (24h)" value={newCandidates ?? 0}
          href="/rh/candidates" tone="info"
        />
        <KpiTile
          icon={Sparkles} label="Actions IA en attente" value={pendingActions ?? 0}
          href="/rh/inbox" tone={(pendingActions ?? 0) > 0 ? "gold" : "neutral"}
        />
        <KpiTile
          icon={AlertCircle} label="Anomalies critiques" value={criticalAnomalies ?? 0}
          href="/admin/anomalies" tone={(criticalAnomalies ?? 0) > 0 ? "danger" : "neutral"}
        />
        <KpiTile
          icon={AlertCircle} label="Anomalies warning" value={warningAnomalies ?? 0}
          href="/admin/anomalies" tone={(warningAnomalies ?? 0) > 0 ? "warn" : "neutral"}
        />
        <KpiTile
          icon={Calendar} label="Congés à valider" value={pendingTimeOff ?? 0}
          href="/planning/time-off" tone={(pendingTimeOff ?? 0) > 0 ? "warn" : "neutral"}
        />
        <KpiTile
          icon={FileText} label="Documents à valider" value={pendingDocs ?? 0}
          href="/admin/documents" tone={(pendingDocs ?? 0) > 5 ? "warn" : "neutral"}
        />
        <KpiTile
          icon={Mail} label="Emails à attribuer" value={unmatchedEmails ?? 0}
          href="/rh/messages/unmatched" tone={(unmatchedEmails ?? 0) > 0 ? "warn" : "neutral"}
        />
        <KpiTile
          icon={UserCheck} label="Fins d'essai (7j)" value={trials.length}
          href="/admin/cockpit" tone={trials.length > 0 ? "warn" : "neutral"}
        />
        <KpiTile
          icon={Activity} label="Quotas dépassés (sem)" value={weekOverages}
          href="/planning/quotas" tone={weekOverages > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Entretiens du jour */}
        <Card>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gold-dark" />
              Entretiens aujourd'hui
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/rh/agenda">Agenda <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
          {interviews.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Aucun entretien programmé aujourd'hui.</div>
          ) : (
            <ul className="divide-y divide-line">
              {interviews.map((iv) => {
                const cand = iv.application?.candidate;
                return (
                  <li key={iv.id}>
                    <Link
                      href={iv.application ? `/rh/candidates/${iv.application.id}` : "#"}
                      className="block p-3 hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 text-center">
                          <div className="font-mono font-bold text-base">
                            {new Date(iv.scheduled_at).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div className="text-[10px] text-ink-3 uppercase">{iv.type}</div>
                        </div>
                        <NameAvatar name={cand?.full_name ?? "?"} className="h-8 w-8 text-[10px]" />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{cand?.full_name ?? "—"}</div>
                          <div className="text-xs text-ink-3 truncate">
                            {iv.location ?? "—"}
                            {cand?.phone ? ` · ${cand.phone}` : ""}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {interviewsTomorrow.length > 0 ? (
            <details className="border-t border-line">
              <summary className="p-3 text-xs font-bold cursor-pointer hover:bg-surface-2 select-none">
                + {interviewsTomorrow.length} demain
              </summary>
              <ul className="divide-y divide-line">
                {interviewsTomorrow.map((iv) => {
                  const cand = iv.application?.candidate;
                  return (
                    <li key={iv.id} className="px-3 py-2 text-xs">
                      <span className="font-mono font-bold">{formatDateTime(iv.scheduled_at)}</span>
                      <span className="text-ink-3"> · </span>
                      <span>{cand?.full_name ?? "—"}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
        </Card>

        {/* Candidats récents à appeler */}
        <Card>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-gold-dark" />
              À appeler / contacter
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/rh/candidates?status=new">Tous <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
          {acks.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Aucun nouveau candidat à traiter.</div>
          ) : (
            <ul className="divide-y divide-line">
              {acks.map((a) => (
                <li key={a.id}>
                  <Link href={`/rh/candidates/${a.id}`} className="block p-3 hover:bg-surface-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <NameAvatar name={a.candidate?.full_name ?? "?"} className="h-8 w-8 text-[10px]" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{a.candidate?.full_name ?? "—"}</div>
                        <div className="text-xs text-ink-3 truncate">
                          {a.candidate?.email}
                          {a.candidate?.applied_at ? ` · postulé ${formatDate(a.candidate.applied_at)}` : ""}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-info-light text-info">
                        Nouveau
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Fins d'essai */}
        {trials.length > 0 ? (
          <Card>
            <div className="p-4 border-b border-line">
              <h2 className="font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-warn" />
                Fins de période d'essai
              </h2>
              <p className="text-xs text-ink-3 mt-0.5">Décide avant la date pour ne pas être pris au dépourvu.</p>
            </div>
            <ul className="divide-y divide-line">
              {trials.map((e) => (
                <li key={e.id} className="p-3 hover:bg-surface-2 transition-colors">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-4 w-4 text-warn shrink-0" />
                    <div className="flex-1 min-w-0">
                      <EmployeeQuickLink
                        employeeId={e.id}
                        fullName={e.full_name}
                        variant="block"
                        fullWidth
                        subtitle={
                          <>
                            {e.contract_type ?? "—"} · fin essai <strong>{formatDate(e.trial_end_date)}</strong>
                          </>
                        }
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Latest inbound emails */}
        <Card>
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              <Mail className="h-4 w-4 text-gold-dark" />
              Derniers emails entrants
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/rh/messages">Messagerie <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
          {latestEmails.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-3">Aucun email entrant.</div>
          ) : (
            <ul className="divide-y divide-line">
              {latestEmails.map((e) => (
                <li key={e.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold truncate">{e.from_name ?? e.from_email}</span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full ${e.status === "matched" ? "bg-success-light text-success" : "bg-warn-light text-warn"}`}>
                      {e.status === "matched" ? "Lié" : "À attribuer"}
                    </span>
                    <span className="text-[11px] text-ink-3 ml-auto">{formatDateTime(e.received_at)}</span>
                  </div>
                  <div className="text-xs text-ink-2 truncate mt-0.5">{e.subject ?? "(sans sujet)"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Liens rapides */}
      <Card>
        <div className="p-4 border-b border-line">
          <h2 className="font-bold">Raccourcis</h2>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <Quick href="/planning/calendar" label="Planning" icon={Calendar} />
          <Quick href="/planning/all-sites" label="Vue ensemble magasins" icon={Building2} />
          <Quick href="/rh/candidates" label="Candidats" icon={Users} />
          <Quick href="/rh/inbox" label="Inbox IA" icon={Sparkles} />
          <Quick href="/admin/cockpit" label="Cockpit" icon={Briefcase} />
          <Quick href="/admin/analytics" label="Analytics" icon={Briefcase} />
          <Quick href="/admin/documents" label="Documents" icon={FileText} />
          <Quick href="/admin/anomalies" label="Anomalies" icon={AlertCircle} />
          <Quick href="/rh/templates" label="Templates" icon={Mail} />
        </div>
      </Card>

      {totalUrgent === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-2" />
          <p className="text-sm text-ink-2">Aucune action urgente. Tu peux te concentrer sur le stratégique.</p>
        </div>
      ) : null}
    </div>
  );
}

type Tone = "info" | "warn" | "danger" | "success" | "gold" | "neutral";

function KpiTile({
  icon: Icon, label, value, href, tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; href?: string; tone?: Tone;
}) {
  const cls = {
    info: "bg-info-light/40 border-info-light",
    warn: "bg-warn-light/60 border-warn-light",
    danger: "bg-danger-light/60 border-danger-light",
    success: "bg-success-light/40 border-success-light",
    gold: "bg-gold-light border-gold",
    neutral: "bg-surface border-line",
  }[tone];
  const content = (
    <div className={`rounded-[var(--radius)] border p-3 hover:border-gold transition-colors ${cls}`}>
      <Icon className="h-4 w-4 text-ink-2 mb-1" />
      <div className="text-2xl font-extrabold font-mono leading-none">{value}</div>
      <div className="text-[10px] mt-1 uppercase tracking-wider font-bold text-ink-3 leading-tight">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function Quick({
  href, label, icon: Icon,
}: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-md border border-line hover:border-gold hover:bg-gold-light/30 transition-colors text-sm font-semibold"
    >
      <Icon className="h-4 w-4 text-ink-2" />
      {label}
    </Link>
  );
}
