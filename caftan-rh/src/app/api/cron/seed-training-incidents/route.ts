// GET /api/cron/seed-training-incidents — Karim 2026-06-14.
//
// Génère une SÉRIE de notifications d'entraînement : pour chaque scénario réel,
// crée (ou enrichit) un incident avec une explication claire (qui / quoi / le
// bug / pourquoi / remèdes) + envoie une push. L'admin clique, tombe sur l'écran
// QCM intelligent, répond -> le système apprend.
//
// Idempotent : réutilise l'incident ouvert d'une signature s'il existe (un seul
// ouvert par signature). Auth : Bearer CRON_SECRET.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type AdminClient = ReturnType<typeof createAdminClient>;

type Scenario = {
  signature: string;
  severity: "critical" | "warning" | "info";
  title: string;
  problem: string;
  explain: {
    who?: string;
    event?: string;
    what: string;
    why: string;
    remedies: string[];
  };
};

const SCENARIOS: Scenario[] = [
  {
    signature: "unmapped_badges",
    severity: "warning",
    title: "Badge perdu — slot non rattaché (Pointage A, slot 101)",
    problem: "Un badge a été scanné sur Pointage A (slot 101) mais ce slot n'est rattaché à aucun employé.",
    explain: {
      who: "Probablement Omaima Ouahi (elle a plusieurs empreintes sur ce terminal, et le slot 101 n'est pas encore mappé).",
      event: "Pointage A — badge sur le slot 101 le 13/06 à 10:00, non capté.",
      what: "Une empreinte (slot 101) a badgé mais le système ne sait pas à qui elle appartient, donc le passage est ignoré.",
      why: "Ce passage est perdu : ni entrée ni sortie. C'est la cause directe des sorties manquantes, des fausses présences et des heures de paie fausses.",
      remedies: [
        "Faire badger la personne, puis mapper le slot 101 à l'employé en 1 clic dans /admin/tuya/logs.",
        "Beaucoup de travailleurs ont plusieurs empreintes : mapper chacune.",
        "Le détecteur t'alerte désormais à chaque badge perdu — fini la perte silencieuse.",
      ],
    },
  },
  {
    signature: "open_clocks_24h",
    severity: "warning",
    title: "Sortie manquante — session restée ouverte",
    problem: "Un employé a pointé son entrée mais aucune sortie n'a été enregistrée ; la session reste ouverte.",
    explain: {
      who: "Cas type : un employé du matin dont le badge de sortie a été droppé (slot OUT non mappé) ou non badgé.",
      event: "Entrée le matin, aucune sortie le soir — la personne apparaît « présente » la nuit.",
      what: "Une entrée sans sortie laisse l'employé « présent » indéfiniment.",
      why: "Fausse présence + heures du jour fausses. Souvent ce n'est PAS un oubli : c'est un badge OUT perdu (slot non mappé) ou un auto-OUT estimé qui a masqué le vrai badge.",
      remedies: [
        "Fermer la session avec une heure estimée (force-close-orphans), à valider par la RH.",
        "Si la sortie a été badgée mais perdue : mapper le slot OUT de la personne.",
        "Correctif déjà en place : un vrai badge OUT remplace désormais l'estimation (plus d'IN fantôme).",
      ],
    },
  },
  {
    signature: "tuya_ingestion_stalled",
    severity: "critical",
    title: "Import des badges à l'arrêt",
    problem: "Le poll Tuya n'a rien importé depuis plus de 12h.",
    explain: {
      event: "Aucun pointage importé depuis ce matin.",
      what: "Le service qui récupère les badges des terminaux ne tourne plus.",
      why: "Plus aucun pointage ne remonte : présence vide, heures non comptées. Toute la journée peut être perdue si ce n'est pas relancé.",
      remedies: [
        "Relancer le poll Tuya pour rattraper les passages manqués.",
        "Vérifier que les crons GitHub tournent et que les terminaux sont en ligne.",
      ],
    },
  },
  {
    signature: "anomalous_clocks",
    severity: "info",
    title: "Pointage anormal à vérifier",
    problem: "Un pointage est marqué anormal (session trop longue / jour incomplet).",
    explain: {
      who: "Cas type : un employé avec une session de plus de 12h, ou une double lecture d'empreinte.",
      event: "Session inhabituellement longue détectée.",
      what: "Un pointage sort des bornes normales (durée, doublon, jour incomplet).",
      why: "S'il n'est pas corrigé ou validé, il fausse les heures et donc la paie.",
      remedies: [
        "Revoir et corriger depuis la fiche prestations de l'employé.",
        "Dis-moi à quel niveau de confiance je peux corriger automatiquement à l'avenir (question ci-dessous).",
      ],
    },
  },
  {
    signature: "failed_mails",
    severity: "warning",
    title: "E-mails sortants en échec",
    problem: "Des e-mails sortants ont échoué cette semaine.",
    explain: {
      event: "Échec d'envoi détecté dans les logs mail.",
      what: "Un ou plusieurs e-mails n'ont pas pu partir.",
      why: "Des destinataires (candidats, employés) n'ont rien reçu — selon le contenu, ça peut bloquer un recrutement ou une info importante.",
      remedies: [
        "Vérifier la config d'envoi (Resend / EmailJS / SMTP) et les logs dans /rh/mails.",
        "Règle permanente : on ne renvoie PAS les mails passés cassés, on corrige seulement les futurs.",
      ],
    },
  },
];

async function notifyAdmins(admin: AdminClient, kind: string, title: string, body: string, link: string, data: Record<string, unknown>): Promise<number> {
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const ids = ((admins ?? []) as Array<{ id: string }>).map((a) => a.id);
  let n = 0;
  for (const rid of ids) {
    const { data: ins } = await admin.from("notifications")
      .insert({ recipient_id: rid, kind, title, body, data }).select("id").single();
    if (!ins) continue;
    await admin.from("notifications").update({ link }).eq("id", (ins as { id: string }).id);
    n++;
  }
  return n;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  let seeded = 0, notified = 0;

  for (const s of SCENARIOS) {
    // 1) Réutilise l'incident ouvert de cette signature, sinon en crée un.
    const { data: openInc } = await admin.from("incidents")
      .select("id").eq("signature", s.signature).eq("status", "open").maybeSingle();
    let incidentId: string;
    if (openInc) {
      incidentId = (openInc as { id: string }).id;
      await admin.from("incidents").update({
        severity: s.severity, title: s.title, problem: s.problem,
        data: { explain: s.explain, training: true }, last_seen: nowIso,
      }).eq("id", incidentId);
    } else {
      const { data: ins } = await admin.from("incidents").insert({
        signature: s.signature, source: "training", severity: s.severity,
        title: s.title, problem: s.problem, status: "open",
        data: { explain: s.explain, training: true },
      }).select("id").single();
      if (!ins) continue;
      incidentId = (ins as { id: string }).id;
    }
    seeded++;

    // 2) Notification (déclenche la push) -> écran QCM de l'incident.
    notified += await notifyAdmins(
      admin,
      "incident_training",
      `🎓 ${s.title}`,
      `${s.explain.what}\n\nClique pour comprendre et m'apprendre quoi faire.`,
      `/admin/incidents/${incidentId}`,
      { incident_id: incidentId, signature: s.signature, training: true, priority: "important" },
    );
  }

  return NextResponse.json({ ok: true, seeded, notified });
}
