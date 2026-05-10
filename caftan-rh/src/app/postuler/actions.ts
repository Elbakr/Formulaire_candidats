"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { sendApplicationAcknowledgement } from "@/lib/emails";
import {
  validateBelgianPhone,
  validateBelgianPostcode,
  validateNRN,
  normalizeBelgianPhone,
  regionFromPostcode,
} from "@/lib/be-validators";
import { t, type Locale } from "@/lib/i18n";

const MAX_FILE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
];

/**
 * Soumission publique d'une candidature.
 *
 * - Pas d'auth : exécutée côté server avec service role (bypass RLS).
 * - Valide les champs Belgique (non bloquant si absents).
 * - Stocke les champs étendus (langues, dispo, magasin préféré, permis…)
 *   dans `candidates` (cols existantes) + dump complet dans `raw_payload`.
 * - Upload du CV : bucket `candidate-cvs` si dispo (créé par migration
 *   20260620000210), fallback sur le bucket historique `documents`.
 * - Crée un row `messages` pour l'historique RH.
 *
 * Le format retourné `{ error?, ok?, applicationId? }` est consommé par le
 * composant client `<ApplicationForm>`.
 */
export async function submitPublicApplication(formData: FormData) {
  const locale: Locale =
    (String(formData.get("locale") ?? "fr") as Locale) === "nl" ? "nl" : "fr";

  // ─── 1. Lecture/normalisation des champs ────────────────────────────────
  const firstname = String(formData.get("firstname") ?? "").trim();
  const lastname = String(formData.get("lastname") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const birthDate = String(formData.get("birth_date") ?? "").trim() || null;
  const gender = String(formData.get("gender") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const postalCode = String(formData.get("postal_code") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "BE").trim();
  const nrnRaw = String(formData.get("nrn") ?? "").trim();
  const contractType = String(formData.get("contract_type") ?? "").trim() || null;
  const weeklyHours = String(formData.get("weekly_hours") ?? "").trim();
  const availableFrom = String(formData.get("available_from") ?? "").trim() || null;
  const sitePreference = String(formData.get("site_preference") ?? "").trim() || null;
  const workPermit = String(formData.get("work_permit") ?? "").trim() || null;
  const activa = String(formData.get("activa_brussels") ?? "unknown").trim();
  const position = String(formData.get("position") ?? "").trim() || null;
  const experience = String(formData.get("experience") ?? "").trim() || null;
  const motivation = String(formData.get("motivation") ?? "").trim() || null;
  const consent = String(formData.get("consent") ?? "0") === "1";
  const jobId = String(formData.get("job_id") ?? "") || null;

  let daysAvailable: Record<string, boolean> = {};
  try {
    const raw = String(formData.get("days_available") ?? "{}");
    daysAvailable = JSON.parse(raw);
  } catch {
    daysAvailable = {};
  }

  let langs: Record<string, string> = {};
  try {
    const raw = String(formData.get("langs") ?? "{}");
    langs = JSON.parse(raw);
  } catch {
    langs = {};
  }

  // ─── 2. Validation ──────────────────────────────────────────────────────
  if (!firstname || !lastname || !email) {
    return { error: t("apply.error.required", locale) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: t("apply.error.email", locale) };
  }
  if (!consent) {
    return { error: t("apply.consent_required", locale) };
  }

  let phone: string | null = null;
  if (phoneRaw) {
    const r = validateBelgianPhone(phoneRaw);
    if (r.valid) phone = r.formatted ?? normalizeBelgianPhone(phoneRaw);
    else phone = phoneRaw; // garde la saisie brute pour ne pas perdre l'info
  }

  if (postalCode && country === "BE") {
    const r = validateBelgianPostcode(postalCode);
    if (!r.valid) {
      return { error: t("apply.error.postcode", locale) };
    }
  }

  let nrn: string | null = null;
  if (nrnRaw) {
    const r = validateNRN(nrnRaw);
    if (!r.valid) {
      return { error: t("apply.error.nrn", locale) };
    }
    nrn = r.formatted ?? nrnRaw;
  }

  if (motivation) {
    if (motivation.length < 200) {
      return { error: t("apply.error.motivation_short", locale) };
    }
    if (motivation.length > 1500) {
      return { error: t("apply.error.motivation_long", locale) };
    }
  }

  // ─── 3. Tracking (IP, UA) ───────────────────────────────────────────────
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null;
  const userAgent = hdrs.get("user-agent") ?? null;
  const region = postalCode ? regionFromPostcode(postalCode) : null;

  const rawPayload = {
    source: "public_form",
    submitted_at: new Date().toISOString(),
    locale,
    ip,
    user_agent: userAgent,
    region,
    days_available: daysAvailable,
    gender,
    site_preference: sitePreference,
    work_permit: workPermit,
    activa_brussels: activa,
    position,
    experience,
    job_id_requested: jobId,
  };

  // ─── 4. Insert candidates ───────────────────────────────────────────────
  const fullName = `${firstname} ${lastname}`.trim();
  const supabase = createAdminClient();

  const candidatePayload: Record<string, unknown> = {
    email,
    full_name: fullName,
    phone,
    birth_date: birthDate,
    nrn,
    address,
    postal_code: postalCode,
    city,
    country,
    source: "public_form",
    langs,
    wanted_contract_type: contractType,
    available_from: availableFrom,
    raw_payload: rawPayload,
  };
  if (weeklyHours) {
    // Free-form text col `work_time_pref` to keep "20h" / "38h" intent.
    candidatePayload.work_time_pref = `${weeklyHours}h/sem`;
  }

  const { data: cand, error: candErr } = await supabase
    .from("candidates")
    .insert(candidatePayload)
    .select("id")
    .single();
  if (candErr || !cand) {
    return { error: candErr?.message ?? t("apply.error.generic", locale) };
  }

  // ─── 5. Insert application ──────────────────────────────────────────────
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .insert({
      candidate_id: cand.id,
      job_id: jobId,
      status: "new",
      motivation,
    })
    .select("id")
    .single();
  if (appErr || !app) {
    return { error: appErr?.message ?? t("apply.error.generic", locale) };
  }
  const applicationId = (app as { id: string }).id;

  // ─── 6. CV upload (optionnel) ───────────────────────────────────────────
  const cvFile = formData.get("cv");
  if (cvFile instanceof File && cvFile.size > 0) {
    if (cvFile.size > MAX_FILE) {
      return { error: t("apply.error.cv_size", locale) };
    }
    const fileType = cvFile.type || "application/octet-stream";
    const lowerName = cvFile.name.toLowerCase();
    const ext = lowerName.split(".").pop() ?? "pdf";
    const formatOk =
      ALLOWED_MIME.includes(fileType) ||
      ["pdf", "doc", "docx", "jpg", "jpeg"].includes(ext);
    if (!formatOk) {
      return { error: t("apply.error.cv_format", locale) };
    }

    // Bucket prioritaire : `candidate-cvs` si la migration est appliquée.
    // Fallback `documents` (toujours présent) pour ne jamais bloquer l'upload.
    const safeName = cvFile.name.replace(/[^\w.\- ]+/g, "_");
    const arr = new Uint8Array(await cvFile.arrayBuffer());
    let storagePath: string | null = null;
    let bucket: string | null = null;

    // Essai bucket dédié.
    const dedicatedPath = `${applicationId}/${Date.now()}-${safeName}`;
    const dedicated = await supabase.storage
      .from("candidate-cvs")
      .upload(dedicatedPath, arr, { contentType: fileType, upsert: false });
    if (!dedicated.error) {
      storagePath = dedicatedPath;
      bucket = "candidate-cvs";
    } else {
      // Fallback historique.
      const fallbackPath = `public-applications/${applicationId}/cv-${Date.now()}.${ext}`;
      const fallback = await supabase.storage
        .from("documents")
        .upload(fallbackPath, arr, { contentType: fileType, upsert: false });
      if (!fallback.error) {
        storagePath = fallbackPath;
        bucket = "documents";
      }
    }

    if (storagePath) {
      await supabase.from("documents").insert({
        application_id: applicationId,
        kind: "cv",
        storage_path: storagePath,
        file_name: cvFile.name,
        mime_type: fileType,
        size_bytes: cvFile.size,
      });
      // Aussi mémorisé sur le candidat (champ `cv_url` = chemin storage, pas une URL signée).
      await supabase
        .from("candidates")
        .update({ cv_url: `${bucket}://${storagePath}` })
        .eq("id", cand.id);
    }
  }

  // ─── 7. Accusé de réception + message dans le fil RH ───────────────────
  try {
    await sendApplicationAcknowledgement({ to: email, fullName });
  } catch {
    /* email non bloquant */
  }

  await supabase.from("messages").insert({
    application_id: applicationId,
    direction: "outbound",
    subject:
      locale === "nl"
        ? "Sollicitatie goed ontvangen"
        : "Candidature bien reçue",
    body:
      locale === "nl"
        ? `Bedankt ${fullName}, we hebben je sollicitatie goed ontvangen. We nemen snel contact met je op.`
        : `Merci ${fullName}, nous avons bien reçu ta candidature. Nous reviendrons vers toi rapidement.`,
  });

  return { ok: true, applicationId };
}
