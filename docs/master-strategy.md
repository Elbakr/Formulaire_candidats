# CaftanRH — Stratégie maître : la plateforme comme agent IA

> Plan maître pour transformer CaftanRH en plateforme RH autonome opérée par des agents IA.
> Version 1.0 — exploration faite sur le code existant à `C:\Users\KElba\Documents\GitHub\Formulaire_candidats`.

---

## 1. Vision en une phrase

**CaftanRH devient la salle de contrôle où le patron clique "OK" — l'IA fait tout le reste : capturer chaque échange, demander chaque document, relancer chaque candidat, chaque employé, et résumer chaque journée.**

---

## 2. Principes directeurs (5)

1. **Le patron ne fait que valider** — l'écran par défaut est une "Inbox d'actions" : 0 saisie, juste des Approuver / Rejeter / Modifier-puis-envoyer.
2. **Tout échange laisse une trace** — entrant ET sortant, structuré ET libre, attaché au bon dossier candidat/employé. Aucune action humaine en dehors de la plateforme ne peut "se perdre".
3. **Aucun document ne se perd** — chaque PJ Gmail entre, est classifiée par l'IA, déposée dans Storage, attachée à un dossier, indexée pour recherche.
4. **L'IA propose, l'humain dispose** — par défaut tout passe par human-in-the-loop ; on n'active l'auto-action qu'au cas par cas avec seuil de confiance ≥ 95 % et journal d'audit.
5. **Default-action quand l'IA est confiante** — phase 2+ : si confiance ≥ 95 % sur une action triviale (accusé de réception, tag "spam", relance J+5), on agit, on log, on notifie le patron du résultat.

---

## 3. Architecture cible (high-level)

### 3.1 Couches

```
┌─────────────────────────────────────────────────────────────┐
│  UI Next.js 16 (App Router)  — patron / RH / manager / employé│
│  • Inbox unifié (in/out)  • Cockpit IA  • Validations queue   │
└─────────────────────────────────────────────────────────────┘
            ▲                                  │
            │ Realtime (Supabase)              │ Server Actions
            │                                  ▼
┌─────────────────────────────────────────────────────────────┐
│            ORCHESTRATEUR D'AGENTS (Node, server)              │
│  Triage · ReplyDrafter · DocChaser · Scheduler · OnboardPilot │
│  PerfWatcher · Compliance · DigestBot · SourcingBot           │
└─────────────────────────────────────────────────────────────┘
   ▲              ▲                  ▲                    ▲
   │              │                  │                    │
INBOUND       OUTBOUND          IA PROVIDER         CRON / events
Gmail API   EmailJS+Resend      Claude API        Supabase triggers
IMAP fallback  Gmail SMTP       (server-side)     route handlers
   │              │                  │                    │
   └──────────────┴──────────────────┴────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            SUPABASE Postgres + Storage + Auth + Realtime     │
│  applications · messages · documents · ai_outputs · threads  │
│  inbound_emails · agent_actions · digest_runs · ai_audit     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Diagramme de flow — un email entrant arrive

```
Gmail elbazikarim@gmail.com
        │
        │ (1) Webhook Pub/Sub  OU  cron polling /api/inbound/poll
        ▼
/api/inbound/route.ts
        │
        │ (2) parse MIME + extract attachments
        ▼
inbound_emails (raw)  ──► storage://inbound-attachments/<id>/<file>
        │
        │ (3) Triage agent : classify + match candidate
        ▼
   ┌────────────────────┐
   │ MATCH found ?      │
   └────────────────────┘
       │             │
      yes            no
       │             │
       ▼             ▼
  message (inbound)  unmatched_emails  → UI "à attribuer"
  + thread link
  + doc upload (si PJ)
       │
       │ (4) Reply Drafter : génère 3 brouillons
       ▼
  agent_actions (kind=reply_draft, status=pending_review)
       │
       │ (5) Notification au patron
       ▼
  Inbox d'actions UI : [Approuver] [Modifier] [Rejeter]
