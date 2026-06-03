// Karim 2026-06-03 : cron 1er janvier minuit 5min - cree les soldes de
// l annee N pour tous les employes actifs (rest a 20j × prorata × temps),
// avec carry-over depuis N-1 si configure (en Belgique, en general non
// reportable, mais on laisse l option pour adaptation future).
//
// Difference avec leave-balance-recompute (hebdo) :
// - Hebdo : update les balances annee courante
// - Annuel : INITIALISE nouvelle annee + archive l ancienne

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { recomputeAllBalances } from "@/lib/leave-balance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const newYear = new Date().getFullYear();
  const oldYear = newYear - 1;

  // 1. Calcule les nouveaux balances pour année courante
  const result = await recomputeAllBalances(newYear);

  // 2. Notif aux admins pour les soldes restants N-1 (non utilisés)
  try {
    const { data: oldRest } = await admin
      .from("leave_balances")
      .select("employee_id, remaining_days, employee:employees(full_name)")
      .eq("year", oldYear)
      .gt("remaining_days", 0);
    const totalLost = (oldRest ?? []).reduce((s, b) => s + Number((b as { remaining_days: number }).remaining_days), 0);
    if (totalLost > 0) {
      const { data: hrs } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
      const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
      for (const hrId of hrIds) {
        await admin.from("notifications").insert({
          recipient_id: hrId,
          kind: "leave_balance_reset",
          title: `📅 Soldes congés réinitialisés (${newYear})`,
          body: `Nouvelle année : ${result.updated} balances créées. ${totalLost.toFixed(1)} j non utilisés ${oldYear} (généralement perdus en BE sauf accord).`,
          link: `/rh/stats`,
          data: { year: newYear, totalLost },
        });
      }
    }
  } catch (e) {
    console.warn("[leave-new-year] notif err:", (e as Error).message);
  }

  return NextResponse.json({ ok: true, newYear, oldYear, ...result });
}
