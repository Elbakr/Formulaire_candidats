"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendApplicationAcknowledgement } from "@/lib/emails";

const MAX_FILE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export async function submitPublicApplication(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const birthDate = String(formData.get("birth_date") ?? "").trim() || null;
  const nrn = String(formData.get("nrn") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const postalCode = String(formData.get("postal_code") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "BE").trim();
  const motivation = String(formData.get("motivation") ?? "").trim() || null;
  const jobId = String(formData.get("job_id") ?? "") || null;

  if (!email || !fullName) return { error: "Nom et email requis." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email invalide." };

  // Server-side admin client (bypass RLS) — public form needs to insert
  const supabase = createAdminClient();

  const { data: cand, error: candErr } = await supabase
    .from("candidates")
    .insert({
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
    })
    .select("id")
    .single();
  if (candErr || !cand) return { error: candErr?.message ?? "Échec d'enregistrement." };

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
  if (appErr || !app) return { error: appErr?.message ?? "Échec d'enregistrement." };

  // CV upload (optional)
  const cvFile = formData.get("cv");
  if (cvFile instanceof File && cvFile.size > 0) {
    if (cvFile.size > MAX_FILE) return { error: "CV > 5 Mo." };
    if (cvFile.type && !ALLOWED_MIME.includes(cvFile.type)) {
      return { error: "Format CV non supporté (PDF/DOC/DOCX)." };
    }
    const ext = cvFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const path = `public-applications/${app.id}/cv-${Date.now()}.${ext}`;
    const arr = new Uint8Array(await cvFile.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, arr, { contentType: cvFile.type || "application/octet-stream", upsert: false });
    if (!upErr) {
      await supabase.from("documents").insert({
        application_id: app.id,
        kind: "cv",
        storage_path: path,
        file_name: cvFile.name,
        mime_type: cvFile.type || null,
        size_bytes: cvFile.size,
      });
    }
  }

  await sendApplicationAcknowledgement({ to: email, fullName });
  const a = app as unknown as { id: string };
  await supabase.from("messages").insert({
    application_id: a.id,
    direction: "outbound",
    subject: "Candidature bien reçue",
    body: `Merci ${fullName}, nous avons bien reçu ta candidature. Nous reviendrons vers toi rapidement.`,
  });

  return { ok: true, applicationId: a.id };
}