```

### 3.3 Acteurs IA (sub-agents) — qui fait quoi

| Agent | Mission | Triggers |
|---|---|---|
| **Sourcing agent** | Quand une nouvelle candidature arrive (GF, postuler, manuelle), score motivation + fit poste, suggère prochain stage. | `applications` insert |
| **Triage agent** | Pour chaque email entrant : classifie (réponse candidat / spam / nouveau prospect / document / autre), extrait PJ, match au bon dossier. | `inbound_emails` insert |
| **Reply drafter** | Sur message inbound non-spam, prépare 3 brouillons (formel/chaleureux/court) en fonction du contexte (stage pipeline, langue, dernier échange). | `messages.direction=inbound` insert |
| **Document chaser** | Detecte ce qui manque (CI, NRN, IBAN, contrat signé…) selon `onboarding_run_items` + état candidat ; déclenche demande email + magic link upload. | cron quotidien + status hooks |
| **Scheduler** | Propose 3 créneaux d'entretien selon dispo manager (`shifts` / `calendar`), envoie l'invitation, gère accept/refus. | quand status passe à `contacted` ou demandé manuellement |
| **Onboarding pilot** | Suit la checklist `onboarding_run_items`, relance employé/manager sur items en retard. | déclenchement embauche + cron |
| **Performance watcher** | No-shows répétés, baisse de score, retards, pas de pointage, alertes au patron + manager. | événements `time_entries`, `evaluations` |
| **Compliance agent** | Étudiant 475h, fin essai à J-7, CDD échéance, Dimona, anniversaire embauche. | cron + triggers |
| **Patron summary (DigestBot)** | Email + UI digest 7h00 et 18h00 : "ce qui s'est passé, ce qui requiert ta validation, ce qui clochera demain". | cron |

### 3.4 Table d'attribution des actions

| Action déclenchée | Agent | Auto-action si confiance ≥95% ? | Action humaine par défaut |
|---|---|---|---|
| Réception email candidat connu | Triage | OUI → classement + thread | aucun, juste log |
| Email candidat avec question | ReplyDrafter | NON | Approuver brouillon |
| Email candidat avec PJ "carte d'identité" | Triage + DocChaser | OUI → upload + cocher item onboarding | aucun |
| Spam évident | Triage | OUI → archive | aucun |
| Email d'un inconnu sans contexte | Triage | NON | Inbox "à attribuer" |
| Nouvelle candidature GF | Sourcing | OUI → score + accusé de réception | aucun |
| Candidate score > 80 | Sourcing | NON | Inbox "à appeler" |
| Document onboarding manquant J-3 prise de poste | DocChaser | OUI → email demande | aucun |
| Document à relancer J+5 sans réponse | DocChaser | OUI → email relance | aucun |
| Convocation entretien (déjà accepté un créneau) | Scheduler | OUI → email confirmation + calendar event | aucun |
| Candidat refuse créneau, pas d'alternative | Scheduler | NON | Patron choisit dans Inbox |
| No-shows employé > 2/mois | PerfWatcher | NON | Alerte cockpit |
| Fin essai J-7 | Compliance | OUI → notification RH+manager | Décision humaine |
| Fin essai J0 sans décision | Compliance | NON | URGENCE cockpit |
| Anniversaire embauche | Compliance | OUI → message bienveillant | aucun |

---

## 4. Centralisation messagerie : le module clé

### 4.1 Flow outbound (déjà OK — à préserver)

Existe déjà : `caftan-rh/src/components/email-send-dialog.tsx` envoie via EmailJS depuis le navigateur, log dans `messages` (direction=outbound) via `caftan-rh/src/app/rh/email/actions.ts`.

À garder. À enrichir :
- ajouter un mode "free-form" (template optionnel, sujet+corps libres)
- ajouter sélecteur de PJ depuis Storage (CV stocké → joindre à l'email)
- ajouter "envoyer en tant que reply" qui set les bons headers (`In-Reply-To`, `References`)

### 4.2 Flow inbound (À CONSTRUIRE — la pièce manquante)

#### Options évaluées

**Option A — Gmail API + Pub/Sub (push)** : OAuth, abonnement à `users.watch`, Pub/Sub envoie un push sur webhook quand mailbox change. Latence < 1 min. Robuste.
- ✅ Quasi-temps réel, gratuit jusqu'à 1 milliard/quotas
- ✅ Permet d'envoyer aussi via Gmail API (cohérent thread)
- ⚠ Setup OAuth Google Cloud Console + scopes Gmail + Pub/Sub
- ⚠ Token refresh à gérer

**Option B — IMAP polling toutes les 2-5 min** : librairie `imapflow` côté Node, app password Gmail.
- ✅ Setup minimal (un app password + cron)
- ⚠ Latence 2-5 min, fragile (timeouts, reconnexions)
- ⚠ Pas de push

**Option C — Forwarding rules → webhook chez Resend Inbound / Postmark / Mailgun routes** : Gmail forward vers une adresse `inbound@parse.caftan.com` qui webhook vers `/api/inbound`.
- ✅ Pas de polling, pas d'OAuth
- ✅ Resend déjà installé dans `package.json` (mais pas activé)
- ⚠ Coût (Resend Inbound : 1$/1000 emails ; Mailgun : free tier 5000/mois)
- ⚠ Dépendance externe

#### Recommandation : **Option C → Option A en V2**

- **Vague 1** (cette semaine) : Resend Inbound. Création d'une adresse `inbox@parse.<domain>`. Forward Gmail vers cette adresse. Webhook reçoit JSON parsé (sujet, body, headers, PJ déjà décodées). Mise en route en 1-2 h.
- **Vague 4+** (plus tard) : migration vers Gmail API push pour : (1) écrire en Sent (réponses cohérentes côté Gmail), (2) lire boîte historique, (3) ne plus dépendre d'un tiers.

**Justification** : C est la voie la plus rapide pour livrer la valeur (le patron VOIT enfin les réponses dans la plateforme). A est meilleur à long terme mais coûteux en setup. On accepte la dette.

### 4.3 Matching email entrant → candidat

Cascade d'identification dans `inbound_email_matcher.ts` :

1. **Match exact `from_email`** dans `candidates.email` ou `employees.email` → 100 % confiance
2. **Match `In-Reply-To` / `References` headers** vs `messages.email_provider_id` → 100 % confiance
3. **Match sujet** : extraire `[Re: ... candidat ID …]` ou `[#APP-xxxxx]` (à introduire en Vague 1 dans tous les outbound)
4. **Match body** : recherche du nom complet et email candidat dans tout dossier ouvert
5. **AI fallback** : si rien, soumettre body+from à Claude qui retourne `{candidate_id|null, confidence}` — si confidence < 0.7 → bucket "à attribuer"

### 4.4 Pièces jointes

- **Storage** : bucket `inbound-attachments`, structure `<inbound_email_id>/<original_name>`
- **Trigger DB** : à l'insert d'`inbound_email`, parcourir `attachments[]`, copier dans Storage, créer un `documents` row si rattaché à une application
- **Auto-tagging IA** : DocClassifier prend filename + mime + 1ère page texte (PDF) → propose `kind` parmi `cv | id_card | iban | contract_signed | medical | diploma | other`
- **UI** : pièce jointe inline cliquable, lien signé temporaire (10 min) ; bouton "marquer comme non-classé" pour requalifier
- **Cocher onboarding auto** : si `kind=id_card` et `onboarding_run_items` a item "Copie carte d'identité reçue" not done → marquer done + log activity_log

### 4.5 UI messagerie unifiée

Refonte de `caftan-rh/src/app/rh/messages/page.tsx` (actuellement liste plate des 100 derniers). Cible :

- **Layout 3 colonnes Gmail-like** : (gauche) liste des threads par candidat, (centre) thread sélectionné avec messages chronologiques, (droite) panneau contexte candidat (CV, notes, score, stage pipeline)
- **Filtres en-tête** : non lu / à valider / archivé / toutes / par stage
- **Composer libre** en bas du thread (conserve `EmailSendDialog` pour les templates, ajoute bouton "Email libre")
- **Réponses rapides IA** : 3 chips au-dessus du composer ("👍 Confirmer", "📅 Proposer un créneau", "📝 Demander un document")
- **Pièces jointes inline** dans le thread + zone drop d'upload manuel
- **Indicateur `[À ATTRIBUER]`** pour les inbound non-matchés, drag-and-drop vers candidat

---

## 5. Templates intelligents

### 5.1 Templates de base (les 9 actuels)

Existants dans `email_templates` (table seedée par `caftan-rh/scripts/seed-email-templates.mjs`). Variables actuelles : `{{firstname}}`, `{{fullname}}`, `{{org_*}}`, `{{custom}}`, `{{dates}}`, `{{times}}` (cf. `caftan-rh/src/lib/email-templates.ts`). À garder tel quel — base solide.

### 5.2 Niveau intelligence (extensions)

Ajouts à la table `email_templates` (migration Vague 3) :
- `tone enum ('formel','chaleureux','urgent','court')` — 1 slug peut avoir 4 variantes
- `lang enum ('fr','nl','en')` — versions multilangues
- `auto_fill_dates boolean` — si true, le système **propose** automatiquement 3 créneaux libres extraits du calendrier `shifts` du manager assigné (au lieu de l'humain qui tape "lundi 12/05 ou mardi 13/05")
- `ai_personalize boolean` — si true, l'IA personnalise une phrase d'intro selon le contexte du candidat (CV, motivation, source) avant envoi

Variables additionnelles à supporter dans `renderTemplate()` :
- `{{job_title}}`, `{{job_location}}`, `{{job_contract}}` — du `applications.job`
- `{{interview_when}}`, `{{interview_where}}`, `{{interview_meeting_url}}` — du dernier interview
- `{{manager_name}}`, `{{manager_phone}}` — du `assigned_manager`
- `{{document_upload_url}}` — magic link signé pour upload doc

### 5.3 Templates contextuels NOUVEAUX (à seeder en Vague 2-3)

| Slug | Quand | Variables |
|---|---|---|
| `request_document_id` | Demande copie CI | `{{firstname}}`, `{{document_upload_url}}` |
| `request_document_iban` | Demande IBAN | idem |
| `request_document_medical` | Demande certif médical | idem |
| `confirm_document_received` | Confirmation reçu | `{{firstname}}`, `{{document_label}}` |
| `contract_to_sign` | Contrat à signer prêt | `{{firstname}}`, `{{contract_pdf_url}}` |
| `start_date_jminus3` | J-3 prise de poste | `{{start_date}}`, `{{location}}`, `{{manager_name}}` |
| `start_date_jminus1` | J-1, recap pratique | idem |
| `start_date_j0` | Bon premier jour | idem |
| `anniversary_year_n` | Anniv embauche | `{{years}}` |
| `trial_end_review` | Fin essai à 6m | `{{trial_end_date}}` |
| `cdd_renewal` | Renouvellement CDD | `{{cdd_end_date}}` |
| `offboarding_thanks` | Sortie | `{{firstname}}`, `{{last_day}}` |

---

## 6. Échange documents officiels

### 6.1 Catalogue documents

Table `document_catalog` à créer en Vague 2 : `slug, label, category, applies_to (candidate|employee), required_at_stage`, ex.
- sourcing : `cv`, `cover_letter`
- recrutement : `motivation_video?`
- embauche : `id_card`, `nrn_proof`, `iban`, `mutuelle_certificate`, `contract_signed`, `dimona_proof`
- onboarding : `medical_certificate`, `bank_card_photo`, `family_allowance_caisse`
- quotidien : `time_off_certificate`, `sick_note`
- départ : `c4_form`, `final_paycheck_signed`

### 6.2 Workflow standard

1. Le système calcule "ce qui manque" : `onboarding_run_items` non cochés OU `document_catalog` requis non présents dans `documents`.
2. **DocChaser** déclenche une demande au candidat (template `request_document_*`) avec un magic link.
3. Magic link : route publique `/upload/[token]/page.tsx`, token signé contient `{document_slug, application_id|employee_id, expires_at}`.
4. Page upload SANS LOGIN : drag-drop, preview, submit → upload Supabase Storage `documents` bucket → trigger qui crée `documents` row + `messages` inbound (subject: "Document reçu : <label>").
5. **DocClassifier** valide que le fichier correspond bien au type demandé (sinon message "le fichier ne semble pas être une carte d'identité, peux-tu vérifier ?").
6. Si OK : RH reçoit notification, valide d'un clic. À la validation, item onboarding correspondant coché auto.
7. Si refus humain (pas la bonne qualité, pas la bonne face…) → bouton "redemander" qui renvoie un nouveau template avec contexte ("la copie n'était pas lisible, peux-tu réessayer ?").

### 6.3 Sécurité

- **Magic links** : `crypto.randomUUID()` + signature HMAC, stockés en `document_upload_tokens` (id, candidate/employee_id, doc_slug, expires_at, used_at, created_by).
- **TTL 7 jours** par défaut, prolongeable via UI.
- **Encryption at rest** : Supabase Storage server-side encryption (AES-256 par défaut sur tous les buckets).
- **Audit log** : chaque accès au lien (open, upload, view) → `activity_log` kind = `document.upload_link.*`.
- **RLS** sur `document_upload_tokens` : insert RH only, select via service role uniquement (jamais exposé client).

---

## 7. Intelligence artificielle : le cœur

### 7.1 Provider candidat — recommandation

**Anthropic Claude (Sonnet 4.7) en serveur-side**.

Justifications :
- Modèle **Sonnet 4.7** : très bon en français (boutique BE, candidats francophones), tool-use natif, prompt caching disponible (jusqu'à 90 % de réduction sur contexte répété — critique pour les agents qui reçoivent toujours le même schema/few-shots).
- **Haiku 4.7** pour les tâches volume (triage simple, classification PJ) : 5x moins cher, latence < 500 ms.
- **Routage par tâche** :
  - Triage / classification → Haiku
  - Reply draft / scoring candidat / digest → Sonnet
  - Cas ambigus / fallback → Sonnet avec `extended_thinking`

**Estimation coût/mois** (1809 candidats existants, ~30 nouveaux/mois, ~50 emails entrants/jour) :
- Triage : 50/jour × 30 = 1500 calls Haiku × ~300 tok in / 50 tok out ≈ 1.5$/mois
- Reply draft : 30/jour × 30 = 900 × 1500 / 300 Sonnet ≈ 6$/mois
- Sourcing scoring : 30/mois × 2000 / 300 Sonnet ≈ 0.5$/mois
- Digest 2/jour × 30 = 60 × 5000 / 1000 Sonnet ≈ 5$/mois
- DocClassifier : 50/mois × 1500 / 100 Haiku ≈ 0.5$/mois
- **Total estimé : 15-25$/mois**, avec prompt caching agressif passe à **5-12$/mois**.

### 7.2 Use cases IA prioritaires

1. **Triage emails entrants** — sortie : `{category, candidate_id|null, urgency, suggested_action}`
2. **Reply drafting** — sortie : 3 brouillons HTML, chacun avec `tone`
3. **Candidate scoring** — entrée : motivation + CV + job → sortie : `{fit_0_100, strengths, gaps, suggested_next_stage}`
4. **Document classification** — entrée : filename, mime, premier extrait texte → `{kind, confidence}`
5. **Smart scheduling** — entrée : disponibilités manager + préférences candidat → 3 créneaux ranked
6. **Onboarding personalization** — adapter checklist selon contrat (CDD/CDI/étudiant), poste (vendeur, gérant, bouchère…)
7. **Anomaly detection** — entrée : agrégat shifts/time_entries/scores derniers 30j → flags
8. **Patron daily digest** — synthèse 7h+18h, ton : direct, prioritaire, court

### 7.3 Architecture des appels IA

Module `caftan-rh/src/lib/ai/` :
- `agent.ts` — abstraction `runAgent({task, input, model?, cache?})` qui résout provider + prompt + tools
- `providers/anthropic.ts` — appelle Claude API avec `prompt_caching` sur le system prompt
- `prompts/triage.ts`, `prompts/reply.ts`, `prompts/scoring.ts` etc. — un fichier par task, system prompt + few-shots versionnés
- `tools/` — tools-use que les agents peuvent invoquer (`fetch_candidate_context`, `lookup_calendar_slots`, `update_status`, `mark_onboarding_done`)
- `cache.ts` — cache table `ai_outputs(input_hash, task, output, model, created_at)` ; clé = SHA-256 du payload normalisé. TTL 30 jours par défaut, configurable par task.
- `audit.ts` — chaque appel logué dans `ai_audit(task, input_size, output_size, cost_estimate, model, duration_ms, called_by)` pour suivi RGPD + budget.

### 7.4 Évolution : phases d'autonomie

| Phase | Comportement | Quand passer ? |
|---|---|---|
| **P1 — Suggestion** | Tout draft, jamais d'action ; UI montre proposition avec [Approuver] [Modifier] [Rejeter]. | Default, vague 3-4 |
| **P2 — Auto sur cas triviaux** | Whitelist d'actions à confiance > 0.95 (accusé réception, classification spam, tag PJ, relance J+5) | Vague 5+ après 4 semaines de P1 sans erreur grave |
| **P3 — Autonomous loop** | Tous use-cases autonomes sauf liste noire (rejet candidat, signature contrat, hiring, fire) | Vague 7+ après audit complet, opt-in patron |

Toggle config dans `org_settings.ai_autonomy_level` (0/1/2/3), exposé en `/admin/settings`.

---

## 8. Roadmap par vagues

### Vague 1 — Inbound emails + Composer libre (CRITIQUE — 1 session)

**Objectif** : capter les réponses Gmail dans la plateforme. Permettre des emails libres.

#### Migration DB
`supabase/migrations/20260510000001_inbound.sql` :
- `create table inbound_emails (id, from_email, from_name, to_email, subject, body_text, body_html, message_id, in_reply_to, references_header, headers jsonb, raw jsonb, received_at, matched_application_id?, matched_via, attachments jsonb, status enum('pending','matched','unmatched','spam','archived'))`
- `create table email_threads (id, application_id, subject_root, last_message_at)` + jointure messages.thread_id
- alter `messages add column thread_id uuid, message_id_header text, in_reply_to_header text`
- alter `email_templates add column allow_freeform boolean default true`
- bucket Storage `inbound-attachments` + RLS

#### Endpoints / fichiers
- `caftan-rh/src/app/api/inbound/route.ts` — POST handler : valide signature Resend, parse, écrit `inbound_emails`, lance Triage (sync version simple).
- `caftan-rh/src/lib/inbound/matcher.ts` — cascade de matching (4.3).
- `caftan-rh/src/lib/inbound/parse-attachments.ts` — décode base64 PJ, upload Storage, log dans documents.
- `caftan-rh/src/app/rh/messages/page.tsx` — REFONTE en layout 3 colonnes.
- `caftan-rh/src/app/rh/messages/thread/[id]/page.tsx` — vue thread.
- `caftan-rh/src/components/email-send-dialog.tsx` — ajouter mode "freeform" (sujet+body éditables sans template, toggle template/free).
- `caftan-rh/src/app/rh/messages/unmatched/page.tsx` — bucket "à attribuer", drag-and-drop vers candidat.
- `caftan-rh/src/app/api/inbound/poll/route.ts` (fallback) — cron 5 min si Resend forward pas dispo.

#### Setup ops (à faire HORS code, par le patron)
- Resend Inbound : créer parse domain `parse.caftan.example` + DNS MX
- Gmail elbazikarim : créer filtre "From: candidats" → Forward → `inbox@parse.caftan.example`
- `.env.local` ajout `RESEND_API_KEY`, `RESEND_INBOUND_SECRET`, `INBOUND_PARSE_DOMAIN`

#### Acceptance
- Un email envoyé depuis un candidat connu vers `hr@caftanfactory.com` apparaît dans `/rh/messages` en moins de 30s, attaché au bon dossier, avec PJ classée et téléchargeable.
- Le patron peut écrire un email libre (sans template) depuis n'importe quelle fiche candidat.

---

### Vague 2 — Document exchange workflow (1-2 sessions)

**Objectif** : zéro doc qui se perd ; demande/reçoit/coche tout seul.

#### Migration DB
`supabase/migrations/20260520000001_documents.sql` :
- `create table document_catalog (slug pk, label, category, applies_to, required_at_stage, default_template_slug)`
- `create table document_upload_tokens (id, token, candidate_id?, employee_id?, doc_slug, expires_at, used_at, created_by, status)`
- alter `documents add column catalog_slug text, validated_by uuid, validated_at, validation_status enum('pending','accepted','rejected'), rejection_reason text`
- seed catalog (12-15 docs initiaux)

#### Fichiers
- `caftan-rh/src/lib/documents/catalog.ts` — CRUD catalog
- `caftan-rh/src/lib/documents/missing.ts` — `computeMissingDocs(candidateId|employeeId)` → liste
- `caftan-rh/src/app/rh/candidates/[id]/documents-panel.tsx` — affichage présents/manquants + bouton "Demander"
- `caftan-rh/src/app/api/documents/request/route.ts` — crée token, envoie email
- `caftan-rh/src/app/upload/[token]/page.tsx` — page publique upload (server component validates token)
- `caftan-rh/src/app/upload/[token]/upload-form.tsx` — client uploader
- `caftan-rh/src/app/api/documents/upload/route.ts` — handler upload
- nouveau cron `caftan-rh/src/app/api/cron/doc-chaser/route.ts` — quotidien, scanne `computeMissingDocs` pour tous candidats actifs et ceux dont prise de poste J-7, déclenche demandes auto

#### Acceptance
- RH coche embauche d'un candidat → checklist auto-générée → emails de demande partent → candidat upload sans login → docs apparaissent classés et items cochés.

---

### Vague 3 — Triage IA + Reply drafter (1-2 sessions)

**Objectif** : l'IA lit chaque email, propose la suite.

#### Migration DB
`supabase/migrations/20260530000001_ai.sql` :
- `create table ai_outputs (id, task, input_hash, output jsonb, model, tokens_in, tokens_out, cost_usd, created_at)`
- `create table ai_audit (id, task, called_by, application_id?, model, duration_ms, success, error, cost_usd, created_at)`
- `create table agent_actions (id, kind, status enum('proposed','approved','rejected','executed','expired'), payload jsonb, target_type, target_id, proposed_at, decided_by, decided_at, executed_at, ai_confidence numeric)`
- alter `org_settings add column ai_autonomy_level smallint default 0, ai_provider text default 'anthropic', ai_budget_usd_monthly numeric default 50`

#### Fichiers
- `caftan-rh/src/lib/ai/agent.ts`, `providers/anthropic.ts`, `cache.ts`, `audit.ts`
- `caftan-rh/src/lib/ai/prompts/triage.ts` (system prompt + few-shots)
- `caftan-rh/src/lib/ai/prompts/reply-draft.ts`
- `caftan-rh/src/lib/ai/prompts/doc-classify.ts`
- mise à jour de `caftan-rh/src/app/api/inbound/route.ts` pour appeler Triage après écriture inbound
- `caftan-rh/src/app/rh/inbox/page.tsx` — **NEW : Inbox d'actions** unique pour le patron (toutes les `agent_actions` status=proposed)
- `caftan-rh/src/app/rh/inbox/[id]/page.tsx` — vue détaillée avec brouillons, [Approuver] envoie via flow outbound existant, [Rejeter] ferme avec raison, [Modifier] ouvre composer
- composant `ai-suggestions-strip.tsx` — 3 réponses rapides au-dessus du composer thread

#### Acceptance
- 50 emails entrants en 24h → ≥ 90 % bien triés (catégorie + match) → 3 brouillons par email actionnable → patron clique 3 fois en 5 min pour traiter sa journée.

---

### Vague 4 — Smart scheduling + Daily digest (1 session)

**Objectif** : l'IA propose des créneaux et résume la journée.

#### Fichiers
- `caftan-rh/src/lib/ai/prompts/scheduling.ts`
- `caftan-rh/src/lib/scheduling/availability.ts` — extrait dispos manager des `shifts` + `time_off_requests`
- `caftan-rh/src/app/rh/candidates/[id]/schedule-button.tsx` — bouton "L'IA propose 3 créneaux"
- `caftan-rh/src/lib/ai/prompts/digest.ts`
- `caftan-rh/src/app/api/cron/digest/route.ts` — 7h00 + 18h00 (via vercel cron `/api/cron/digest?slot=morning|evening`)
- `caftan-rh/src/app/admin/digest/page.tsx` — historique digests, déclenchement manuel
- ajouter envoi email du digest au patron via outbound existant

#### Acceptance
- Le patron reçoit à 7h un email "Aujourd'hui : 3 candidatures à valider, 1 fin essai cette semaine, 2 docs en retard, KPI weekly". Cliquable.

---

### Vague 5 — Anomaly detection + Auto-actions (1+ session)

**Objectif** : l'IA agit toute seule sur les cas évidents, alerte sur les anomalies.

#### Fichiers
- `caftan-rh/src/lib/ai/prompts/anomaly.ts`
- `caftan-rh/src/app/api/cron/anomaly-scan/route.ts` — quotidien, scanne employés actifs (no-shows, baisse score, retards)
- whitelist auto-actions dans `caftan-rh/src/lib/ai/auto-execute.ts` : (1) accusé réception nouvelle candidature, (2) classification spam, (3) relance J+5 sans réponse, (4) tag pièce jointe, (5) cocher item onboarding
- toggle `org_settings.ai_autonomy_level` → 1 active la whitelist
- `caftan-rh/src/app/admin/ai-audit/page.tsx` — dashboard appels IA, coût, erreurs, actions auto

#### Acceptance
- En une semaine d'activation P2, ≥ 30 % des actions tâches IA sont auto-exécutées sans intervention humaine, 0 escalade pour erreur grave.

---

## 9. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Coûts API IA explosent | Moyenne | Moyen | Cache `ai_outputs` agressif, prompt caching Claude, budget mensuel hard-stop dans `org_settings.ai_budget_usd_monthly` + circuit breaker |
| Faux positifs sur classification → mauvais matching candidat | Moyenne | Élevé | Phase 1 toujours human-in-the-loop ; bucket "à attribuer" ; confiance < 0.7 = pas d'auto-action |
| RGPD : IA traite données personnelles | Élevée | Élevé | `ai_audit` log de chaque accès ; data minimization (ne pas envoyer NRN à l'IA) ; opt-in tenant ; Anthropic data policy (no training) |
| Gmail API setup retardé | Moyenne | Moyen | Vague 1 = Resend Inbound (option C) en attendant ; pas de blocage de la roadmap |
| EmailJS rate-limit ou suspension | Faible | Élevé | Activer Resend SDK déjà installé en parallèle, fallback automatique |
| Token magic link upload détourné | Faible | Élevé | TTL 7j, HMAC, single-use enforcement, audit log, IP rate limit sur `/upload/[token]` |
| Patron refuse l'autonomie | Élevée | Faible | Toggle `ai_autonomy_level=0` par défaut, opt-in progressif |
| Volume inbound dépasse parsing | Faible | Moyen | Queue + batch ; `inbound_emails.status='pending'` traité par worker, pas synchrone |
| Données sensibles dans logs IA | Moyenne | Élevé | redaction layer dans `ai_audit` (masquer email, NRN, IBAN dans `input_size` mais pas le payload complet) |

---

## 10. KPIs de succès

| KPI | Baseline | Cible 3 mois | Cible 6 mois |
|---|---|---|---|
| % d'actions automatisées (sans clic humain) | 0 % | 15 % | 40 % |
| Temps médian de réponse à un candidat | ? (probable >24h) | < 4h | < 1h |
| Volume emails entrants captés (% du Gmail réel) | 0 % | 95 % | 99 % |
| % candidats avec dossier complet (tous docs requis présents) à J0 prise de poste | ? | 80 % | 95 % |
| # actions en attente patron (queue inbox) en fin de journée | n/a | < 5 | < 2 |
| Taux d'embauche (hired / total candidatures traitées) | ~0.8 % (15 employés / 1809 candidatures historiques) | 1.5 % | 2 % |
| Coût IA mensuel | 0 | < 25 $ | < 50 $ |
| NPS patron hebdomadaire | n/a | > 7/10 | > 9/10 |

---

## 11. Décisions ouvertes pour le patron

1. **Provider IA ?** → recommandation : Claude Sonnet 4.7 + Haiku 4.7 routing. Alternative OpenAI GPT-5 si préférence existante. À trancher avant Vague 3.
2. **Méthode inbound emails ?** → recommandation : Resend Inbound forward (Vague 1) puis Gmail API (Vague 4+). À valider l'achat Resend (paid plan ~20$/mois pour volume actuel).
3. **Seuil de confiance auto-action ?** → recommandation : 0.95 conservateur en P2, baissé à 0.85 en P3.
4. **Multi-tenant ?** → recommandation : 1 entreprise = 1 instance pour l'instant. La table `org_settings` (singleton id=1) est non-multi-tenant. À refactorer en V2 si CaftanRH devient SaaS.
5. **Quel email de fonctionnement IA ?** → un compte dédié `ia@caftanfactory.com` ou utiliser `hr@caftanfactory.com` ? Recommandation : conserver `hr@` comme reply-to humain, ajouter `digest@` pour les digests automatiques.
6. **Autonomie initiale** → P1 partout pendant 4 semaines. Activation P2 sur whitelist limitée par accord explicite patron via `/admin/settings`.

---

## 12. Premiers fichiers à créer (action items vague 1)

### Migrations
- `supabase/migrations/20260510000001_inbound.sql` — tables `inbound_emails`, `email_threads`, alter `messages`, alter `email_templates`, bucket `inbound-attachments`

### Backend
- `caftan-rh/src/app/api/inbound/route.ts` — webhook Resend Inbound
- `caftan-rh/src/app/api/inbound/poll/route.ts` — fallback IMAP (option B en cas d'urgence)
- `caftan-rh/src/lib/inbound/matcher.ts` — cascade match
- `caftan-rh/src/lib/inbound/parse.ts` — normalisation MIME → row
- `caftan-rh/src/lib/inbound/attachments.ts` — upload PJ vers Storage

### UI
- `caftan-rh/src/app/rh/messages/page.tsx` — refonte 3 colonnes
- `caftan-rh/src/app/rh/messages/thread/[id]/page.tsx` — vue thread
- `caftan-rh/src/app/rh/messages/unmatched/page.tsx` — bucket à attribuer
- `caftan-rh/src/components/email-send-dialog.tsx` — ajouter mode freeform

### Settings ops
- `.env.local` (à compléter par le patron) : `RESEND_API_KEY`, `RESEND_INBOUND_SECRET`, `INBOUND_PARSE_DOMAIN`
- DNS : MX + DKIM/SPF du parse domain
- Filtre Gmail : forward auto vers parse domain

---

## Résumé exécutif (1 paragraphe)

CaftanRH a déjà 80 % des fondations (pipeline, planning, scoring, sequences, EmailJS outbound, audit log). Le **chaînon manquant central** est la **boucle inbound** : capter les réponses Gmail des candidats et les attacher automatiquement au dossier. C'est la **Vague 1**, livrable en une session via Resend Inbound forwarding. Une fois l'inbound vivant, on greffe en cascade : (V2) workflow d'échange documents avec magic links et auto-classification, (V3) Triage + Reply Drafter Claude qui transforment l'app en "Inbox d'actions" pour le patron, (V4) scheduling intelligent + digest 7h/18h, (V5) auto-actions sur whitelist + anomaly detection. Coût IA estimé 5-25 $/mois. Le patron passe progressivement de "exécutant" à "valideur" puis "superviseur".
