// Karim 2026-06-13 : agrégateur "Centre d'actions urgentes" pour les dashboards
// RH. Remonte ce qui est urgent / en attente / a echeance, pour agir AVANT le
// terme. Chaque requete est best-effort (try/catch -> 0) pour ne jamais casser
// le dashboard si un schema differe.

type SupabaseLike = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type ActionSeverity = "critical" | "warn" | "info";

export type ActionItem = {
  key: string;
  label: string;
  count: number;
  link: string;
  icon: string; // nom lucide (resolu par NavIcon)
  severity: ActionSeverity;
  hint?: string;
};

const SEV_ORDER: Record<ActionSeverity, number> = { critical: 0, warn: 1, info: 2 };

async function safeCount(builder: Promise<{ count: number | null }>): Promise<number> {
  try {
    const { count } = await builder;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getUrgentActions(supabase: SupabaseLike): Promise<ActionItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon15 = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    cddEnding,
    preNoticeToSend,
    renewalResponded,
    anomalies,
    timeOffPending,
    terminationsPending,
    newCandidates,
    failedMails,
    dimonaPending,
  ] = await Promise.all([
    // CDD / Etudiant dont le contrat se termine sous 15 jours
    safeCount(
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .not("end_date", "is", null)
        .gte("end_date", today)
        .lte("end_date", horizon15)
        .or("contract_type.ilike.%CDD%,contract_type.ilike.%tudiant%"),
    ),
    // Pre-avis de renouvellement prepares mais pas encore envoyes
    safeCount(
      supabase.from("cdd_renewal_responses").select("id", { count: "exact", head: true }).is("sent_at", null),
    ),
    // Reponses de renouvellement recues (travailleur a repondu -> RH a examiner)
    safeCount(
      supabase.from("cdd_renewal_responses").select("id", { count: "exact", head: true }).not("responded_at", "is", null),
    ),
    // Pointages a corriger
    safeCount(
      supabase.from("clock_entries").select("id", { count: "exact", head: true }).eq("is_anomalous", true),
    ),
    // Conges en attente de validation
    safeCount(
      supabase.from("time_off_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ),
    // Ruptures de contrat a finaliser (lettre envoyee, signature en attente)
    safeCount(
      supabase.from("contract_terminations").select("id", { count: "exact", head: true }).eq("status", "sent_for_signature"),
    ),
    // Nouveaux candidats RECENTS a traiter (7 j) — le backlog complet reste via la tuile Candidats
    safeCount(
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "new").gte("created_at", sevenDaysAgo),
    ),
    // Mails en echec (7 derniers jours)
    safeCount(
      supabase.from("outbound_mails").select("id", { count: "exact", head: true }).eq("status", "failed").gte("sent_at", sevenDaysAgo),
    ),
    // Dimona en attente de validation (decision humaine obligatoire)
    safeCount(
      supabase.from("dimona_declarations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ),
  ]);

  const raw: ActionItem[] = [
    { key: "cdd_ending", label: "Contrats (CDD/Étudiant) à échéance < 15 j", count: cddEnding, link: "/admin/cdd-renewals", icon: "RefreshCw", severity: "critical", hint: "Décider du renouvellement avant le terme" },
    { key: "prenotice", label: "Pré-avis de renouvellement à envoyer", count: preNoticeToSend, link: "/admin/cdd-renewals", icon: "Mail", severity: "warn", hint: "Envoyer le mail au travailleur (1 clic)" },
    { key: "renewal_responses", label: "Réponses de renouvellement reçues", count: renewalResponded, link: "/admin/cdd-renewals", icon: "UserCheck", severity: "warn", hint: "Le travailleur a répondu — à examiner" },
    { key: "dimona", label: "Dimona à valider", count: dimonaPending, link: "/rh/dimona", icon: "FileText", severity: "critical", hint: "Déclaration ONSS — décision humaine" },
    { key: "anomalies", label: "Pointages à corriger", count: anomalies, link: "/admin/anomalies", icon: "AlertTriangle", severity: "warn" },
    { key: "timeoff", label: "Congés en attente", count: timeOffPending, link: "/planning/time-off", icon: "CalendarOff", severity: "warn" },
    { key: "terminations", label: "Ruptures à finaliser (signature)", count: terminationsPending, link: "/rh/terminations", icon: "FileSignature", severity: "warn" },
    { key: "new_candidates", label: "Nouveaux candidats (7 j)", count: newCandidates, link: "/rh/candidates?status=new", icon: "Users", severity: "info" },
    { key: "failed_mails", label: "Mails en échec (7 j)", count: failedMails, link: "/rh/mails?status=failed", icon: "Mail", severity: "warn" },
  ];

  return raw
    .filter((i) => i.count > 0)
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);
}
