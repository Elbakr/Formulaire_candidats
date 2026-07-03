"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { prepareContractAction } from "@/app/planning/employees/[id]/contract-actions";

const STR = (v: FormDataEntryValue | null) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();
const NUM = (v: FormDataEntryValue | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function generateReadablePassword(length: number): string {
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = lower + upper + digits + symbols;
  const arr = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  const out: string[] = [
    lower[arr[0] % lower.length],
    upper[arr[1] % upper.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
  ];
  for (let i = 4; i < length; i++) out.push(all[arr[i] % all.length]);
  return out.sort(() => Math.random() - 0.5).join("");
}

export type HireResult = {
  ok?: true;
  error?: string;
  /** Étapes — chaque message est affiché dans la modale de succès. */
  steps: {
    label: string;
    status: "ok" | "warn" | "error";
    detail?: string;
  }[];
  employeeId?: string;
  contractId?: string;
  dimonaCreated?: boolean;
  credentials?: { email: string; password: string };
};

/**
 * Embauche en 1 clic depuis la fiche candidat :
 *  1. Marque l'application 'hired' (le trigger SQL crée la row employees).
 *  2. Met à jour les champs d'embauche sur l'employé créé (contrat, dates, hours).
 *  3. Crée le site_assignment primaire.
 *  4. Pré-remplit un employee_contract en draft.
 *  5. Ajoute une dimona_declaration vide en pending pour rappel.
 *  6. Crée le compte auth si email présent.
 *
 * Aucun de ces sous-steps ne bloque les suivants — chaque étape est tentée
 * indépendamment et reportée comme `ok | warn | error` dans `steps`.
 */
export async function hireCandidateAction(
  applicationId: string,
  formData: FormData,
): Promise<HireResult> {
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();
  const admin = createAdminClient();
  const steps: HireResult["steps"] = [];

  const contractKind = STR(formData.get("contract_kind")) ?? "CDD";
  const startDate = STR(formData.get("start_date"));
  const endDate = contractKind === "CDI" ? null : STR(formData.get("end_date"));
  const siteId = STR(formData.get("site_id"));
  const positionTitle = STR(formData.get("position_title")) ?? "Vendeur·euse";
  const weeklyHours = NUM(formData.get("weekly_hours")) ?? 38;

  if (!startDate) {
    return { error: "Date de début requise.", steps };
  }
  if (!siteId) {
    return { error: "Site principal requis.", steps };
  }

  // 1) Charge l'application + candidat
  const { data: appRaw } = await supabase
    .from("applications")
    .select(
      `id, status, candidate_id,
       candidate:candidates(id, full_name, email, phone)`,
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (!appRaw) return { error: "Candidature introuvable.", steps };
  const app = appRaw as unknown as {
    id: string;
    status: string;
    candidate_id: string;
    candidate: {
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
    } | null;
  };
  const candidate = app.candidate;
  if (!candidate) return { error: "Candidat introuvable.", steps };

  // 2) Update application → 'hired'.
  // Le trigger SQL `promote_application_to_employee()` crée le row employees,
  // mais idempotent : si déjà hired, on n'écrase pas.
  if (app.status !== "hired") {
    const { error: updErr } = await admin
      .from("applications")
      .update({ status: "hired" })
      .eq("id", applicationId);
    if (updErr) {
      steps.push({
        label: "Marquer la candidature embauchée",
        status: "error",
        detail: updErr.message,
      });
      return { error: updErr.message, steps };
    }
  }
  steps.push({
    label: "Candidature marquée comme embauchée",
    status: "ok",
  });

  // 3) Récupère / attend l'employee créé par le trigger.
  let employeeId: string | null = null;
  for (let i = 0; i < 3 && !employeeId; i++) {
    const { data: empRow } = await admin
      .from("employees")
      .select("id")
      .eq("application_id", applicationId)
      .maybeSingle();
    employeeId = (empRow as { id: string } | null)?.id ?? null;
    if (!employeeId) await new Promise((r) => setTimeout(r, 100));
  }

  if (!employeeId) {
    // Filet de sécurité : insertion directe (cas où le trigger serait absent).
    const { data: ins, error: insErr } = await admin
      .from("employees")
      .insert({
        candidate_id: candidate.id,
        application_id: applicationId,
        email: candidate.email,
        full_name: candidate.full_name,
        phone: candidate.phone,
        job_title: positionTitle,
        contract_type: contractKind,
        weekly_hours: weeklyHours,
        start_date: startDate,
        end_date: endDate,
        status: "active",
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      steps.push({
        label: "Créer la fiche employé",
        status: "error",
        detail: insErr?.message,
      });
      return { error: insErr?.message ?? "Création employé échouée.", steps };
    }
    employeeId = (ins as { id: string }).id;
  } else {
    // Met à jour les paramètres d'embauche choisis dans le dialog.
    await admin
      .from("employees")
      .update({
        contract_type: contractKind,
        weekly_hours: weeklyHours,
        start_date: startDate,
        end_date: endDate,
        job_title: positionTitle,
      })
      .eq("id", employeeId);
  }
  steps.push({ label: "Fiche employé prête", status: "ok" });

  // 3ter) Karim 2026-07-03 (audit) : reprise de la CARTE D'IDENTITÉ déclarée par le
  // candidat (PDF recto/verso déjà en storage, lié candidate_id) -> on la rattache
  // à l'employé pour que le dossier contrat ne soit pas bloqué "CI manquante".
  try {
    const { data: idDocs } = await admin
      .from("documents")
      .update({ employee_id: employeeId })
      .eq("candidate_id", candidate.id)
      .eq("kind", "id_card")
      .is("employee_id", null)
      .select("id");
    if (idDocs && idDocs.length > 0) {
      steps.push({ label: "Carte d'identité reprise du dossier candidat", status: "ok" });
    }
  } catch {
    /* best-effort — ne bloque jamais l'embauche */
  }

  // 3bis) Karim 2026-07-03 : rejeu des INDISPONIBILITÉS déclarées par le candidat
  // en pré-embauche (étape 2 du formulaire) -> employee_unavailabilities. L'auto-
  // planning les respecte immédiatement. Idempotent : on ne rejoue pas si la fiche
  // employé a déjà des indispos (évite les doublons si l'embauche est relancée).
  try {
    const { count: existingUnavail } = await admin
      .from("employee_unavailabilities")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId);
    if (!existingUnavail) {
      const { data: cUnavail } = await admin
        .from("candidate_unavailabilities")
        .select("day_of_week, date_specific, date_end, start_time, end_time, reason, notes")
        .eq("candidate_id", candidate.id)
        .eq("is_active", true);
      const rows: Array<Record<string, unknown>> = [];
      for (const u of (cUnavail ?? []) as Array<{ day_of_week: number | null; date_specific: string | null; date_end: string | null; start_time: string | null; end_time: string | null; reason: string | null; notes: string | null }>) {
        const base = { employee_id: employeeId, start_time: u.start_time, end_time: u.end_time, reason: u.reason, notes: u.notes, is_active: true };
        if (u.date_end && u.date_specific) {
          // Période (vacances du..au) -> une ligne par jour (employee_unavailabilities = date unique).
          const d = new Date(u.date_specific + "T00:00:00Z");
          const end = new Date(u.date_end + "T00:00:00Z");
          let guard = 0;
          while (d <= end && guard < 400) {
            rows.push({ ...base, day_of_week: null, date_specific: d.toISOString().slice(0, 10) });
            d.setUTCDate(d.getUTCDate() + 1);
            guard++;
          }
        } else {
          rows.push({ ...base, day_of_week: u.day_of_week, date_specific: u.date_specific });
        }
      }
      if (rows.length > 0) {
        await admin.from("employee_unavailabilities").insert(rows);
        steps.push({ label: `${rows.length} indisponibilité(s) déclarée(s) reprises dans le planning`, status: "ok" });
      }
    }
  } catch {
    /* best-effort — ne bloque jamais l'embauche */
  }

  // 4) Site assignment primaire — clôture les autres assignments primaires
  // ouverts pour ce nouvel employé (idempotent).
  try {
    await admin
      .from("site_assignments")
      .update({ end_date: startDate })
      .eq("employee_id", employeeId)
      .is("end_date", null);
    const { error: assignErr } = await admin.from("site_assignments").insert({
      employee_id: employeeId,
      site_id: siteId,
      start_date: startDate,
      is_primary: true,
      pct: 100,
    });
    if (assignErr) {
      steps.push({
        label: "Affectation au site principal",
        status: "warn",
        detail: assignErr.message,
      });
    } else {
      steps.push({ label: "Site principal affecté", status: "ok" });
    }
  } catch (err) {
    steps.push({
      label: "Affectation au site principal",
      status: "warn",
      detail: (err as Error).message,
    });
  }

  // 5) Pré-remplit un contrat draft.
  let contractId: string | undefined;
  try {
    const r = await prepareContractAction(employeeId);
    if (r.ok && r.contractId) {
      contractId = r.contractId;
      steps.push({
        label: "Contrat préparé en brouillon",
        status: "ok",
      });
    } else if (r.error) {
      steps.push({
        label: "Contrat préparé",
        status: "warn",
        detail: r.error,
      });
    }
  } catch (err) {
    steps.push({
      label: "Contrat préparé",
      status: "warn",
      detail: (err as Error).message,
    });
  }

  // 6) Dimona row pending pour rappel.
  let dimonaCreated = false;
  try {
    const { data: existingDimona } = await admin
      .from("dimona_declarations")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("start_date", startDate)
      .in("status", ["pending", "declared_onss", "confirmed"])
      .maybeSingle();
    if (!existingDimona) {
      const { error: dimErr } = await admin.from("dimona_declarations").insert({
        employee_id: employeeId,
        contract_id: contractId ?? null,
        declaration_kind: "IN",
        start_date: startDate,
        end_date: endDate,
        worker_type: contractKind === "Étudiant" ? "STU" : "OTH",
        status: "pending",
        notes: "À déclarer sur le portail ONSS avant le démarrage.",
      });
      if (dimErr) {
        steps.push({
          label: "Dimona en attente",
          status: "warn",
          detail: dimErr.message,
        });
      } else {
        dimonaCreated = true;
        steps.push({
          label: `Dimona à déclarer avant le ${startDate}`,
          status: "warn",
        });
      }
    } else {
      steps.push({
        label: "Dimona déjà tracée — vérifie son statut",
        status: "ok",
      });
    }
  } catch (err) {
    steps.push({
      label: "Dimona en attente",
      status: "warn",
      detail: (err as Error).message,
    });
  }

  // 7) Compte auth si email.
  let credentials: { email: string; password: string } | undefined;
  if (candidate.email) {
    try {
      const password = generateReadablePassword(12);
      let userId: string | null = null;
      const { data: pages } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const existing = pages?.users.find(
        (u) => u.email?.toLowerCase() === candidate.email.toLowerCase(),
      );
      if (existing) {
        // Karim 2026-05-30 : SECURITY - si l email du candidat correspond a
        // un user existant en role admin/rh/manager, REFUSER l ecrasement.
        // Sans ce garde, embaucher un candidat avec l email du patron
        // ecrasait son mdp et dégradait son rôle a 'candidate'.
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("role")
          .eq("id", existing.id)
          .maybeSingle();
        const protectedRole = existingProfile?.role && ["admin", "rh", "manager"].includes(existingProfile.role);
        const { data: adminEmail } = await admin
          .from("admin_emails")
          .select("email")
          .eq("email", candidate.email.toLowerCase())
          .maybeSingle();
        if (protectedRole || adminEmail) {
          throw new Error(
            `L'email ${candidate.email} correspond a un compte ${existingProfile?.role ?? "admin"} existant et ne peut pas etre transforme en compte employee. Utilise un autre email pour ce candidat.`,
          );
        }
        userId = existing.id;
        await admin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: candidate.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: candidate.full_name },
        });
        if (error) throw error;
        userId = data.user.id;
      }
      // Karim 2026-05-30 : preserve le role existant si superieur a 'candidate'
      // (utilise insert + on conflict do nothing si role plus eleve deja en place)
      await admin
        .from("profiles")
        .upsert(
          {
            id: userId!,
            email: candidate.email,
            full_name: candidate.full_name,
            role: "candidate",
          },
          { onConflict: "id", ignoreDuplicates: false },
        );
      // Garde-fou supplementaire : ne JAMAIS degrader un admin/rh/manager
      await admin
        .from("profiles")
        .update({ role: "candidate" })
        .eq("id", userId!)
        .not("role", "in", "(admin,rh,manager)");
      await admin
        .from("employees")
        .update({ profile_id: userId })
        .eq("id", employeeId);
      credentials = { email: candidate.email, password };
      steps.push({ label: "Compte employé créé", status: "ok" });
    } catch (err) {
      steps.push({
        label: "Compte employé",
        status: "warn",
        detail: (err as Error).message,
      });
    }
  } else {
    steps.push({
      label: "Compte employé",
      status: "warn",
      detail:
        "Pas d'email sur la fiche candidat — ajoute-en un puis utilise « Inviter ».",
    });
  }

  revalidatePath(`/rh/candidates/${applicationId}`);
  revalidatePath(`/planning/employees/${employeeId}`);
  revalidatePath("/planning/employees");
  revalidatePath("/today");
  revalidatePath("/rh/candidates");

  return {
    ok: true,
    steps,
    employeeId: employeeId,
    contractId,
    dimonaCreated,
    credentials,
  };
}
