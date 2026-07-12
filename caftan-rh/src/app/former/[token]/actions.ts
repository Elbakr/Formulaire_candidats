"use server";

// Karim 2026-07-12 : actions PUBLIQUES de la page de formation (accès par token du
// travailleur, sans compte). Confirmation de lecture (+ temps de lecture), « hâte
// d'apprendre » (envoie la suivante), et le champ COMMENTAIRE/ANOMALIE (toujours
// dispo en bas de page) qui remonte à l'admin.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { confirmAndMaybeAdvance } from "@/lib/training/drip";
import { sha256, FORM_BIND_COOKIE } from "./binding";
import { revalidatePath } from "next/cache";

/** Verrouille la formation sur CET appareil (1re ouverture) : cookie httpOnly +
 *  empreinte en base. Refusé si déjà liée à un autre appareil. */
export async function bindTrainingDeviceAction(token: string): Promise<{ ok: boolean; error?: string }> {
  const t = (token ?? "").trim();
  if (t.length < 12) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();
  const { data } = await admin
    .from("training_enrollments")
    .select("id, bound_secret")
    .eq("token", t)
    .maybeSingle();
  const enr = data as { id: string; bound_secret: string | null } | null;
  if (!enr) return { ok: false, error: "Lien invalide." };
  if (enr.bound_secret) return { ok: false, error: "Déjà lié à un appareil." };

  const secret = crypto.randomBytes(24).toString("base64url");
  const { error } = await admin
    .from("training_enrollments")
    .update({ bound_secret: sha256(secret), bound_at: new Date().toISOString() })
    .eq("token", t)
    .is("bound_secret", null); // anti-course : ne lie que si toujours libre
  if (error) return { ok: false, error: error.message };
  const c = await cookies();
  c.set(`${FORM_BIND_COOKIE}_${enr.id}`, secret, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400,
    path: "/",
  });
  return { ok: true };
}

async function resolveEmployee(token: string): Promise<{ employeeId: string; name: string | null } | null> {
  const t = (token ?? "").trim();
  if (t.length < 12) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("training_enrollments").select("employee_id").eq("token", t).maybeSingle();
  const enr = data as { employee_id: string } | null;
  if (!enr) return null;
  const { data: emp } = await admin.from("employees").select("full_name").eq("id", enr.employee_id).maybeSingle();
  return { employeeId: enr.employee_id, name: (emp as { full_name: string | null } | null)?.full_name ?? null };
}

export async function confirmModuleAction(
  token: string,
  seq: number,
  eager: boolean,
  readingSeconds: number | null,
): Promise<{ ok: boolean; done?: boolean; error?: string }> {
  const who = await resolveEmployee(token);
  if (!who) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();
  const r = await confirmAndMaybeAdvance(admin, who.employeeId, seq, {
    eager,
    readingSeconds: Number.isFinite(readingSeconds as number) ? readingSeconds : null,
  });
  revalidatePath(`/former/${token}`);
  return r;
}

export async function submitTrainingFeedbackAction(
  token: string,
  seq: number | null,
  kind: "comment" | "anomaly" | "info",
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const msg = (message ?? "").trim();
  if (!msg) return { ok: false, error: "Message vide." };
  const who = await resolveEmployee(token);
  if (!who) return { ok: false, error: "Lien invalide." };
  const admin = createAdminClient();

  const { error } = await admin.from("training_feedback").insert({
    employee_id: who.employeeId,
    module_seq: seq,
    kind: kind === "anomaly" || kind === "info" ? kind : "comment",
    message: msg.slice(0, 4000),
  });
  if (error) return { ok: false, error: error.message };

  // Remonte à l'admin/RH (objet précis + lien direct vers la fiche).
  try {
    const { notifyRoles } = await import("@/lib/notify");
    const label = kind === "anomaly" ? "Anomalie signalée" : kind === "info" ? "Info déclarée" : "Commentaire";
    await notifyRoles(["admin", "rh"], {
      kind: "training_feedback",
      title: `${label} (formation) — ${who.name ?? "un travailleur"}`,
      body: msg.slice(0, 200),
      link: `/planning/employees/${who.employeeId}`,
      data: { employee_id: who.employeeId, kind, module_seq: seq },
    });
  } catch {
    /* non bloquant */
  }
  return { ok: true };
}
