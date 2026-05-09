// Daily digest — exécution complète, partagée entre cron et action manuelle.
//
// runDigest({ slot, callerProfileId? }) :
//  - rassemble les stats (gatherDigestStats)
//  - appelle Claude (task 'digest')
//  - écrit une notification à chaque admin/rh
//  - écrit une digest_runs row
//  - si RESEND_API_KEY est configurée + RESEND_DIGEST_TO patron email, envoie un email
//
// Graceful : si l'IA n'est pas dispo, on persiste quand même un fallback Markdown
// listant les chiffres bruts pour que le patron ait une vision même sans IA.

import { createAdminClient } from "@/lib/supabase/server";
import { runAgent } from "@/lib/ai/agent";
import { sendEmail } from "@/lib/emails";
import { gatherDigestStats } from "./gather";
import type {
  DigestInput,
  DigestOutput,
} from "@/lib/ai/prompts/digest.v1";

export type DigestSlot = "morning" | "evening";

export type RunDigestResult = {
  ok: boolean;
  slot: DigestSlot;
  date: string;
  digest_run_id?: string;
  ai_used: boolean;
  ai_error?: string;
  recipients_count?: number;
  email_sent?: boolean;
  markdown_summary?: string;
  top_3_priorities?: string[];
};

function buildFallbackMarkdown(
  slot: DigestSlot,
  bundle: Awaited<ReturnType<typeof gatherDigestStats>>,
): { markdown: string; top3: string[] } {
  const s = bundle.stats;
  const lines: string[] = [];
  lines.push(`# Digest ${slot === "morning" ? "matin" : "soir"} — ${new Date().toLocaleDateString("fr-BE")}`);
  lines.push("");
  lines.push(`- **Nouvelles candidatures** : ${s.new_applications}`);
  lines.push(`- **Statuts changés** : ${s.status_changed_applications}`);
  lines.push(`- **Congés en attente** : ${s.pending_time_off}`);
  lines.push(`- **Entretiens à venir 24h** : ${s.interviews_next_24h}`);
  lines.push(`- **Docs à valider** : ${s.documents_pending_validation}`);
  lines.push(`- **Actions IA en attente** : ${s.agent_actions_proposed}`);
  lines.push(`- **Fins d'essai dans 14j** : ${s.trial_endings_next_14d}`);
  if (s.attention_employees.length > 0) {
    lines.push("");
    lines.push("## À surveiller");
    for (const e of s.attention_employees) lines.push(`- ${e.full_name} — ${e.reason}`);
  }
  if (s.top_employees.length > 0) {
    lines.push("");
    lines.push("## Top équipe");
    for (const e of s.top_employees)
      lines.push(`- ${e.full_name} — ${Number(e.reliability_pct ?? 0).toFixed(0)}%`);
  }

  const top3: string[] = [];
  if (s.agent_actions_proposed > 0) top3.push(`Traiter ${s.agent_actions_proposed} actions IA`);
  if (s.pending_time_off > 0) top3.push(`Décider ${s.pending_time_off} demandes de congé`);
  if (s.documents_pending_validation > 0)
    top3.push(`Valider ${s.documents_pending_validation} documents`);
  if (s.interviews_next_24h > 0) top3.push(`Préparer ${s.interviews_next_24h} entretiens`);
  if (s.trial_endings_next_14d > 0)
    top3.push(`Décider ${s.trial_endings_next_14d} fins d'essai à venir`);
  if (top3.length === 0) top3.push("Aucune action urgente — RAS");

  return { markdown: lines.join("\n"), top3: top3.slice(0, 3) };
}

