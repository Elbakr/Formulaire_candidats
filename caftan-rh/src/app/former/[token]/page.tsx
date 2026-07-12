// Karim 2026-07-12 : page PUBLIQUE de formation du travailleur (accès par token
// durable, sans compte). Affiche la section courante (dernière envoyée) + boutons +
// champ commentaire. Terminé = écran de félicitations.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { FormerClient, type TrainingModuleView } from "./former-client";
import { FormerEnrolling, FormerDenied, FormerClosed } from "./former-gate";
import { sha256, FORM_BIND_COOKIE } from "./binding";

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
    .select("id, employee_id, current_seq, status, bound_secret")
    .eq("token", token)
    .maybeSingle();
  const enr = enrRaw as {
    id: string;
    employee_id: string;
    current_seq: number;
    status: string;
    bound_secret: string | null;
  } | null;
  if (!enr) notFound();

  const { data: empRaw } = await admin
    .from("employees")
    .select("full_name, preferred_language, end_date, status")
    .eq("id", enr.employee_id)
    .maybeSingle();
  const emp = empRaw as { full_name: string | null; preferred_language: string | null; end_date: string | null; status: string | null } | null;
  const lang: "fr" | "nl" = emp?.preferred_language === "nl" ? "nl" : "fr";
  const prenom = (emp?.full_name ?? "").trim().split(/\s+/)[0] ?? "";

  // Karim 2026-07-12 : le lien MEURT au terme du contrat — plus AUCUN accès au contenu
  // (protection du savoir-faire : pas de fuite du « modus operandi »). Fermé aussi si
  // le travailleur n'est plus actif ou si la formation est marquée expirée.
  const todayBxl = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const contractEnded = !!emp?.end_date && emp.end_date.slice(0, 10) < todayBxl;
  if (contractEnded || emp?.status === "archived" || enr.status === "expired") {
    return <FormerClosed lang={lang} />;
  }

  // VERROUILLAGE APPAREIL : 1re ouverture -> lie cet appareil ; sinon exige le cookie.
  if (!enr.bound_secret) {
    return <FormerEnrolling token={token} firstName={prenom} lang={lang} />;
  }
  const cookieStore = await cookies();
  const secret = cookieStore.get(`${FORM_BIND_COOKIE}_${enr.id}`)?.value ?? "";
  if (!secret || sha256(secret) !== enr.bound_secret) {
    return <FormerDenied lang={lang} />;
  }

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
    .select("seq, kind, category, title_fr, title_nl, body_fr, body_nl, exam_level, questions")
    .eq("seq", seq)
    .eq("is_active", true)
    .maybeSingle();
  const modFull = modRaw as (TrainingModuleView & { questions: unknown }) | null;
  if (!modFull) notFound();
  const { questions: rawQuestions, ...mod } = modFull;

  // Questions d'examen SANS les bonnes réponses (jamais exposées au client).
  const examQuestions =
    mod.kind === "exam" && Array.isArray(rawQuestions)
      ? (rawQuestions as Array<Record<string, unknown>>).map((q) => ({
          q_fr: String(q.q_fr ?? ""),
          q_nl: q.q_nl ? String(q.q_nl) : null,
          choices_fr: Array.isArray(q.choices_fr) ? (q.choices_fr as string[]) : [],
          choices_nl: Array.isArray(q.choices_nl) ? (q.choices_nl as string[]) : null,
        }))
      : [];

  const { data: ev } = await admin
    .from("training_events")
    .select("confirmed_at")
    .eq("employee_id", enr.employee_id)
    .eq("module_seq", seq)
    .maybeSingle();
  const confirmed = !!(ev as { confirmed_at: string | null } | null)?.confirmed_at;

  return (
    <FormerClient
      token={token}
      total={total}
      module={mod}
      examQuestions={examQuestions}
      confirmed={confirmed}
      initialLang={lang}
    />
  );
}
