// Karim 2026-05-29 : webhook DocuSeal pour update le statut de signature
// dans CaftanRH. Configure dans DocuSeal Admin > Webhooks avec URL :
//   https://<domain>/api/docuseal/webhook
//   Events : form.completed, form.declined, form.signed
//   Secret : DOCUSEAL_WEBHOOK_SECRET

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyDocusealWebhook } from "@/lib/docuseal-client";
import { getPublicBaseUrl } from "@/lib/public-base-url";
import { sendAppMail } from "@/lib/app-mail";

export const dynamic = "force-dynamic";

type DocusealEvent = {
  // form.* = action d un signer individuel
  // submission.* = etat global de l envelope (tous signers)
  event_type:
    | "form.viewed"
    | "form.started"
    | "form.completed"
    | "form.declined"
    | "submission.completed"
    | "submission.expired";
  timestamp: string;
  data: {
    id: number;
    submission_id?: number;
    template_id?: number;
    email?: string;
    status?: string;
    completed_at?: string;
    audit_log_url?: string;
    combined_document_url?: string;
    // Karim 2026-05-29 : DocuSeal stocke le PDF signe dans documents[0].url
    // (pas combined_document_url qui est souvent null)
    documents?: Array<{ name: string; url: string }>;
    metadata?: Record<string, string>;
  };
};

/**
 * Karim 2026-05-29 : recupere l URL du PDF signe. Priorite :
 * 1. documents[0].url (le contrat signe avec toutes les signatures)
 * 2. combined_document_url (legacy)
 * 3. fallback : refetch /submissions/{id} si besoin
 */
