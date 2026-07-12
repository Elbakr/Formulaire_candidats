import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { PoulsClient } from "./pouls-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Un petit mot" };

export default async function PoulsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from("training_sentiment").select("employee_id, answered_at").eq("token", token).maybeSingle();
  const row = data as { employee_id: string; answered_at: string | null } | null;
  if (!row) notFound();
  const { data: emp } = await admin.from("employees").select("preferred_language").eq("id", row.employee_id).maybeSingle();
  const lang: "fr" | "nl" = (emp as { preferred_language: string | null } | null)?.preferred_language === "nl" ? "nl" : "fr";
  return <PoulsClient token={token} lang={lang} />;
}
