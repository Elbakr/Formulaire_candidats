import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildRenewalRecommendation } from "@/lib/cdd-renewal-engine";

export const dynamic = "force-dynamic";

// Scan quotidien : pour chaque employé en CDD dont le contrat se termine dans
// <= 30 jours, prépare une fiche de recommandation (si pas déjà existante en
// statut pending/sent/discussing pour cette date de fin).

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const horizonISO = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  const { data: emps } = await admin
    .from("employees")
    .select("id, full_name, end_date, contract_type")
    .eq("status", "active")
    .ilike("contract_type", "%CDD%")
    .not("end_date", "is", null)
    .gte("end_date", todayISO)
    .lte("end_date", horizonISO);
  type Emp = {
    id: string;
    full_name: string;
    end_date: string;
    contract_type: string | null;
  };
  const empArr = (emps ?? []) as Emp[];

  const created: string[] = [];
  const skipped: string[] = [];

  for (const e of empArr) {
    // Existant ?
    const { data: existing } = await admin
      .from("cdd_renewal_recommendations")
      .select("id, status")
      .eq("employee_id", e.id)
      .eq("contract_end_date", e.end_date)
      .maybeSingle();
    if (existing && ["pending", "sent", "discussing"].includes(((existing as unknown) as { status: string }).status)) {
      skipped.push(e.id);
      continue;
    }

    let recommendation: Awaited<ReturnType<typeof buildRenewalRecommendation>>;
    try {
      recommendation = await buildRenewalRecommendation(e.id);
    } catch (err) {
      console.error(`buildRenewalRecommendation failed for ${e.id}:`, err);
      continue;
    }

    const { error: insErr } = await admin.from("cdd_renewal_recommendations").insert({
      employee_id: e.id,
      contract_end_date: e.end_date,
      recommendation: recommendation.recommendation,
      rationale: recommendation.rationale,
      global_score: recommendation.global_score,
      trends: recommendation.trends,
      site_load_forecast: recommendation.site_load_forecast,
      status: "pending",
    });
    if (insErr) {
      console.error(`insert recommendation failed for ${e.id}:`, insErr.message);
      continue;
    }
    created.push(e.id);
  }

  // Notifie les RH/admin si nouvelles fiches.
  if (created.length > 0) {
    const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
    const rhIds = ((rh ?? []) as Array<{ id: string }>).map((p) => p.id);
    const inserts = rhIds.map((id) => ({
      recipient_id: id,
      kind: "reminder" as const,
      title: "Recommandations CDD prêtes",
      body: `${created.length} fiche${created.length > 1 ? "s" : ""} de renouvellement à examiner.`,
      link: "/admin/cdd-renewals",
      data: { count: created.length },
    }));
    if (inserts.length > 0) await admin.from("notifications").insert(inserts);
  }

  // Karim 2026-06-13 : pre-avis de renouvellement (CDD + Etudiant) a J-15.
  // Prepare la ligne (token) + notifie RH "pret a envoyer". L'envoi du mail au
  // travailleur reste un clic RH (ou auto si active plus tard).
  let preNoticesCreated = 0;
  try {
    const { prepareRenewalNotices } = await import("@/lib/cdd-renewal-notice");
    const prepared = await prepareRenewalNotices(admin as unknown as Parameters<typeof prepareRenewalNotices>[0]);
    preNoticesCreated = prepared.length;
    if (prepared.length > 0) {
      const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
      const rhIds = ((rh ?? []) as Array<{ id: string }>).map((p) => p.id);
      const inserts = rhIds.map((id) => ({
        recipient_id: id,
        kind: "reminder" as const,
        title: `${prepared.length} pré-avis de renouvellement prêt(s) à envoyer`,
        body: `Contrats finissant sous 15 j : ${prepared.map((p) => p.full_name).slice(0, 5).join(", ")}. Envoie le mail au travailleur en 1 clic.`,
        link: "/admin/cdd-renewals",
        data: { count: prepared.length },
      }));
      if (inserts.length > 0) await admin.from("notifications").insert(inserts);
    }
  } catch (e) {
    console.error("prepareRenewalNotices:", e);
  }

  // Karim 2026-06-13 (Phase 3) : clôture d'emploi automatisée. Les employés
  // ACTIFS dont la date de fin de contrat est passée (CDD/Étudiant non renouvelés)
  // sont archivés : archive + Dimona OUT préparée + coupe accès + notice de fin.
  // Idempotent (closeEmployment dédup tout). Greffé ici (cron déjà planifié 5h)
  // pour ne pas modifier le workflow GitHub Actions.
  let closed = 0;
  try {
    const { closeEmployment } = await import("@/lib/employment-lifecycle");
    const { data: past } = await admin
      .from("employees")
      .select("id, end_date")
      .eq("status", "active")
      .not("end_date", "is", null)
      .lt("end_date", todayISO);
    for (const e of ((past ?? []) as Array<{ id: string; end_date: string | null }>)) {
      const r = await closeEmployment(admin, e.id, e.end_date ?? todayISO, "cron_end_date");
      if (r.archived) closed += 1;
    }
  } catch (e) {
    console.error("employment-lifecycle close:", e);
  }

  return NextResponse.json({
    ok: true,
    scanned: empArr.length,
    created: created.length,
    skipped: skipped.length,
    pre_notices_prepared: preNoticesCreated,
    employments_closed: closed,
  });
}