async function getSignedPdfUrl(data: DocusealEvent["data"]): Promise<string | null> {
  if (data.documents && data.documents.length > 0) return data.documents[0].url;
  if (data.combined_document_url) return data.combined_document_url;
  // Fallback : refetch
  const baseUrl = process.env.DOCUSEAL_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.DOCUSEAL_API_KEY;
  const submissionId = data.submission_id ?? data.id;
  if (!baseUrl || !apiKey || !submissionId) return null;
  try {
    const res = await fetch(`${baseUrl}/submissions/${submissionId}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!res.ok) return null;
    const body = await res.json() as { documents?: Array<{ url: string }>; combined_document_url?: string };
    if (body.documents && body.documents.length > 0) return body.documents[0].url;
    return body.combined_document_url ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("x-docuseal-signature");

  // Verifie HMAC si secret configure (sinon ouvert - dev mode)
  if (process.env.DOCUSEAL_WEBHOOK_SECRET) {
    if (!verifyDocusealWebhook(sig, rawBody)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: DocusealEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const submissionId = event.data.submission_id ?? event.data.id;
  const employeeId = event.data.metadata?.employee_id;
  const contractId = event.data.metadata?.contract_id;
  const terminationId = event.data.metadata?.termination_id;

  // Karim 2026-06-16 : GARDE flux interne.
  // Si le contrat ciblé est géré par le flux de signature interne (/sign),
  // on ignore silencieusement ce webhook DocuSeal pour éviter tout double-update.
  // Un contrat est « interne » s'il possède un signing_token (= lien magique /sign)
  // ou s'il n'a pas de docuseal_submission_id (= jamais passé par DocuSeal).
  // Les contrats legacy DocuSeal (docuseal_submission_id non nul, signing_token nul)
  // traversent normalement.
  if (contractId) {
    const { data: existingContract } = await admin
      .from("employee_contracts")
      .select("signing_token, docuseal_submission_id")
      .eq("id", contractId)
      .maybeSingle();
    if (existingContract) {
      const isInternalFlow =
        !!existingContract.signing_token ||
        !existingContract.docuseal_submission_id;
      if (isInternalFlow) {
        console.log("[docuseal/webhook] ignored — contrat géré par le flux interne", contractId);
        return NextResponse.json({ ok: true, ignored: true, reason: "internal flow" });
      }
    }
  }

  // Karim 2026-06-02 : branch RUPTURE AMIABLE (contract_terminations).
  // Couvre form.completed (1 partie signe) + submission.completed (toutes signe).
  if (terminationId && (event.event_type === "form.completed" || event.event_type === "submission.completed")) {
    const docusealPdfUrl = await getSignedPdfUrl(event.data);
    const allCompleted = event.event_type === "submission.completed";
    const isEmployeeSigner = event.data.metadata?.role === "Employee" || (event.data as { role?: string }).role === "Employee";
    const updates: Record<string, unknown> = { docuseal_submission_id: String(submissionId) };
    const nowISO = event.data.completed_at ?? new Date().toISOString();

    // Karim 2026-06-02 : si fully_signed, on download le PDF DocuSeal et on
    // l'archive dans Supabase Storage (bucket terminations/signed/<id>.pdf)
    // pour qu'il reste accessible meme si DocuSeal expire le lien.
    let storedPath: string | null = null;
    if (allCompleted && docusealPdfUrl) {
      try {
        const pdfRes = await fetch(docusealPdfUrl);
        if (pdfRes.ok) {
          const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
          storedPath = `signed/${terminationId}.pdf`;
          await admin.storage.from("terminations").upload(storedPath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });
        }
      } catch (e) {
        console.warn("[docuseal/webhook] PDF download/upload error:", (e as Error).message);
      }
    }

    if (allCompleted) {
      updates.status = "fully_signed";
      updates.signed_pdf_storage_path = storedPath ?? docusealPdfUrl;
      updates.employee_signed_at = updates.employee_signed_at ?? nowISO;
      updates.employer_signed_at = updates.employer_signed_at ?? nowISO;
    } else if (isEmployeeSigner) {
      updates.employee_signed_at = nowISO;
      updates.status = "signed_employee";
    } else {
      updates.employer_signed_at = nowISO;
      updates.status = "signed_employer";
    }
    await admin.from("contract_terminations").update(updates).eq("id", terminationId);

    // Audit log
    try {
      const { data: t } = await admin.from("contract_terminations").select("employee_id, effective_date").eq("id", terminationId).maybeSingle();
      if (t) {
        await admin.from("document_audit_log").insert({
          employee_id: t.employee_id,
          doc_type: "contract",
          doc_ref: terminationId,
          doc_label: allCompleted ? "Convention rupture - pleinement signée" : "Convention rupture - signature partielle",
          action: "view",
          channel: "docuseal_webhook",
          actor_name: "DocuSeal",
          notes: `Submission ${submissionId}`,
        });

        // Karim 2026-06-02 : si fully_signed → notifications + mail HR + employee
        if (allCompleted) {
          const { data: emp } = await admin
            .from("employees")
            .select("full_name, email, preferred_language")
            .eq("id", t.employee_id)
            .maybeSingle();
          const empName = (emp as { full_name?: string } | null)?.full_name ?? "?";
          const empEmail = (emp as { email?: string } | null)?.email ?? null;

          // 1. Signed URL (7j) pour le PDF stocke
          let signedDownloadUrl: string | null = null;
          if (storedPath) {
            const { data: signed } = await admin.storage.from("terminations").createSignedUrl(storedPath, 7 * 24 * 3600);
            signedDownloadUrl = signed?.signedUrl ?? docusealPdfUrl;
          } else {
            signedDownloadUrl = docusealPdfUrl;
          }

          // 2. Notifications in-app pour tous admin/rh
          try {
            const { data: hrs } = await admin
              .from("profiles")
              .select("id, email")
              .in("role", ["admin", "rh"]);
            const hrList = (hrs ?? []) as Array<{ id: string; email: string | null }>;
            if (hrList.length > 0) {
              await admin.from("notifications").insert(
                hrList.map((hr) => ({
                  recipient_id: hr.id,
                  kind: "termination_signed",
                  title: `✍️ Rupture signée — ${empName}`,
                  body: `La convention de cessation de contrat amiable a été signée par les 2 parties. PDF final disponible.`,
                  link: `/planning/employees/${t.employee_id}`,
                  data: { terminationId, signedUrl: signedDownloadUrl, effective_date: t.effective_date },
                })),
              );
            }

            // 3. Mail a hr@caftanfactory.com (boite commune) + tous les RH/admin perso
            if (signedDownloadUrl) {
              const recipients = new Set<string>(["hr@caftanfactory.com"]);
              for (const hr of hrList) if (hr.email) recipients.add(hr.email);

              const subject = `Convention de rupture signée — ${empName}`;
              const hrBody = `Bonjour,

La convention de cessation de contrat de travail de COMMUN ACCORD de ${empName} a été signée par les 2 parties (signature électronique eIDAS).

📅 Date de fin du contrat : ${t.effective_date}

📎 PDF signé (lien sécurisé 7 jours) :
${signedDownloadUrl}

Une copie est également archivée dans la valise documents :
${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/rh/documents?employee=${t.employee_id}

⚠ Actions à prévoir :
• Déclarer la Dimona OUT au plus tard 1 jour ouvrable avant la date de fin
• Calculer le solde de tout compte (pécule vacances, prime fin année prorata, etc.)
• Préparer le certificat de chômage C4
• Archiver dans le dossier comptable

L'équipe CaftanRH`;
              for (const to of recipients) {
                try {
                  await sendAppMail({
                    to,
                    toName: "RH",
                    subject,
                    body: hrBody,
                    attachmentUrls: [{ name: "Convention de cessation signée.pdf", url: signedDownloadUrl }],
                    source: "termination_signed",
                    sourceRef: terminationId,
                    employeeId: t.employee_id,
                  });
                } catch { /* non bloquant */ }
              }

              // Mail copie a l'employee aussi
              if (empEmail) {
                const empFirstName = empName.split(/\s+/)[0];
                const empBody = `Bonjour ${empFirstName},

Ta convention de cessation de contrat amiable a été signée par les 2 parties.

📅 Date de fin du contrat : ${t.effective_date}

📎 Télécharge ton exemplaire signé (PDF, lien sécurisé 7 jours) :
${signedDownloadUrl}

Tu retrouveras aussi cette convention dans ton espace travailleur :
${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/me/termination

Nous te souhaitons le meilleur pour la suite.

L'équipe Caftan Factory (By AMD Megastore)`;
                try {
                  await sendAppMail({
                    to: empEmail,
                    toName: empName,
                    subject: `Ta convention de cessation signée — ${empName}`,
                    body: empBody,
                    attachmentUrls: [{ name: "Convention de cessation signée.pdf", url: signedDownloadUrl }],
                    source: "termination_signed",
                    sourceRef: terminationId,
                    employeeId: t.employee_id,
                  });
                } catch { /* non bloquant */ }
              }
            }
          } catch (e) {
            console.warn("[docuseal/webhook] notify HR err:", (e as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn("[docuseal/webhook] termination audit err:", e);
    }

    // Karim 2026-06-03 : auto-création Dimona OUT à la rupture pleinement signée
    if (allCompleted) {
      try {
        const { data: t } = await admin
          .from("contract_terminations")
          .select("employee_id, effective_date, employer_org_key")
          .eq("id", terminationId)
          .maybeSingle();
        if (t) {
          await admin.from("dimona_declarations").upsert({
            employee_id: t.employee_id,
            kind: "out",
            declared_end_date: t.effective_date,
            employer_org_key: t.employer_org_key ?? "amd_megastore",
            worker_type: "OTH",
            status: "pending",
          }, { onConflict: "employee_id,kind" });
          console.log("[webhook] Dimona OUT auto-created for termination", terminationId);
        }
      } catch (e) {
        console.warn("[webhook] Dimona OUT auto err:", (e as Error).message);
      }
    }

    return NextResponse.json({ ok: true, kind: "termination", all_signed: allCompleted, stored_path: storedPath });
  }

  if (event.event_type === "submission.completed") {
    // Tous les signers ont signe -> contrat 100% finalise
    const signedPdfUrl = await getSignedPdfUrl(event.data);
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          signed_at: event.data.completed_at ?? new Date().toISOString(),
          signed_pdf_url: signedPdfUrl,
          docuseal_submission_id: submissionId,
          docuseal_status: "completed",
        })
        .eq("id", contractId);
    }

    // Karim 2026-06-13 (Phase 2) : activation du compte employé à la signature
    // finale (candidate -> employee). Best-effort.
    if (employeeId) {
      const { activateEmployeeAccount } = await import("@/lib/employee-activation");
      await activateEmployeeAccount(admin, employeeId);
    }

    // Envoi du contrat signe final aux 2 parties
    if (employeeId && signedPdfUrl) {
      const { data: emp } = await admin
        .from("employees")
        .select("full_name, email, preferred_language")
        .eq("id", employeeId)
        .maybeSingle();
      const employee = (emp as { full_name?: string; email?: string; preferred_language?: string } | null);
      if (employee?.email) {
        await sendSignedContractCopy({
          to: employee.email,
          recipientName: employee.full_name ?? "Travailleur",
          signedPdfUrl,
          language: (employee.preferred_language === "nl" || employee.preferred_language === "en") ? employee.preferred_language : "fr",
        });
      }
      await sendSignedContractCopy({
        to: "hr@caftanfactory.com",
        recipientName: "HR Team",
        signedPdfUrl,
        language: "fr",
      });

      // Karim 2026-06-03 : auto-création Dimona IN à la signature contrat
      try {
        const { data: empFull } = await admin
          .from("employees")
          .select("id, contract_type, start_date, end_date")
          .eq("id", employeeId)
          .maybeSingle();
        if (empFull) {
          const workerType = (empFull as { contract_type?: string }).contract_type === "Étudiant" ? "STU" : "OTH";
          await admin.from("dimona_declarations").upsert({
            employee_id: employeeId,
            kind: "in",
            declared_start_date: (empFull as { start_date?: string }).start_date ?? null,
            declared_end_date: (empFull as { end_date?: string }).end_date ?? null,
            employer_org_key: "amd_megastore",
            worker_type: workerType,
            status: "pending",
          }, { onConflict: "employee_id,kind" });
          console.log("[webhook] Dimona IN auto-created for contract", contractId);
        }
      } catch (e) {
        console.warn("[webhook] Dimona IN auto err:", (e as Error).message);
      }

      // Karim 2026-05-29 : NOTIFICATION URGENTE DIMONA
      // Apres signature : creer une notif "Dimona a declarer" pour tous les
      // admin/rh + envoyer mail rappel via EmailJS.
      try {
        const { data: empData } = await admin
          .from("employees")
          .select("full_name")
          .eq("id", employeeId)
          .maybeSingle();
        const empName = (empData as { full_name?: string } | null)?.full_name ?? "?";
        const { data: hrs } = await admin
          .from("profiles")
          .select("id, email")
          .in("role", ["admin", "rh"]);
        const hrList = ((hrs ?? []) as Array<{ id: string; email: string | null }>);
        if (hrList.length > 0) {
          // Notifications dans l app
          const inserts = hrList.map((hr) => ({
            recipient_id: hr.id,
            kind: "dimona_to_do",
            title: `🚨 DIMONA URGENTE — ${empName}`,
            body: `Le contrat de ${empName} est signé. La Dimona IN doit être déclarée AVANT le 1er jour de travail (sanctions ONSS). Va sur la fiche pour déclarer.`,
            link: `/planning/employees/${employeeId}`,
            data: { employeeId, contractId, urgent: true },
          }));
          await admin.from("notifications").insert(inserts);

          // Mail rappel a hr@caftanfactory.com + chaque RH
          {
            const recipients = new Set(["hr@caftanfactory.com", ...hrList.map((h) => h.email).filter((e): e is string => !!e)]);
            const dimonaSubject = `🚨 DIMONA URGENTE — Contrat signé ${empName}`;
            const dimonaBody = `Bonjour,\n\nLe contrat de ${empName} vient d'être signé électroniquement.\n\n` +
              `⚠ La Dimona IN doit être déclarée AVANT le 1er jour de travail (obligation légale ONSS).\n\n` +
              `Actions disponibles sur la fiche employé :\n` +
              `• Ouvrir le portail ONSS Dimona (déclaration manuelle)\n` +
              `• Auto-Dimona (étape 2 — en développement)\n` +
              `• Marquer Dimona traitée une fois fait\n\n` +
              `Lien direct : ${getPublicBaseUrl()}/planning/employees/${employeeId}\n\n` +
              `L'équipe CaftanRH`;
            for (const to of recipients) {
              try {
                await sendAppMail({
                  to,
                  toName: "RH",
                  subject: dimonaSubject,
                  body: dimonaBody,
                  source: "dimona_reminder",
                  sourceRef: contractId,
                  employeeId,
                });
              } catch { /* non bloquant */ }
            }
          }
        }
      } catch (e) {
        console.warn("[docuseal/webhook] dimona reminder err:", e);
      }
    }
  } else if (event.event_type === "form.completed") {
    // Le contrat a ete signe - update employee_contracts
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          signed_at: event.data.completed_at ?? new Date().toISOString(),
          signed_pdf_url: event.data.combined_document_url,
          docuseal_submission_id: submissionId,
          docuseal_status: "completed",
        })
        .eq("id", contractId);
    }

    // Notification RH
    if (employeeId) {
      const { data: emp } = await admin
        .from("employees")
        .select("full_name")
        .eq("id", employeeId)
        .maybeSingle();
      const name = (emp as { full_name?: string } | null)?.full_name ?? "?";
      const { data: hrs } = await admin
        .from("profiles")
        .select("id")
        .in("role", ["admin", "rh"]);
      const hrIds = ((hrs ?? []) as Array<{ id: string }>).map((h) => h.id);
      if (hrIds.length > 0) {
        await admin.from("notifications").insert(
          hrIds.map((hrId) => ({
            recipient_id: hrId,
            kind: "contract_signed",
            title: `Contrat signé : ${name}`,
            body: `Le contrat de ${name} a été signé électroniquement.`,
            link: contractId ? `/planning/employees/${employeeId}/contract` : `/planning/employees/${employeeId}`,
            data: { submissionId, employeeId, contractId },
          })),
        );
      }
    }
  } else if (event.event_type === "form.declined") {
    if (contractId) {
      await admin
        .from("employee_contracts")
        .update({
          docuseal_submission_id: submissionId,
          docuseal_status: "declined",
        })
        .eq("id", contractId);
    }
  }

  return NextResponse.json({ ok: true });
}

