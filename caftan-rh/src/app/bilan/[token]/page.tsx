import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { BilanClient } from "./bilan-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ton avis compte" };

export default async function BilanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from("training_exit_survey").select("employee_id").eq("token", token).maybeSingle();
  const row = data as { employee_id: string } | null;
  if (!row) notFound();
  const { data: emp } = await admin.from("employees").select("full_name, preferred_language").eq("id", row.employee_id).maybeSingle();
  const e = emp as { full_name: string | null; preferred_language: string | null } | null;
  const lang: "fr" | "nl" = e?.preferred_language === "nl" ? "nl" : "fr";
  const firstName = (e?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  return <BilanClient token={token} lang={lang} firstName={firstName} />;
}
