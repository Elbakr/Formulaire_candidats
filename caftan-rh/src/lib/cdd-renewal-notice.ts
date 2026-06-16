// Karim 2026-06-13 : pre-avis de renouvellement (CDD + Etudiant).
//
// 15 jours avant la fin du contrat, on PREPARE un pre-avis (ligne
// cdd_renewal_responses avec token unique). RH l'envoie en 1 clic (ou auto si
// active). Le travailleur repond via une page /renewal/{token} : Oui/Non +
// dates de disponibilite + raison + appreciation.

import crypto from "node:crypto";
import { getOutboundBaseUrl } from "@/lib/public-base-url";
import { sendAppMail } from "@/lib/app-mail";

// Karim 2026-06-13 : lien externe -> jamais localhost/tunnel (cf. getOutboundBaseUrl).
const BASE_URL = getOutboundBaseUrl();

// admin client type laxiste (on reutilise createAdminClient du caller).
type Admin = {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export function newRenewalToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function buildRenewalEmail(fullName: string | null, endDateISO: string, token: string) {
  const first = (fullName ?? "").split(/\s+/)[0] ?? "";
  const dateFr = new Date(`${endDateISO}T12:00:00`).toLocaleDateString("fr-BE", {
    day: "numeric", month: "long", year: "numeric",
  });
  const link = `${BASE_URL}/renewal/${token}`;
  const subject = "Ton contrat chez Caftan Factory arrive à échéance 🙏";
  const body =
    `Bonjour ${first},\n\n` +
    `Ton contrat se termine le ${dateFr}. Nous avons été ravis de travailler avec toi !\n\n` +
    `Selon les besoins de l'entreprise, nous serions heureux de te renouveler. ` +
    `Indique-nous simplement ton souhait — Oui (avec tes dates de disponibilité, début et fin) ou Non — ` +
    `et, si tu le souhaites, ta raison ainsi que ton appréciation sur le poste et l'équipe.\n\n` +
    `👉 Réponds en 30 secondes ici :\n${link}\n\n` +
    `Merci, et au plaisir,\nL'équipe Caftan Factory (By AMD Megastore)`;
  return { subject, body, link };
}

/**
 * Envoie le pre-avis au travailleur via EmailJS et marque sent_at.
 * `row` doit contenir id, employee_id, contract_end_date, token.
 */
export async function sendRenewalPreNotice(
  admin: Admin,
  row: { id: string; employee_id: string; contract_end_date: string; token: string },
): Promise<{ ok: boolean; error?: string }> {
  const { data: emp } = await admin
    .from("employees")
    .select("full_name, email")
    .eq("id", row.employee_id)
    .maybeSingle();
  const email = (emp as { email?: string | null } | null)?.email ?? null;
  const fullName = (emp as { full_name?: string | null } | null)?.full_name ?? null;
  if (!email) return { ok: false, error: "Cet employé n'a pas d'adresse email." };

  const { subject, body } = buildRenewalEmail(fullName, row.contract_end_date, row.token);
  const result = await sendAppMail({
    to: email,
    toName: fullName ?? undefined,
    subject,
    body,
    source: "cdd_renewal_prenotice",
    employeeId: row.employee_id,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Envoi mail échoué" };

  await admin.from("cdd_renewal_responses").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true };
}

/**
 * Prepare les pre-avis pour les contrats (CDD ou Etudiant) qui se terminent
 * dans <= 15 jours : cree une ligne cdd_renewal_responses (avec token) si elle
 * n'existe pas encore. Retourne la liste des employes nouvellement preparees.
 */
export async function prepareRenewalNotices(
  admin: Admin,
): Promise<Array<{ id: string; employee_id: string; full_name: string; token: string; contract_end_date: string }>> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
  const { data: emps } = await admin
    .from("employees")
    .select("id, full_name, end_date, contract_type")
    .eq("status", "active")
    .not("end_date", "is", null)
    .gte("end_date", today)
    .lte("end_date", horizon)
    .or("contract_type.ilike.%CDD%,contract_type.ilike.%tudiant%");
  const created: Array<{ id: string; employee_id: string; full_name: string; token: string; contract_end_date: string }> = [];
  for (const e of (emps ?? []) as Array<{ id: string; full_name: string; end_date: string; contract_type: string | null }>) {
    const { data: ex } = await admin
      .from("cdd_renewal_responses")
      .select("id")
      .eq("employee_id", e.id)
      .eq("contract_end_date", e.end_date)
      .maybeSingle();
    if (ex) continue;
    const token = newRenewalToken();
    const { data: ins, error } = await admin
      .from("cdd_renewal_responses")
      .insert({ employee_id: e.id, contract_end_date: e.end_date, contract_type: e.contract_type, token })
      .select("id")
      .single();
    if (!error && ins) {
      created.push({ id: (ins as { id: string }).id, employee_id: e.id, full_name: e.full_name, token, contract_end_date: e.end_date });
    }
  }
  return created;
}