function markdownToHtml(md: string): string {
  // Tiny converter for the email body (very limited but enough for our digest).
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) return `<h3 style="margin:18px 0 6px">${line.slice(3)}</h3>`;
      if (line.startsWith("# ")) return `<h2 style="margin:0 0 12px">${line.slice(2)}</h2>`;
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      if (!line.trim()) return "";
      return `<p style="margin:6px 0">${line}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*?<\/li>\s*)+/g, (m) => `<ul style="margin:6px 0;padding-left:20px">${m}</ul>`);
}

export async function runDigest(args: {
  slot: DigestSlot;
  callerProfileId?: string | null;
}): Promise<RunDigestResult> {
  const slot: DigestSlot = args.slot ?? "morning";
  const admin = createAdminClient();
  const todayDate = new Date().toISOString().split("T")[0];

  const bundle = await gatherDigestStats(slot === "morning" ? 14 : 12);

  // Try the AI, fall back gracefully
  const aiInput: DigestInput = {
    date: todayDate,
    stats: {
      new_applications: bundle.stats.new_applications,
      pending_actions: bundle.stats.agent_actions_proposed,
      interviews_today: bundle.stats.interviews_next_24h,
      open_positions: undefined,
    },
    pending_actions: bundle.pending_actions,
    anomalies: bundle.anomalies,
  };

  let markdown_summary = "";
  let top_3_priorities: string[] = [];
  let ai_used = false;
  let ai_error: string | undefined;
  let cost_usd = 0;
  let ai_audit_id: string | null | undefined;

  const aiRes = await runAgent<DigestInput, DigestOutput>({
    task: "digest",
    input: aiInput,
    callerProfileId: args.callerProfileId ?? undefined,
    cache: false, // digest must be fresh each slot
  });

  if (aiRes.ok && aiRes.output) {
    markdown_summary = aiRes.output.markdown_summary || "";
    top_3_priorities = Array.isArray(aiRes.output.top_3_priorities)
      ? aiRes.output.top_3_priorities.slice(0, 3)
      : [];
    cost_usd = aiRes.cost_usd ?? 0;
    ai_audit_id = aiRes.audit_id ?? null;
    ai_used = true;
  } else {
    ai_error = aiRes.error ?? "AI unavailable";
  }

  if (!markdown_summary || top_3_priorities.length === 0) {
    const fb = buildFallbackMarkdown(slot, bundle);
    if (!markdown_summary) markdown_summary = fb.markdown;
    if (top_3_priorities.length === 0) top_3_priorities = fb.top3;
  }

  // Insert digest_runs row
  const { data: drRow, error: drErr } = await admin
    .from("digest_runs")
    .insert({
      slot,
      for_date: todayDate,
      markdown_summary,
      top_3_priorities,
      stats_snapshot: bundle as unknown as Record<string, unknown>,
      ai_audit_id: ai_audit_id ?? null,
      cost_usd,
      recipients_count: 0,
    })
    .select("id")
    .single();

  if (drErr || !drRow) {
    return {
      ok: false,
      slot,
      date: todayDate,
      ai_used,
      ai_error: drErr?.message ?? "digest_runs insert failed",
    };
  }

  // Notify admin/rh
  const { data: rhProfiles } = await admin
    .from("profiles")
    .select("id, email")
    .in("role", ["admin", "rh"]);

  const recipients = (rhProfiles ?? []) as Array<{ id: string; email: string }>;
  const inserts = recipients.map((p) => ({
    recipient_id: p.id,
    kind: "digest",
    title: `Digest ${slot === "morning" ? "matin" : "soir"} — ${todayDate}`,
    body: top_3_priorities.join(" · "),
    link: "/admin/digest",
    data: { digest_run_id: drRow.id, slot, top_3_priorities },
  }));
  if (inserts.length > 0) {
    await admin.from("notifications").insert(inserts);
  }

  await admin
    .from("digest_runs")
    .update({ recipients_count: inserts.length })
    .eq("id", drRow.id);

  // Best-effort email to the patron via Resend
  let email_sent = false;
  const patronEmail = process.env.DIGEST_PATRON_EMAIL;
  if (patronEmail) {
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:auto;color:#18181b">
        <h2 style="margin:0 0 12px">Digest ${slot === "morning" ? "matin" : "soir"} — ${todayDate}</h2>
        <ol style="margin:0 0 16px;padding-left:20px">
          ${top_3_priorities.map((p) => `<li>${p}</li>`).join("")}
        </ol>
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:14px 0"/>
        ${markdownToHtml(markdown_summary)}
        <p style="font-size:11px;color:#71717a;margin-top:18px">Voir le détail : <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/digest">/admin/digest</a></p>
      </div>`;
    const sendRes = await sendEmail({
      to: patronEmail,
      subject: `CaftanRH — Digest ${slot === "morning" ? "matin" : "soir"} ${todayDate}`,
      html,
    });
    email_sent = (sendRes as { ok?: boolean }).ok === true;
  }

  return {
    ok: true,
    slot,
    date: todayDate,
    digest_run_id: drRow.id,
    ai_used,
    ai_error,
    recipients_count: inserts.length,
    email_sent,
    markdown_summary,
    top_3_priorities,
  };
}
