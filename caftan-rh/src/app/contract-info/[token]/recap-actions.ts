"use server";

// Karim 2026-07-05 : à la FIN du formulaire d'embauche, le candidat pré-validé
// reçoit AUTOMATIQUEMENT un mail récapitulatif COMPLET de toutes ses données
// (identité, secrétariat social, transport, IBAN + ses indisponibilités), avec
// deux actions :
//   - « Corriger mes infos » = le MÊME lien magique du formulaire (re-modifier).
//   - « Je confirme »        = lien qui enregistre sa confirmation après relecture.
//
// EXCEPTION kill-switch : c'est le SEUL envoi automatique autorisé vers un
// candidat (source "candidate_recap_confirm", en liste blanche dans
// outbound-guard.ts). Anti-doublon : pas de ré-envoi si un récap a déjà été
// envoyé à ce candidat il y a moins de 5 minutes (re-soumission / double clic).

import { createAdminClient } from "@/lib/supabase/server";
import { getOutboundBaseUrl } from "@/lib/public-base-url";

const RECAP_SOURCE = "candidate_recap_confirm";
const ANTI_DUP_MINUTES = 5;

const DOW = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const REASON_LABELS: Record<string, string> = {
  vacances: "Vacances / congé",
  hospitalisation: "Hospitalisation / opération",
  examen: "Examen",
  cours: "Cours / école",
  medical: "Rendez-vous médical",
  perso: "Personnel",
  autre: "Autre",
};

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nom complet",
  email: "Email",
  birth_date: "Date de naissance",
  birth_place: "Lieu de naissance",
  nrn: "Numéro national (NISS)",
  nationality: "Nationalité",
  address: "Adresse",
  postal_code: "Code postal",
  city: "Commune",
  iban: "IBAN",
  education_level: "Niveau scolaire / dernier diplôme",
  marital_status: "État civil",
  dependent_children: "Personnes à charge",
  transport_type: "Moyen de transport",
  transport_frequency: "Abonnement transport",
  transport_price: "Prix du transport (€)",
};
// Ordre d'affichage lisible dans le mail.
const FIELD_ORDER = [
  "full_name", "email", "birth_date", "birth_place", "nrn", "nationality",
  "address", "postal_code", "city", "iban", "education_level", "marital_status",
  "dependent_children", "transport_type", "transport_frequency", "transport_price",
];

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels", day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}
function fmtTimes(start: string | null, end: string | null): string {
  return start && end ? `${start.slice(0, 5)}–${end.slice(0, 5)}` : "journée entière";
}
function reasonLabel(code: string | null): string {
  return code ? (REASON_LABELS[code] ?? code) : "—";
}

