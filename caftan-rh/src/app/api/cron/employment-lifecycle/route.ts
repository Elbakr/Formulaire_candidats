import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { closeEmployment } from "@/lib/employment-lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Karim 2026-06-13 (Phase 3) : cron quotidien de clôture d'emploi.
// Archive automatiquement les employés ACTIFS dont la date de fin de contrat
// est passée (CDD/Étudiant non renouvelés) : archive + Dimona OUT préparée +
// coupe accès + notice. Idempotent (closeEmployment dédup tout). Les décisions
// légales (signature rupture, non-renouvellement) restent humaines en amont.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: emps } = await admin
    .from("employees")
    .select("id, full_name, end_date, contract_type")
    .eq("status", "active")
    .not("end_date", "is", null)
    .lt("end_date", todayISO);

  const list = (emps ?? []) as Array<{ id: string; end_date: string | null }>;
  let archived = 0;
  for (const e of list) {
    const r = await closeEmployment(admin, e.id, e.end_date ?? todayISO, "cron_end_date");
    if (r.archived) archived += 1;
  }

  return NextResponse.json({ ok: true, scanned: list.length, archived });
}
