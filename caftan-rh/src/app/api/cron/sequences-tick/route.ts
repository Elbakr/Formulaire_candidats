import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { renderTemplate, firstNameOf, type OrgVars } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

type RunStepRow = {
  id: string;
  run_id: string;
  step_id: string | null;
  position: number;
  kind: "email" | "notification" | "note" | "wait" | "set_status";
  fire_at: string;
  status: "pending" | "done" | "skipped" | "failed";
  payload: StepPayload | null;
};

type StepPayload = {
  delay_days?: number | null;
  email_template_slug?: string | null;
  email_subject_override?: string | null;
  email_custom_message?: string | null;
  notification_target?: string | null;
  notification_title?: string | null;
  notification_body?: string | null;
  note_body?: string | null;
  set_status_to?: string | null;
};

type RunMeta = {
  id: string;
  application_id: string;
  triggered_by: string | null;
  sequence_id: string;
};

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const errors: Array<{ step_id: string; error: string }> = [];
  let processed = 0;

  // Pull due steps
  const { data: dueSteps, error: dueErr } = await admin
    .from("sequence_run_steps")
    .select("id, run_id, step_id, position, kind, fire_at, status, payload")
    .eq("status", "pending")
    .lte("fire_at", new Date().toISOString())
    .order("fire_at", { ascending: true })
    .limit(100);

  if (dueErr) {
    return NextResponse.json({ error: dueErr.message }, { status: 500 });
  }

  const steps = (dueSteps ?? []) as unknown as RunStepRow[];

  // Cache org_settings once per tick
  const { data: orgRow } = await admin
    .from("org_settings")
    .select("org_name, org_email, org_phone, org_whatsapp, org_address")
    .eq("id", 1)
    .single();
  const orgVars: OrgVars = {
    org_name: (orgRow as { org_name?: string } | null)?.org_name ?? "Caftan Factory",
    org_email: (orgRow as { org_email?: string } | null)?.org_email ?? "hr@caftanfactory.com",
    org_phone: (orgRow as { org_phone?: string } | null)?.org_phone ?? "+32 468 59 61 00",
    org_whatsapp: (orgRow as { org_whatsapp?: string } | null)?.org_whatsapp ?? "32468596100",
    org_address:
      (orgRow as { org_address?: string } | null)?.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek",
  };

  // Cache run metadata
  const runIds = Array.from(new Set(steps.map((s) => s.run_id)));
  const runsById = new Map<string, RunMeta>();
  if (runIds.length > 0) {
    const { data: runs } = await admin
      .from("sequence_runs")
      .select("id, application_id, triggered_by, sequence_id")
      .in("id", runIds);
    for (const r of (runs ?? []) as unknown as RunMeta[]) {
      runsById.set(r.id, r);
    }
  }

  for (const step of steps) {
    const run = runsById.get(step.run_id);
    if (!run) {
      errors.push({ step_id: step.id, error: "run not found" });
      await markStep(admin, step.id, "failed", { error: "run_not_found" });
      continue;
    }

    try {
      switch (step.kind) {
        case "email":
          await handleEmailStep(admin, step, run, orgVars);
          break;
        case "notification":
          await handleNotificationStep(admin, step, run);
          break;
        case "note":
          await handleNoteStep(admin, step, run, orgVars);
          break;
        case "wait":
          // Pure delay marker: just mark as done. Subsequent steps already have their own fire_at.
          await markStep(admin, step.id, "done", { wait_completed: true });
          break;
        case "set_status":
          await handleSetStatusStep(admin, step, run);
          break;
        default:
          await markStep(admin, step.id, "skipped", { reason: "unknown_kind" });
      }
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ step_id: step.id, error: msg });
      await markStep(admin, step.id, "failed", { error: msg });
    }

    // After processing, check if run is finished (no more pending steps)
    await maybeFinishRun(admin, run.id);
  }

  return NextResponse.json({ processed, errors });
}

type Admin = ReturnType<typeof createAdminClient>;

async function markStep(
  admin: Admin,
  stepId: string,
  status: "done" | "skipped" | "failed",
  result: Record<string, unknown>,
) {
  await admin
    .from("sequence_run_steps")
    .update({ status, fired_at: new Date().toISOString(), result })
    .eq("id", stepId);
}

async function maybeFinishRun(admin: Admin, runId: string) {
  const { count } = await admin
    .from("sequence_run_steps")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("status", "pending");
  if ((count ?? 0) === 0) {
    await admin
      .from("sequence_runs")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("status", "active");
  }
}

