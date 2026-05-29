"use server";

/**
 * Karim 29/05 : Generation d'une "fiche travailleur" a envoyer au secretariat
 * social (pas d'API officielle, c'est un envoi mail structure).
 *
 * Pattern : 2 entites juridiques possibles (AMD Megastore SRL Schaerbeek
 * BCE 0660.936.422 CP 201, et Caftan Factory Bruxelles - meme CP 201).
 * Karim choisit l'entite emettrice au moment du clic (2 boutons separes
 * cote UI).
 *
 * Le mail est envoye cote client via EmailJS (les env vars sont NEXT_PUBLIC_*).
 * Cette action server :
 *   1) verifie role admin/rh
 *   2) charge l'employe et valide la presence de TOUS les champs requis
 *   3) prepare un payload mail (subject + body + destinataire)
 *   4) renvoie le payload au client qui declenche l'envoi EmailJS
 *
 * L'audit (notifications kind='secsoc_sent') est inscrit par
 * `recordSecsocSendAction` apres confirmation de l'envoi cote client.
 */

import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ORGS, type SecsocOrg, type OrgInfo } from "./orgs";

export type { SecsocOrg } from "./orgs";

export type SecsocEmployeeSnapshot = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nrn: string | null;
  iban: string | null;
  weekly_hours: number | null;
  work_time_kind: string | null;
  contract_type: string | null;
  start_date: string | null;
  end_date: string | null;
  signature_place: string | null;
  transport_type: string | null;
  transport_frequency: string | null;
  transport_price: string | null;
};

type RequiredField = {
  key: keyof SecsocEmployeeSnapshot;
  label: string;
};

const REQUIRED_FIELDS: RequiredField[] = [
  { key: "full_name", label: "Nom complet" },
  { key: "birth_date", label: "Date de naissance" },
  { key: "birth_place", label: "Lieu de naissance" },
  { key: "nrn", label: "Numero national (NRN)" },
  { key: "iban", label: "IBAN" },
  { key: "weekly_hours", label: "Heures hebdo" },
  { key: "work_time_kind", label: "Regime (temps plein/partiel)" },
  { key: "contract_type", label: "Type de contrat (CDD/Etudiant)" },
  { key: "start_date", label: "Date de debut" },
  { key: "end_date", label: "Date de fin" },
  { key: "signature_place", label: "Lieu de signature" },
  { key: "transport_type", label: "Type de transport" },
  { key: "transport_frequency", label: "Frequence transport" },
  { key: "transport_price", label: "Prix transport" },
];

export function listMissingFields(emp: SecsocEmployeeSnapshot): RequiredField[] {
  return REQUIRED_FIELDS.filter((f) => {
    const v = emp[f.key];
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    return false;
  });
}

/**
 * Charge l'employe avec les champs requis. Utilise par la page (server
 * component) et par les actions.
 */
export async function loadSecsocEmployee(
  employeeId: string,
): Promise<SecsocEmployeeSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select(
      "id, full_name, birth_date, birth_place, nrn, iban, weekly_hours, work_time_kind, contract_type, start_date, end_date, signature_place, transport_type, transport_frequency, transport_price",
    )
    .eq("id", employeeId)
    .maybeSingle();
  return (data as SecsocEmployeeSnapshot | null) ?? null;
}

function getDestinationEmail(): string {
  return (
    process.env.SOCIAL_SECRETARY_EMAIL?.trim() || "elbazikarim@gmail.com"
  );
}

function buildSubject(emp: SecsocEmployeeSnapshot, org: OrgInfo): string {
  return `Nouvelle fiche travailleur — ${emp.full_name ?? "?"} — ${org.name}`;
}

