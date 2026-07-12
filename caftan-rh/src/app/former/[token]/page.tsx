// Karim 2026-07-12 : page PUBLIQUE de formation du travailleur (accès par token
// durable, sans compte). Affiche la section courante (dernière envoyée) + boutons +
// champ commentaire. Terminé = écran de félicitations.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { FormerClient, type TrainingModuleView } from "./former-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ma formation",
  applicationName: "Ma formation",
};

export default async function FormerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: enrRaw } = await admin
    .from("training_enrollments")
    .select("employee_id, current_seq, status")
    .eq("token", token)
    .maybeSingle();
  const enr = enrRaw as { employee_id: string; current_seq: number; status: string } | null;
  if (!enr) notFound();

  const { data: empRaw } = await admin
    .from("employees")
    .select("full_name, preferred_language")
    .eq("id", enr.employee_id)
    .maybeSingle();
  const emp = empRaw as { full_name: string | null; preferred_language: string | null } | null;
  const lang: "fr" | "nl" = emp?.preferred_language === "nl" ? "nl" : "fr";

  const { data: maxRow } = await admin
    .from("training_modules")
    .select("seq")
    .eq("is_active", true)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const total = (maxRow as { seq: number } | null)?.seq ?? 0;

  const seq = Math.max(1, enr.current_seq || 1);

  // Formation terminée ?
  if (enr.status === "done" || seq > total) {
    const prenom = (emp?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
    return (
      <div className="min-h-[100dvh] bg-ink flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
          <div className="text-4xl">🎓</div>
          <h1 className="text-xl font-bold text-ink mt-2">
            {lang === "nl" ? "Proficiat, opleiding voltooid!" : "Bravo, formation terminée !"}
          </h1>
          <p className="text-sm text-ink-2 mt-1.5">
            {lang === "nl"
              ? `Goed gedaan${prenom ? ", " + prenom : ""}! Je hebt de volledige opleiding doorlopen. 🙌`
              : `Beau parcours${prenom ? ", " + prenom : ""} ! Tu as suivi toute la formation. 🙌`}
          </p>
        </div>
      </div>
    );
  }

  const { data: modRaw } = await admin
    .from("training_modules")
    .select("seq, kind, category, title_fr, title_nl, body_fr, body_nl, exam_level")
    .eq("seq", seq)
    .eq("is_active", true)
    .maybeSingle();
  const mod = modRaw as TrainingModuleView | null;
  if (!mod) notFound();

  const { data: ev } = await admin
    .from("training_events")
    .select("confirmed_at")
    .eq("employee_id", enr.employee_id)
    .eq("module_seq", seq)
    .maybeSingle();
  const confirmed = !!(ev as { confirmed_at: string | null } | null)?.confirmed_at;

  return <FormerClient token={token} total={total} module={mod} confirmed={confirmed} initialLang={lang} />;
}
