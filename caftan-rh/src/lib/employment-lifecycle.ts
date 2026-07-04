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
      .select("id, profile_id, full_name, email, contract_type, status, end_date, preferred_language, offboarding_pack_sent_at")
      .eq("id", employeeId)
      .maybeSingle();
    const emp = empRaw as {
      id: string; profile_id: string | null; full_name: string | null; email: string | null;
      contract_type: string | null; status: string | null; end_date: string | null; preferred_language: string | null;
      offboarding_pack_sent_at: string | null;
    } | null;
    if (!emp) return { archived: false };

    const eff = (effectiveDate || todayISO()).slice(0, 10);
    const due = eff <= todayISO();
    const wasArchived = emp.status === "archived";

    // Karim 2026-07-03 : à la fin de contrat, le CRON (cause 'cron_end_date')
    // n'ARCHIVE PAS tant que le pack de sortie n'a pas été envoyé
    // (offboarding_pack_sent_at). L'employé reste "en sortie" (actif + end_date
    // passé + pack non envoyé) et RH est notifié une fois pour l'envoyer. Les
    // archivages MANUELS (rupture, non-renouvellement) restent immédiats.
    const packSent = !!emp.offboarding_pack_sent_at;
    const gateForOffboarding = cause === "cron_end_date" && !packSent;
    const willArchive = due && !gateForOffboarding;

    // 1. end_date (toujours) + 2. archive uniquement si on ne gate pas.
    const update: Record<string, unknown> = { end_date: eff };
    if (willArchive) update.status = "archived";
    await admin.from("employees").update(update).eq("id", employeeId);

    let role: string | null = null;
    if (emp.profile_id) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", emp.profile_id).maybeSingle();
      role = (prof as { role?: string } | null)?.role ?? null;
    }

    if (willArchive && !wasArchived) {
      // clôt les affectations + coupe l'accès.
      await admin.from("site_assignments").update({ end_date: eff }).eq("employee_id", employeeId).is("end_date", null);
      if (emp.profile_id) await banAuthUser(true, emp.profile_id, role);
    }

    // 3. Dimona OUT préparée (validation humaine), idempotent. À l'échéance
    // (obligation légale), même si l'archivage est différé pour le pack.
    const workerType = emp.contract_type === "Étudiant" ? "STU" : "OTH";
    const { upsertDimonaDeclaration } = await import("@/lib/dimona");
    await upsertDimonaDeclaration(admin, {
      employee_id: employeeId,
      declaration_kind: "OUT",
      start_date: eff, // OUT : start_date NOT NULL = date d'effet de la sortie
      end_date: eff,
      employer_org_key: "amd_megastore",
      worker_type: workerType,
      status: "pending",
    });

    // 4. Notif RH : Dimona OUT à déclarer — dédup (1 par employé, sinon le cron
    // quotidien re-notifierait chaque jour un employé "en sortie").
    try {
      const { data: existingDimona } = await admin
        .from("notifications").select("id")
        .eq("kind", "dimona_out_todo").contains("data", { employee_id: employeeId })
        .limit(1).maybeSingle();
      if (!existingDimona) {
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
      }
    } catch { /* best-effort */ }

    // 4b. "En sortie" : contrat terminé mais pack pas encore envoyé → notifier RH
    // (1 fois) d'envoyer le pack, puis STOP (ni archivage ni notice de fin).
    if (gateForOffboarding && due) {
      try {
        const { data: existingTodo } = await admin
          .from("notifications").select("id")
          .eq("kind", "offboarding_pack_todo").contains("data", { employee_id: employeeId })
          .limit(1).maybeSingle();
        if (!existingTodo) {
          const { data: rh } = await admin.from("profiles").select("id").in("role", ["admin", "rh"]);
          const inserts = ((rh ?? []) as Array<{ id: string }>).map((p) => ({
            recipient_id: p.id,
            kind: "offboarding_pack_todo",
            title: `Pack de sortie à envoyer — ${emp.full_name ?? "employé"}`,
            body: `Contrat terminé le ${eff}. Envoie le pack de sortie (fiches payées + C4) : l'employé sera archivé automatiquement ensuite.`,
            link: "/admin/payslips",
            data: { employee_id: employeeId, effective_date: eff },
          }));
          if (inserts.length > 0) await admin.from("notifications").insert(inserts);
        }
      } catch { /* best-effort */ }
      return { archived: false };
    }

    // 5. Notice de fin au travailleur — 1 SEULE fois, uniquement à l'archivage réel.
    const wantNotice = opts?.sendNotice ?? (willArchive && !wasArchived);
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
          link: "/me/documents",
          data: { effective_date: eff, cause },
        });
        // Email best-effort via EmailJS (canal employé).
        // Karim 2026-07-02 : outreach auto SEULEMENT si déclenché par le cron
        // (cause 'cron_end_date'). Une rupture finalisée À LA MAIN par l'admin
        // n'est pas soumise au kill-switch (envoi manuel).
        await sendEndNoticeEmail(emp.email, emp.full_name, eff, emp.id, cause === "cron_end_date");
      }
    }

    return { archived: willArchive };
  } catch {
    return { archived: false };
  }
}

async function sendEndNoticeEmail(email: string | null, fullName: string | null, eff: string, employeeId?: string, automated?: boolean) {
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
      automated,
      employeeId,
    });
  } catch { /* best-effort */ }
}