function buildBody(emp: SecsocEmployeeSnapshot, org: OrgInfo): string {
  const line = (label: string, val: string | number | null) =>
    `${label.padEnd(28, " ")}: ${val ?? "—"}`;
  return [
    "Bonjour,",
    "",
    `Voici la fiche d'un nouveau travailleur a encoder.`,
    "",
    "═════════ EMPLOYEUR ═════════",
    line("Entite", org.name),
    line("BCE", org.bce),
    line("Adresse", org.address),
    line("Commission paritaire", `CP ${org.cp}`),
    "",
    "═════════ TRAVAILLEUR ═════════",
    line("Nom complet", emp.full_name),
    line("Date de naissance", emp.birth_date),
    line("Lieu de naissance", emp.birth_place),
    line("NRN", emp.nrn),
    line("IBAN", emp.iban),
    "",
    "═════════ CONTRAT ═════════",
    line("Type contrat", emp.contract_type),
    line("Regime", emp.work_time_kind),
    line("Heures/semaine", emp.weekly_hours),
    line("Date debut", emp.start_date),
    line("Date fin", emp.end_date),
    line("Lieu signature", emp.signature_place),
    "",
    "═════════ TRANSPORT ═════════",
    line("Type", emp.transport_type),
    line("Frequence", emp.transport_frequency),
    line("Prix", emp.transport_price),
    "",
    "Merci d'encoder cette fiche et de confirmer la prise en compte.",
    "",
    "Cordialement,",
    "RH — " + org.name,
  ].join("\n");
}

export type PreparedSecsocMail = {
  ok: true;
  to: string;
  subject: string;
  body: string;
  orgKey: SecsocOrg;
  orgName: string;
  employeeName: string;
};

export type SecsocActionError = {
  ok: false;
  error: string;
  missing?: string[];
};

/**
 * Prepare le payload mail. Le client appelle ensuite sendEmailViaEmailJS,
 * puis `recordSecsocSendAction` pour l'audit.
 */
export async function sendSecsocFicheAction(
  employeeId: string,
  orgKey: SecsocOrg = "amd_megastore",
): Promise<PreparedSecsocMail | SecsocActionError> {
  await requireRole(["admin", "rh"]);
  const org = ORGS[orgKey];
  if (!org) return { ok: false, error: "Entite inconnue" };

  const emp = await loadSecsocEmployee(employeeId);
  if (!emp) return { ok: false, error: "Employe introuvable" };

  const missing = listMissingFields(emp);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Champs manquants : ${missing.map((m) => m.label).join(", ")}`,
      missing: missing.map((m) => m.label),
    };
  }

  return {
    ok: true,
    to: getDestinationEmail(),
    subject: buildSubject(emp, org),
    body: buildBody(emp, org),
    orgKey,
    orgName: org.name,
    employeeName: emp.full_name ?? "?",
  };
}

/**
 * Audit : enregistre une notification kind='secsoc_sent' apres envoi
 * confirme cote client. Best effort - on n'echoue pas si insert RLS rate.
 */
export async function recordSecsocSendAction(input: {
  employeeId: string;
  orgKey: SecsocOrg;
  to: string;
  subject: string;
}): Promise<{ ok: boolean; sentAt: string; error?: string }> {
  const { profile } = await requireRole(["admin", "rh"]);
  const sentAt = new Date().toISOString();
  const supabase = await createClient();
  const org = ORGS[input.orgKey];
  try {
    await supabase.from("notifications").insert({
      recipient_id: profile.id,
      kind: "secsoc_sent",
      title: `Fiche secretariat social envoyee`,
      body: `${input.subject} -> ${input.to}`,
      link: `/planning/employees/${input.employeeId}/secsoc`,
      data: {
        employee_id: input.employeeId,
        org_key: input.orgKey,
        org_name: org?.name ?? input.orgKey,
        to: input.to,
        subject: input.subject,
        sent_at: sentAt,
      },
    } as never);
  } catch (e) {
    return {
      ok: true,
      sentAt,
      error: `Audit non enregistre : ${(e as Error).message}`,
    };
  }
  return { ok: true, sentAt };
}

