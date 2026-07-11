import "server-only";

// Karim 2026-07-11 : audit GLOBAL des cartes d'identité des travailleurs courants.
// Contrôle, à partir des données de fiche + documents : présence de la CI, date de
// naissance / ÂGE (mineurs), nationalité + DROIT AU TRAVAIL (UE/hors-UE), VALIDITÉ
// du titre de séjour (expiré / expirant). Produit un résultat agrégé -> UNE seule
// notification admin (voir id-audit-actions).

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeWorkAuthorization } from "@/lib/work-authorization";

export type IdAuditIssue = { employeeId: string; name: string; problems: string[] };

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
  };
};

function ageFrom(bd: string | null | undefined, today: string): number | null {
  if (!bd) return null;
  const [y, m, d] = bd.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

export async function runIdCardAudit(admin: SupabaseClient): Promise<IdAuditResult> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });

  // Employés COURANTS (pas encore sortis).
  const { data: empsRaw } = await admin
    .from("employees")
    .select(
      "id, full_name, birth_date, nationality, residence_doc_type, residence_doc_expiry, work_authorization, end_date",
    )
    .or(`end_date.is.null,end_date.gte.${today}`);
  const emps = ((empsRaw ?? []) as Array<{
    id: string;
    full_name: string | null;
    birth_date: string | null;
    nationality: string | null;
    residence_doc_type: string | null;
    residence_doc_expiry: string | null;
    work_authorization: string | null;
    end_date: string | null;
  }>);

  // Cartes d'identité présentes (documents kind='id_card').
  const withIdCard = new Set<string>();
  if (emps.length) {
    const { data: docsRaw } = await admin
      .from("documents")
      .select("employee_id")
      .eq("kind", "id_card")
      .in("employee_id", emps.map((e) => e.id));
    for (const d of (docsRaw ?? []) as Array<{ employee_id: string | null }>) {
      if (d.employee_id) withIdCard.add(d.employee_id);
    }
  }

  const counts = {
    missingIdCard: 0,
    missingBirthDate: 0,
    minors: 0,
    missingNationality: 0,
    workAuthToVerify: 0,
    expiredOrExpiring: 0,
  };
  const issues: IdAuditIssue[] = [];

  for (const e of emps) {
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

    if (problems.length) issues.push({ employeeId: e.id, name: e.full_name ?? "?", problems });
  }

  return { checked: emps.length, okCount: emps.length - issues.length, issues, counts };
}

/** Corps texte de la notif/mail à partir du résultat. */
export function formatIdAuditBody(res: IdAuditResult): string {
  const c = res.counts;
  const header =
    `Contrôle de ${res.checked} travailleur(s) courant(s) : ${res.okCount} OK, ${res.issues.length} à vérifier.\n` +
    `Résumé — ${c.missingIdCard} sans CI · ${c.expiredOrExpiring} titre expiré/expirant · ` +
    `${c.workAuthToVerify} droit au travail à vérifier (hors-UE) · ${c.minors} mineur(s) · ` +
    `${c.missingBirthDate} sans date de naissance · ${c.missingNationality} sans nationalité.`;
  const list = res.issues.map((i) => `• ${i.name} : ${i.problems.join(" ; ")}`).join("\n");
  return res.issues.length ? `${header}\n\n${list}` : `${header}\n\nAucun point à signaler. ✅`;
}
