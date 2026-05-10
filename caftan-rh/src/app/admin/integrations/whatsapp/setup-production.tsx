// Guide de mise en production WhatsApp Business via Twilio.
// Server component (pure UI, pas d'effets), affiché en bas de la page admin
// pour que l'utilisateur ait toutes les étapes manuelles à portée de main.

import { Card } from "@/components/ui/card";

export function ProductionSetupGuide({ webhookUrl }: { webhookUrl?: string | null }) {
  return (
    <Card>
      <div className="p-4 space-y-4 text-sm leading-relaxed">
        <div>
          <h2 className="font-bold text-base">Mise en production WhatsApp Business</h2>
          <p className="text-ink-2 mt-1">
            Étapes <strong>obligatoires</strong> avant tout envoi en masse — réalisées manuellement
            par l&apos;administrateur. Tant que tu es en sandbox, Meta ne peut pas te bannir parce que
            tu n&apos;es pas vraiment dans son écosystème, mais tu ne peux pas non plus écrire à un
            candidat qui n&apos;a pas joint le sandbox.
          </p>
        </div>

        <Section
          n={1}
          title="Compte Twilio payant"
          help="Crée un compte sur twilio.com (~ 1 $/mois pour le numéro). Vérifie l'identité business depuis le dashboard (Verify → Business identity). Délai : 1 à 2 jours."
        />

        <Section
          n={2}
          title="Acheter un numéro Twilio Business"
          help="Console Twilio → Phone Numbers → Buy a number. Coche 'WhatsApp capable'. Numéro français/belge/marocain selon ta cible. C'est ce numéro que tu colleras dans la zone 'Numéro WhatsApp Twilio' ci-dessus (sans préfixe 'whatsapp:')."
        />

        <Section
          n={3}
          title="Embedded Signup Meta Business Manager"
          help="Dans Twilio : Messaging → Senders → WhatsApp senders → Add sender. Twilio te redirige vers Meta Business Manager pour lier ton WABA (WhatsApp Business Account). Connecte-toi avec un compte Meta admin du business."
        />

        <Section
          n={4}
          title="Vérification d'identité business Meta"
          help="Dans Meta Business Manager → Paramètres → Vérification du business : ajouter le nom légal, justificatif officiel (attestation TVA, K-bis, etc.). Délai : plusieurs jours. Sans cette vérif, tu es plafonné à 250 messages/24h (Tier 1)."
        />

        <Section
          n={5}
          title="Créer les templates Twilio Content (UTILITY)"
          help={
            <>
              Pour les notifs candidats (invitation entretien, demande de docs, suivi de candidature),
              crée tes templates dans <em>Twilio Console → Messaging → Content Editor</em> avec
              catégorie <code>UTILITY</code> et variables <code>{`{{1}}`}</code>, <code>{`{{2}}`}</code>…
              Chaque template doit aussi être créé localement depuis la page <strong>Templates</strong>
              avec le même corps mot pour mot. Soumets-les à Meta pour approval (24-48 h). Une fois
              <code>approved</code>, colle le <code>Content SID</code> (HX…) dans le template local.
            </>
          }
        />

        <Section
          n={6}
          title="Webhook inbound configuré côté Twilio"
          help={
            <>
              Dans Twilio Console → Phone Numbers → ton numéro → onglet Messaging, champ{" "}
              <em>&quot;A message comes in&quot;</em> → method <code>HTTP POST</code> → URL :
              <pre className="bg-surface-2 rounded p-2 mt-1 text-xs font-mono">
                {webhookUrl || "(défini après déploiement Vercel — voir bandeau ci-dessus)"}
              </pre>
              C&apos;est ce qui permet à CaftanRH de recevoir les replies, marquer l&apos;opt-in et gérer les STOP.
            </>
          }
        />

        <Section
          n={7}
          title="Quota Meta — montée en charge"
          help={
            <>
              Démarrage : Tier 1 = 250 conversations uniques/24 h. Si tu maintiens un{" "}
              <strong>taux d&apos;opt-in &gt; 90 %</strong> et un <strong>taux de blocage &lt; 1 %</strong>{" "}
              pendant 7 jours, Meta te promeut automatiquement à Tier 2 (1 000), puis Tier 3 (10 000) et
              Tier 4 (illimité). Notre code force tout ça : opt-in obligatoire, fenêtre 24 h, gestion STOP.
            </>
          }
        />

        <Section
          n={8}
          title="Politique de qualité Meta — checklist permanente"
          help={
            <ul className="list-disc pl-5 space-y-1">
              <li>Pas de spam / pas d&apos;envois en masse non-template hors fenêtre 24 h.</li>
              <li>Réponse à STOP traitée en moins de 24 h (notre webhook le fait instantanément).</li>
              <li>
                Pas d&apos;envoi à un numéro non opt-iné — sauf premier message via template UTILITY
                déclenché par une action légitime (le candidat a postulé chez nous).
              </li>
              <li>Variables de templates conformes au corps approuvé (sinon ban quasi-immédiat).</li>
            </ul>
          }
        />

        <Section
          n={9}
          title="Documentation officielle"
          help={
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Twilio WhatsApp :{" "}
                <a
                  href="https://www.twilio.com/docs/whatsapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-dark hover:underline"
                >
                  twilio.com/docs/whatsapp
                </a>
              </li>
              <li>
                Politique Meta Business Messaging :{" "}
                <a
                  href="https://business.whatsapp.com/policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-dark hover:underline"
                >
                  business.whatsapp.com/policy
                </a>
              </li>
              <li>
                Templates / HSM :{" "}
                <a
                  href="https://www.twilio.com/docs/content"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-dark hover:underline"
                >
                  twilio.com/docs/content
                </a>
              </li>
            </ul>
          }
        />
      </div>
    </Card>
  );
}

function Section({
  n,
  title,
  help,
}: {
  n: number;
  title: string;
  help: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-gold pl-3 space-y-1">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gold-light text-gold-dark text-[11px] font-bold">
          {n}
        </span>
        <p className="font-bold">{title}</p>
      </div>
      <div className="text-ink-2 text-[13px]">{help}</div>
    </div>
  );
}
