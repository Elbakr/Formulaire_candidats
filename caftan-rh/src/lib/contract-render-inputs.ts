// Karim 2026-06-15 : SOURCE DE VÉRITÉ UNIQUE pour le rendu d'un contrat.
//
// Objectif : la PRÉVISUALISATION admin et la VERSION ENVOYÉE À SIGNER doivent
// produire STRICTEMENT le même document (le « super layout »). Avant, chaque
// chemin dérivait le template + les conditions de son côté -> divergences
// (preview en temps plein alors que le contrat réel est 24h temps partiel).
//
// Règle : le CONTRAT PRÉPARÉ (employee_contracts) prime sur la fiche `employees`
// (qui reste souvent en valeurs par défaut full/38h). Le template est dérivé des
// heures réelles du contrat, jamais d'un défaut de la fiche.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EffTpl = "employee" | "employee_pt" | "student";

export type PrimarySite = {
  code: string;
  name: string;
  address: string | null;
  city: string | null;
} | null;

/** Discordance entre la fiche employee et le contrat préparé (valeurs en conflit). */
export type ContractDiscrepancy = {
  field: string;
  label: string;
  profileValue: string;
  contractValue: string;
};

export type ContractRenderInputs =
  | {
      ok: true;
      employee: Record<string, unknown>;
      /** Données effectives = fiche employee + conditions du contrat préparé (prioritaires). */
      eff: Record<string, unknown>;
      effTpl: EffTpl;
      primarySite: PrimarySite;
      templateBodyMarkdown: string;
      /** Champs où fiche et contrat divergent — à SIGNALER à l'opérateur avant d'adapter. */
      discrepancies: ContractDiscrepancy[];
    }
  | { ok: false; error: string };

/**
 * Résout, pour un employé, le template + les données effectives + le markdown
 * du template, en faisant primer le contrat préparé sur la fiche employee.
 * Utilisé par la preview ET par l'envoi à signer => garantit le WYSIWYG.
 */
export async function resolveContractRenderInputs(
  admin: SupabaseClient,
  employeeId: string,
  fallbackTpl: EffTpl = "employee",
): Promise<ContractRenderInputs> {
  const { data: emp } = await admin
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employé introuvable" };

  // Dernier contrat préparé : ses conditions priment.
  const { data: ctrRaw } = await admin
    .from("employee_contracts")
    .select(
      "contract_kind, weekly_hours, start_date, end_date, position_title, gross_hourly_rate, nrn, address, postal_code, city, workplace, workplace_address",
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ctr = ctrRaw as Record<string, unknown> | null;

  const eff: Record<string, unknown> = { ...(emp as Record<string, unknown>) };
  if (ctr) {
    const merge = (ck: string, ek: string) => {
      if (ctr[ck] != null && ctr[ck] !== "") eff[ek] = ctr[ck];
    };
    merge("weekly_hours", "weekly_hours");
    merge("contract_kind", "contract_type");
    merge("start_date", "start_date");
    merge("end_date", "end_date");
    merge("position_title", "job_title");
    merge("gross_hourly_rate", "hourly_rate");
    merge("nrn", "nrn");
    merge("address", "address");
    merge("postal_code", "postal_code");
    merge("city", "city");
  }

  // Dérivation template : heures réelles d'abord, puis work_time_kind, puis fallback.
  const wh = Number(eff.weekly_hours ?? 0);
  const ck = String(eff.contract_type ?? "").toLowerCase();
  const wtk = String((eff as { work_time_kind?: unknown }).work_time_kind ?? "").toLowerCase();
  const effTpl: EffTpl =
    ck.includes("étud") || ck.includes("etud")
      ? "student"
      : wh > 0
        ? wh < 38
          ? "employee_pt"
          : "employee"
        : wtk === "partial" || wtk === "part"
          ? "employee_pt"
          : wtk === "full"
            ? "employee"
            : fallbackTpl;

  // Discordances fiche <-> contrat : SIGNALER (jamais adapter en silence). On ne
  // retient que les vrais conflits (deux valeurs présentes ET différentes), pas
  // les complétions (fiche vide -> contrat rempli).
  const empR = emp as Record<string, unknown>;
  const discrepancies: ContractDiscrepancy[] = [];
  const both = (a: unknown, b: unknown) =>
    a != null && a !== "" && b != null && b !== "" && String(a) !== String(b);
  if (ctr) {
    if (both(empR.weekly_hours, ctr.weekly_hours))
      discrepancies.push({ field: "weekly_hours", label: "Heures / semaine", profileValue: String(empR.weekly_hours), contractValue: String(ctr.weekly_hours) });
    if (both(empR.contract_type, ctr.contract_kind))
      discrepancies.push({ field: "contract_type", label: "Type de contrat", profileValue: String(empR.contract_type), contractValue: String(ctr.contract_kind) });
    if (both(empR.job_title, ctr.position_title))
      discrepancies.push({ field: "job_title", label: "Fonction", profileValue: String(empR.job_title), contractValue: String(ctr.position_title) });
    if (both(empR.hourly_rate, ctr.gross_hourly_rate))
      discrepancies.push({ field: "hourly_rate", label: "Taux horaire brut", profileValue: String(empR.hourly_rate), contractValue: String(ctr.gross_hourly_rate) });
    if (both(empR.start_date, ctr.start_date))
      discrepancies.push({ field: "start_date", label: "Date de début", profileValue: String(empR.start_date), contractValue: String(ctr.start_date) });
    if (both(empR.end_date, ctr.end_date))
      discrepancies.push({ field: "end_date", label: "Date de fin", profileValue: String(empR.end_date), contractValue: String(ctr.end_date) });
    // Régime horaire dérivé (la cause du bug Sanae : fiche "full" vs contrat 24h).
    // Valeurs CANONIQUES 'part'/'full' (= convention DB + contrainte CHECK) ; le
    // libellé FR est rendu côté carte. Surtout PAS 'partial' (violerait le CHECK).
    const prRaw = String(empR.work_time_kind ?? "").toLowerCase();
    const pr = prRaw === "partial" ? "part" : prRaw;
    const cr = effTpl === "employee_pt" ? "part" : effTpl === "employee" ? "full" : "";
    if ((pr === "full" || pr === "part") && cr && pr !== cr)
      discrepancies.push({ field: "work_time_kind", label: "Régime horaire", profileValue: pr, contractValue: cr });
  }

  // Lieu de travail : affectation primaire réelle d'abord, sinon workplace du contrat.
  const today = new Date().toISOString().slice(0, 10);
  const { data: assignRaw } = await admin
    .from("site_assignments")
    .select("site:sites(code, name, address, city)")
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .lte("start_date", today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .maybeSingle();
  let primarySite: PrimarySite =
    (assignRaw as { site: PrimarySite } | null)?.site ?? null;
  if (!primarySite && ctr?.workplace) {
    primarySite = {
      code: "",
      name: String(ctr.workplace),
      address: ctr.workplace_address ? String(ctr.workplace_address) : null,
      city: null,
    };
  }

  // Template markdown (le « super layout »).
  const { data: tpl } = await admin
    .from("contract_templates")
    .select("body_markdown")
    .eq("code", effTpl)
    .maybeSingle();
  if (!tpl) return { ok: false, error: `Template ${effTpl} introuvable` };

  return {
    ok: true,
    employee: emp as Record<string, unknown>,
    eff,
    effTpl,
    primarySite,
    templateBodyMarkdown: (tpl as { body_markdown: string }).body_markdown,
    discrepancies,
  };
}
