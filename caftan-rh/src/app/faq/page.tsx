// Karim 2026-06-02 : page FAQ filtree STRICTEMENT par role utilisateur.
// Chaque role voit uniquement ses questions (pas de melange).
// Admin/RH = scope complet de leur role (pas la liste candidate).
// Candidate/employee = scope worker uniquement.

import { requireUser } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFaqForRole } from "@/lib/faq-content";
import { FaqClient } from "./faq-client";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  await requireUser();
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role as string | undefined) ?? "candidate";
  const content = getFaqForRole(role);

  return <FaqClient content={content} role={role} userName={profile?.full_name ?? "Utilisateur"} />;
}