// Karim 2026-06-16 : migré de EmailJS direct vers sendAppMail (app-mail.ts).
// Envoie le contrat signé final aux 2 parties avec le lien PDF sécurisé.
async function sendSignedContractCopy(args: {
  to: string;
  recipientName: string;
  signedPdfUrl: string;
  language: "fr" | "nl" | "en";
}) {
  const MSG = {
    fr: {
      subject: "Votre contrat signé — Caftan Factory (By AMD Megastore)",
      body: (name: string, url: string) =>
        `Bonjour ${name},\n\nVotre contrat a été signé par toutes les parties. ` +
        `Vous pouvez le télécharger ici :\n\n👉 ${url}\n\n` +
        `Conservez précieusement ce document — il fait office d'original.\n\n` +
        `Bien à vous,\nL'équipe Caftan Factory (By AMD Megastore)`,
    },
    nl: {
      subject: "Uw ondertekende overeenkomst — Caftan Factory (By AMD Megastore)",
      body: (name: string, url: string) =>
        `Beste ${name},\n\nUw overeenkomst werd door alle partijen ondertekend. ` +
        `U kan ze hier downloaden:\n\n👉 ${url}\n\n` +
        `Bewaar dit document zorgvuldig — het geldt als origineel.\n\n` +
        `Met vriendelijke groet,\nHet Caftan Factory team (By AMD Megastore)`,
    },
    en: {
      subject: "Your signed contract — Caftan Factory (By AMD Megastore)",
      body: (name: string, url: string) =>
        `Hello ${name},\n\nYour contract has been signed by all parties. ` +
        `You can download it here:\n\n👉 ${url}\n\n` +
        `Keep this document safely — it serves as the original.\n\n` +
        `Best regards,\nThe Caftan Factory team (By AMD Megastore)`,
    },
  } as const;

  const msg = MSG[args.language];
  const firstName = args.recipientName.split(/\s+/)[0] ?? args.recipientName;
  const body = msg.body(firstName, args.signedPdfUrl);
  try {
    await sendAppMail({
      to: args.to,
      toName: args.recipientName,
      subject: msg.subject,
      body,
      attachmentUrls: [{ name: "Contrat signé.pdf", url: args.signedPdfUrl }],
      source: "contract_signed",
    });
  } catch (e) {
    console.warn("[docuseal/webhook] sendSignedContractCopy err:", e);
  }
}