async function handleEmailStep(admin: Admin, step: RunStepRow, run: RunMeta, orgVars: OrgVars) {
  const payload = step.payload ?? {};
  const slug = payload.email_template_slug;
  if (!slug) {
    await markStep(admin, step.id, "skipped", { reason: "no_template_slug" });
    return;
  }

  // Fetch template + candidate
  const [{ data: tmpl }, { data: app }] = await Promise.all([
    admin
      .from("email_templates")
      .select("slug, subject, body_html")
      .eq("slug", slug)
      .single(),
    admin
      .from("applications")
      .select("id, candidate:candidates(email, full_name)")
      .eq("id", run.application_id)
      .single(),
  ]);

  if (!tmpl) {
    await markStep(admin, step.id, "failed", { error: "template_not_found", slug });
    return;
  }
  type AppRow = { id: string; candidate: { email: string; full_name: string } | null };
  const appRow = app as unknown as AppRow | null;
  if (!appRow?.candidate?.email) {
    await markStep(admin, step.id, "skipped", { reason: "candidate_no_email" });
    return;
  }

  const t = tmpl as unknown as { subject: string; body_html: string };
  const vars = {
    ...orgVars,
    firstname: firstNameOf(appRow.candidate.full_name),
    fullname: appRow.candidate.full_name,
    custom: payload.email_custom_message ?? "",
    dates: "",
    times: "",
  };
  const subject = renderTemplate(payload.email_subject_override || t.subject, vars);
  const body = renderTemplate(t.body_html, vars);

  // NOTE: We don't actually deliver an email here — Resend is disabled (no API key) in this env.
  // We log a "draft sent" record to messages so the candidate's history shows it; the user
  // sends the real email manually via the EmailJS UI in the candidate detail page if needed.
  const { error: msgErr } = await admin.from("messages").insert({
    application_id: run.application_id,
    direction: "outbound",
    sender_id: run.triggered_by,
    subject,
    body: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000),
    email_provider_id: "sequence",
  });
  if (msgErr) {
    await markStep(admin, step.id, "failed", { error: msgErr.message });
    return;
  }
  await markStep(admin, step.id, "done", { template: slug, to: appRow.candidate.email });
}

async function handleNotificationStep(admin: Admin, step: RunStepRow, run: RunMeta) {
  const payload = step.payload ?? {};
  const target = (payload.notification_target ?? "rh").toLowerCase();
  const title = payload.notification_title ?? "Sequence notification";
  const body = payload.notification_body ?? null;

  // Resolve recipients
  const recipients: string[] = [];

  // Get application + candidate's profile + assigned manager
  const { data: app } = await admin
    .from("applications")
    .select(
      "id, assigned_manager, candidate:candidates(profile_id)",
    )
    .eq("id", run.application_id)
    .single();
  type AppRow = {
    id: string;
    assigned_manager: string | null;
    candidate: { profile_id: string | null } | null;
  };
  const a = app as unknown as AppRow | null;

  if (target === "manager") {
    if (a?.assigned_manager) recipients.push(a.assigned_manager);
  } else if (target === "candidate") {
    if (a?.candidate?.profile_id) recipients.push(a.candidate.profile_id);
  } else {
    // 'rh' (default) — all rh+admin
    const { data: rhUsers } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "rh"]);
    for (const u of (rhUsers ?? []) as { id: string }[]) recipients.push(u.id);
  }

  if (recipients.length === 0) {
    await markStep(admin, step.id, "skipped", { reason: "no_recipients", target });
    return;
  }

  const link = `/rh/candidates/${run.application_id}`;
  const inserts = recipients.map((rid) => ({
    recipient_id: rid,
    kind: "sequence",
    title,
    body,
    link,
    data: { application_id: run.application_id, sequence_id: run.sequence_id },
  }));
  const { error } = await admin.from("notifications").insert(inserts);
  if (error) {
    await markStep(admin, step.id, "failed", { error: error.message });
    return;
  }
  await markStep(admin, step.id, "done", { recipients_count: recipients.length, target });
}

async function handleNoteStep(admin: Admin, step: RunStepRow, run: RunMeta, orgVars: OrgVars) {
  const payload = step.payload ?? {};
  const raw = payload.note_body ?? "";
  if (!raw.trim()) {
    await markStep(admin, step.id, "skipped", { reason: "empty_note" });
    return;
  }

  // Fetch candidate for variable rendering
  const { data: app } = await admin
    .from("applications")
    .select("candidate:candidates(full_name)")
    .eq("id", run.application_id)
    .single();
  type AppRow = { candidate: { full_name: string } | null };
  const a = app as unknown as AppRow | null;
  const fullname = a?.candidate?.full_name ?? "";
  const body = renderTemplate(raw, {
    ...orgVars,
    firstname: firstNameOf(fullname),
    fullname,
    custom: "",
    dates: "",
    times: "",
  });

  const { error } = await admin.from("notes").insert({
    application_id: run.application_id,
    author_id: run.triggered_by,
    body,
    is_private: false,
  });
  if (error) {
    await markStep(admin, step.id, "failed", { error: error.message });
    return;
  }
  await markStep(admin, step.id, "done", {});
}

async function handleSetStatusStep(admin: Admin, step: RunStepRow, run: RunMeta) {
  const payload = step.payload ?? {};
  const target = payload.set_status_to;
  if (!target) {
    await markStep(admin, step.id, "skipped", { reason: "no_target_status" });
    return;
  }
  const { error } = await admin
    .from("applications")
    .update({ status: target })
    .eq("id", run.application_id);
  if (error) {
    await markStep(admin, step.id, "failed", { error: error.message });
    return;
  }
  await markStep(admin, step.id, "done", { new_status: target });
}