type Unavail = {
  day_of_week: number | null;
  date_specific: string | null;
  date_end: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

/**
 * Envoie le mail récap+confirmation au candidat du token. Best-effort : ne lève
 * jamais (retourne { ok:false } en cas d'échec) pour ne pas perturber la fin du
 * parcours candidat. Idempotent sur 5 min (anti-doublon).
 */
export async function sendCandidateRecapConfirmAction(
  token: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const admin = createAdminClient();

    // 1) Résoudre le candidat depuis le token.
    const { data: tokRaw } = await admin
      .from("contract_info_tokens")
      .select("candidate_id")
      .eq("token", token)
      .maybeSingle();
    const candidateId = (tokRaw as { candidate_id: string | null } | null)?.candidate_id ?? null;
    if (!candidateId) return { ok: false, error: "Lien invalide" };

    const { data: candRaw } = await admin
      .from("candidates")
      .select("id, full_name, email, birth_date, birth_place, nrn, nationality, address, postal_code, city, iban, education_level, marital_status, dependent_children, transport_type, transport_frequency, transport_price, is_student")
      .eq("id", candidateId)
      .maybeSingle();
    const cand = candRaw as Record<string, unknown> | null;
    if (!cand) return { ok: false, error: "Candidat introuvable" };
    const email = String(cand.email ?? "").trim();
    if (!email) return { ok: false, error: "Email candidat absent" };

    // 2) Anti-doublon : déjà envoyé (avec succès) il y a moins de 5 min ?
    const sinceIso = new Date(Date.now() - ANTI_DUP_MINUTES * 60_000).toISOString();
    const { data: recent } = await admin
      .from("outbound_mails")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("source", RECAP_SOURCE)
      .eq("status", "sent")
      .gte("sent_at", sinceIso)
      .limit(1);
    if ((recent ?? []).length > 0) {
      return { ok: true, skipped: true };
    }

    // 3) Indisponibilités déclarées.
    const { data: unavailRaw } = await admin
      .from("candidate_unavailabilities")
      .select("day_of_week, date_specific, date_end, start_time, end_time, reason")
      .eq("candidate_id", candidateId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    const unavailabilities = (unavailRaw ?? []) as Unavail[];

    // 4) URLs (base publique stable — jamais localhost/tunnel).
    const base = getOutboundBaseUrl();
    const correctUrl = `${base}/contract-info/${token}`;
    const confirmUrl = `${base}/contract-info/${token}/confirm`;

    const firstName = String(cand.full_name ?? "").split(/\s+/)[0] ?? "";

    // 5) Construction du récap.
    const isStudent = cand.is_student === true ? "Étudiant" : cand.is_student === false ? "Non-étudiant" : null;

    const displayVal = (key: string): string => {
      const v = cand[key];
      if (v === null || v === undefined || String(v).trim() === "") return "—";
      return String(v);
    };
    const rows = FIELD_ORDER.filter((k) => {
      const v = cand[k];
      return v !== null && v !== undefined && String(v).trim() !== "";
    })
      .map(
        (k) =>
          `<tr><td style="padding:6px 10px;color:#6b6b5e;font-size:13px;white-space:nowrap;vertical-align:top">${esc(FIELD_LABELS[k] ?? k)}</td><td style="padding:6px 10px;color:#1a1a0d;font-size:13px;font-weight:600">${esc(displayVal(k))}</td></tr>`,
      )
      .join("");

    const statusRow = isStudent
      ? `<tr><td style="padding:6px 10px;color:#6b6b5e;font-size:13px">Statut</td><td style="padding:6px 10px;color:#1a1a0d;font-size:13px;font-weight:600">${esc(isStudent)}</td></tr>`
      : "";

    const recurring = unavailabilities.filter((u) => u.day_of_week !== null);
    const specific = unavailabilities.filter((u) => u.date_specific !== null);
    const unavailItems: string[] = [];
    for (const u of recurring) {
      unavailItems.push(
        `<li style="margin:4px 0"><b>Chaque ${esc(DOW[u.day_of_week ?? 0])}</b> · ${esc(fmtTimes(u.start_time, u.end_time))} <span style="color:#6b6b5e">· ${esc(reasonLabel(u.reason))}</span></li>`,
      );
    }
    for (const u of specific) {
      const when = u.date_end
        ? `du ${fmtDate(u.date_specific ?? "")} au ${fmtDate(u.date_end)}`
        : fmtDate(u.date_specific ?? "");
      unavailItems.push(
        `<li style="margin:4px 0"><b>${esc(when)}</b> · ${esc(fmtTimes(u.start_time, u.end_time))} <span style="color:#6b6b5e">· ${esc(reasonLabel(u.reason))}</span></li>`,
      );
    }
    const unavailHtml =
      unavailItems.length > 0
        ? `<ul style="margin:6px 0 0;padding-left:18px;color:#1a1a0d;font-size:13px">${unavailItems.join("")}</ul>`
        : `<p style="margin:6px 0 0;color:#6b6b5e;font-size:13px">Aucune indisponibilité déclarée.</p>`;

    const btn = (href: string, label: string, bg: string, color: string) =>
      `<a href="${href}" style="display:inline-block;background:${bg};color:${color};text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;margin:4px 6px 4px 0">${label}</a>`;

    const htmlBody = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a0d">
  <div style="background:#1a1a0d;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
    <div style="color:#c9a227;font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:11px">Caftan Factory</div>
    <div style="font-weight:700;margin-top:2px">Récapitulatif de ton dossier d'embauche</div>
  </div>
  <div style="border:1px solid #e6e4da;border-top:none;border-radius:0 0 12px 12px;padding:20px">
    <p style="font-size:14px;line-height:1.5;margin:0 0 12px">Bonjour ${esc(firstName)},</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:#4a4a3f">Merci d'avoir complété ton dossier. Voici le <b>récapitulatif complet</b> des informations que tu nous as transmises. Relis-les attentivement, puis <b>confirme</b> si tout est correct — ou <b>corrige</b> ce qui doit l'être.</p>

    <table style="width:100%;border-collapse:collapse;background:#faf9f5;border:1px solid #e6e4da;border-radius:10px">
      ${statusRow}${rows}
    </table>

    <div style="margin-top:18px">
      <div style="font-weight:700;font-size:14px">Mes indisponibilités (3 prochains mois)</div>
      ${unavailHtml}
    </div>

    <div style="margin-top:22px;text-align:center">
      ${btn(confirmUrl, "✓ Je confirme", "#c9a227", "#1a1a0d")}
      ${btn(correctUrl, "Corriger mes infos", "#ffffff", "#1a1a0d")}
    </div>
    <p style="font-size:12px;color:#6b6b5e;margin:18px 0 0;line-height:1.5">« Corriger mes infos » rouvre ton formulaire sécurisé (même lien). « Je confirme » enregistre ta relecture. Tant que tu n'as pas confirmé, tu peux revenir modifier à tout moment.</p>
    <p style="font-size:11px;color:#9a988c;margin:14px 0 0">Caftan Factory — By AMD Megastore · RH</p>
  </div>
</div>`;

    const textLines: string[] = [];
    textLines.push(`Bonjour ${firstName},`, "", "Récapitulatif de ton dossier d'embauche :", "");
    if (isStudent) textLines.push(`- Statut : ${isStudent}`);
    for (const k of FIELD_ORDER) {
      const v = cand[k];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        textLines.push(`- ${FIELD_LABELS[k] ?? k} : ${String(v)}`);
      }
    }
    textLines.push("", "Indisponibilités :");
    if (unavailItems.length === 0) textLines.push("- Aucune");
    for (const u of recurring) textLines.push(`- Chaque ${DOW[u.day_of_week ?? 0]} · ${fmtTimes(u.start_time, u.end_time)} · ${reasonLabel(u.reason)}`);
    for (const u of specific) {
      const when = u.date_end ? `du ${fmtDate(u.date_specific ?? "")} au ${fmtDate(u.date_end)}` : fmtDate(u.date_specific ?? "");
      textLines.push(`- ${when} · ${fmtTimes(u.start_time, u.end_time)} · ${reasonLabel(u.reason)}`);
    }
    textLines.push("", `Je confirme : ${confirmUrl}`, `Corriger mes infos : ${correctUrl}`, "", "Caftan Factory — RH");

    // 6) Envoi (source en liste blanche = passe le kill-switch malgré automated:true).
    const { sendAppMail } = await import("@/lib/app-mail");
    const res = await sendAppMail({
      to: email,
      toName: String(cand.full_name ?? "") || undefined,
      subject: "Ton dossier Caftan Factory — récapitulatif & confirmation",
      body: textLines.join("\n"),
      htmlBody,
      source: RECAP_SOURCE,
      sourceRef: candidateId,
      candidateId,
      automated: true,
      bccHr: true,
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Échec envoi" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
