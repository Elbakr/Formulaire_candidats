// Karim 2026-06-13 (Phase 3 cycle de vie) : clôture d'emploi AUTOMATISÉE.
// « Auto à fond, la décision/signature légale reste humaine. »
//
// Appelée quand un licenciement est SIGNÉ (DocuSeal fully_signed) ou qu'un CDD
// est NON RENOUVELÉ, et par un cron quotidien pour les CDD dont la date de fin
// est passée. Elle :
//   1. pose employees.end_date = date effective ;
//   2. si la date est atteinte : archive l'employé + clôt les site_assignments
//      + COUPE L'ACCÈS (ban du compte auth, jamais un compte staff) ;
//   3. PRÉPARE la Dimona OUT (status='pending' -> validation humaine) ;
//   4. notifie le RH (Dimona OUT à déclarer) ;
//   5. envoie une notice de fin au travailleur (1 seule fois, dédup).
//
// 100% best-effort : ne jette jamais (ne casse pas le flux appelant).

import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminClient>;
type Cause = "termination" | "non_renewal" | "cron_end_date";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function banAuthUser(adminAuthBan: boolean, profileId: string, role: string | null) {
  if (!adminAuthBan) return;
  // Ne JAMAIS bannir un compte staff.
  if (role === "admin" || role === "rh" || role === "manager") return;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const a = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    // ban_duration très long = accès coupé (réversible à la réactivation).
    await a.auth.admin.updateUserById(profileId, { ban_duration: "876000h" });
  } catch { /* best-effort */ }
}

export async function closeEmployment(
  admin: Admin,
  employeeId: string,
  effectiveDate: string,
  cause: Cause,
  opts?: { sendNotice?: boolean },
): Promise<{ archived: boolean }> {
  try {
    const { data: empRaw } = await admin
      .from("employees")
      .select("id, profile_id, full_name, email, contract_type, status, end_date, preferred_language")
      .eq("id", employeeId)
      .maybeSingle();
    const emp = empRaw as {
      id: string; profile_id: string | null; full_name: string | null; email: string | null;
      contract_type: string | null; status: string | null; end_date: string | null; preferred_language: string | null;
    } | null;
    if (!emp) return { archived: false };

    const eff = (effectiveDate || todayISO()).slice(0, 10);
    const due = eff <= todayISO();
    const wasArchived = emp.status === "archived";

    // 1. end_date (toujours) + 2. archive si la date est atteinte.
    const update: Record<string, unknown> = { end_date: eff };
    if (due) update.status = "archived";
    await admin.from("employees").update(update).eq("id", employeeId);

    let role: string | null = null;
    if (emp.profile_id) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", emp.profile_id).maybeSingle();
      role = (prof as { role?: string } | null)?.role ?? null;
    }

    if (due && !wasArchived) {
      // clôt les affectations + coupe l'accès.
      await admin.from("site_assignments").update({ end_date: eff }).eq("employee_id", employeeId).is("end_date", null);
      if (emp.profile_id) await banAuthUser(true, emp.profile_id, role);
    }

    // 3. Dimona OUT préparée (validation humaine), idempotent.
    const workerType = emp.contract_type === "Étudiant" ? "STU" : "OTH";
    await admin.from("dimona_declarations").upsert({
      employee_id: employeeId,
      kind: "out",
      declared_end_date: eff,
      employer_org_key: "amd_megastore",
      worker_type: workerType,
      status: "pending",
    }, { onConflict: "employee_id,kind" });

    // 4. Notif RH : Dimona OUT à déclarer (1 par employé, dédup via tag-like check).
    try {
      const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
      const inserts = ((rh ?? []) as Array<{ id: string }>).map((p) => ({
        recipient_id: p.id,
        kind: "dimona_out_todo",
        title: `Dimona OUT à déclarer — ${emp.full_name ?? "employé"}`,
        body: `Fin de contrat le ${eff} (${cause === "non_renewal" ? "non-renouvellement" : cause === "termination" ? "rupture" : "fin CDD"}). Déclare la sortie Dimona.`,
        link: `/planning/employees/${employeeId}`,
        data: { employee_id: employeeId, effective_date: eff },
      }));
      if (inserts.length > 0) await admin.from("notifications").insert(inserts);
    } catch { /* best-effort */ }

    // 5. Notice de fin au travailleur — 1 SEULE fois (dédup via notification marqueur).
    const wantNotice = opts?.sendNotice ?? (due && !wasArchived);
    if (wantNotice && emp.profile_id) {
      const { data: already } = await admin
        .from("notifications")
        .select("id")
        .eq("recipient_id", emp.profile_id)
        .eq("kind", "employment_end_notice")
        .limit(1)
        .maybeSingle();
      if (!already) {
        await admin.from("notifications").insert({
          recipient_id: emp.profile_id,
          kind: "employment_end_notice",
          title: "Fin de ton contrat",
          body: `Ton contrat chez Caftan Factory prend fin le ${eff}. Merci pour ton engagement. L'équipe RH revient vers toi pour les documents de fin (C4, solde).`,
          link: "/me",
          data: { effective_date: eff, cause },
        });
        // Email best-effort via EmailJS (canal employé).
        await sendEndNoticeEmail(emp.email, emp.full_name, eff);
      }
    }

    return { archived: !!due };
  } catch {
    return { archived: false };
  }
}

async function sendEndNoticeEmail(email: string | null, fullName: string | null, eff: string) {
  if (!email) return;
  const { sendAppMail } = await import("@/lib/app-mail");
  const first = (fullName ?? "").split(/\s+/)[0] ?? "";
  const body =
    `Bonjour ${first},\n\n` +
    `Nous t'informons que ton contrat chez Caftan Factory (By AMD Megastore) prend fin le ${eff}.\n` +
    `Merci sincèrement pour ton travail et ton engagement parmi nous.\n\n` +
    `L'équipe RH te transmettra les documents de fin de contrat (C4, solde de tout compte) dans les meilleurs délais.\n\n` +
    `Au plaisir,\nCaftan Factory — RH`;
  try {
    await sendAppMail({
      to: email,
      toName: fullName || email,
      subject: "Fin de ton contrat — Caftan Factory",
      body,
      source: "employment_end",
    });
  } catch { /* best-effort */ }
}
