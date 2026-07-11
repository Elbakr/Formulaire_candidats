import "server-only";

// Karim 2026-07-11 : audit GLOBAL des cartes d'identité — employés COURANTS ET
// candidats PRÉ-VALIDÉS. Contrôle, à partir des données de fiche + documents :
// présence de la CI, date de naissance / ÂGE (mineurs), nationalité + DROIT AU
// TRAVAIL (UE/hors-UE), VALIDITÉ du titre de séjour (expiré / expirant). Résultat
// agrégé -> UNE seule notification admin (voir id-audit-actions).

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeWorkAuthorization } from "@/lib/work-authorization";

export type SubjectKind = "employee" | "candidate";

export type IdAuditIssue = {
  subjectId: string;
  kind: SubjectKind;
  name: string;
  problems: string[];
};

export type IdAuditResult = {
  checked: number;
  okCount: number;
  issues: IdAuditIssue[];
  counts: {
    missingIdCard: number;
    missingBirthDate: number;
    minors: number;
    missingNationality: number;
    workAuthToVerify: number;
    expiredOrExpiring: number;
    postedToControl: number;
  };
};

type SubjectRow = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  nationality: string | null;
  residence_doc_type: string | null;
  residence_doc_expiry: string | null;
  posted_worker?: boolean | null; // employés uniquement (détaché)
};

function ageFrom(bd: string | null | undefined, today: string): number | null {
  if (!bd) return null;
  const [y, m, d] = bd.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

const SELECT = "id, full_name, birth_date, nationality, residence_doc_type, residence_doc_expiry";

/** Sujets à auditer d'un groupe : employés courants OU candidats pré-validés. */
async function gatherSubjects(
  admin: SupabaseClient,
  kind: SubjectKind,
  today: string,
): Promise<{ rows: SubjectRow[]; withIdCard: Set<string> }> {
  const idCol = kind === "employee" ? "employee_id" : "candidate_id";

  let rows: SubjectRow[] = [];
  if (kind === "employee") {
    const { data } = await admin
      .from("employees")
      .select(`${SELECT}, posted_worker, end_date`)
      .or(`end_date.is.null,end_date.gte.${today}`);
    rows = ((data ?? []) as Array<SubjectRow & { end_date: string | null }>).map(
      ({ end_date, ...r }) => r, // eslint-disable-line @typescript-eslint/no-unused-vars
    );
  } else {
    const { data } = await admin.from("candidates").select(SELECT).eq("prevalidated", true);
    rows = (data ?? []) as SubjectRow[];
  }

  const withIdCard = new Set<string>();
  if (rows.length) {
    const { data: docs } = await admin
      .from("documents")
      .select(idCol)
      .eq("kind", "id_card")
      .in(idCol, rows.map((r) => r.id));
    for (const d of (docs ?? []) as Array<Record<string, string | null>>) {
      const v = d[idCol];
      if (v) withIdCard.add(v);
    }
  }
  return { rows, withIdCard };
}

export async function runIdCardAudit(admin: SupabaseClient): Promise<IdAuditResult> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });

  const counts = {
    missingIdCard: 0,
    missingBirthDate: 0,
    minors: 0,
    missingNationality: 0,
    workAuthToVerify: 0,
    expiredOrExpiring: 0,
    postedToControl: 0,
  };
  const issues: IdAuditIssue[] = [];
  let checked = 0;

  for (const kind of ["employee", "candidate"] as const) {
    const { rows, withIdCard } = await gatherSubjects(admin, kind, today);
    checked += rows.length;

    for (const e of rows) {
      const problems: string[] = [];

      if (!withIdCard.has(e.id)) {
        problems.push("carte d'identité non déposée");
        counts.missingIdCard += 1;
      }

      if (!e.birth_date) {
        problems.push("date de naissance manquante");
        counts.missingBirthDate += 1;
      } else {
        const age = ageFrom(e.birth_date, today);
        if (age != null && age < 18) {
          problems.push(`MINEUR (${age} ans)`);
          counts.minors += 1;
        }
      }

      if (!e.nationality) {
        problems.push("nationalité manquante");
        counts.missingNationality += 1;
      } else {
        const wa = computeWorkAuthorization({
          nationality: e.nationality,
          docType: e.residence_doc_type,
          expiry: e.residence_doc_expiry,
          today,
        });
        if (wa.needsAdmin) {
          if (wa.status === "refuse" || (wa.daysToExpiry != null && wa.daysToExpiry < 0)) {
            problems.push("titre de séjour EXPIRÉ");
            counts.expiredOrExpiring += 1;
          } else if (wa.daysToExpiry != null && wa.daysToExpiry < 60) {
            problems.push(`titre de séjour expire dans ${wa.daysToExpiry} j`);
            counts.expiredOrExpiring += 1;
          } else {
            problems.push("droit au travail à vérifier (hors-UE)");
            counts.workAuthToVerify += 1;
          }
        }
      }

      // Travailleur détaché (employé) : Limosa + A1 à contrôler (vérif humaine).
      if (kind === "employee" && e.posted_worker) {
        problems.push("détaché : contrôler Limosa (L1) + certificat A1");
        counts.postedToControl += 1;
      }

      if (problems.length) {
        issues.push({ subjectId: e.id, kind, name: e.full_name ?? "?", problems });
      }
    }
  }

  return { checked, okCount: checked - issues.length, issues, counts };
}

/** Corps texte de la notif/mail à partir du résultat. */
export function formatIdAuditBody(res: IdAuditResult): string {
  const c = res.counts;
  const header =
    `Contrôle de ${res.checked} personne(s) (employés courants + candidats pré-validés) : ${res.okCount} OK, ${res.issues.length} à vérifier.\n` +
    `Résumé — ${c.missingIdCard} sans CI · ${c.expiredOrExpiring} titre expiré/expirant · ` +
    `${c.workAuthToVerify} droit au travail à vérifier (hors-UE) · ${c.postedToControl} détaché(s) Limosa/A1 · ` +
    `${c.minors} mineur(s) · ${c.missingBirthDate} sans date de naissance · ${c.missingNationality} sans nationalité.`;
  const list = res.issues
    .map((i) => `• ${i.name}${i.kind === "candidate" ? " (candidat)" : ""} : ${i.problems.join(" ; ")}`)
    .join("\n");
  return res.issues.length ? `${header}\n\n${list}` : `${header}\n\nAucun point à signaler. ✅`;
}
