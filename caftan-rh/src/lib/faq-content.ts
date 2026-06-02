// Karim 2026-06-02 : contenu FAQ structuré PAR RÔLE.
// Pas de mélange entre rôles : chaque rôle voit UNIQUEMENT les questions
// pertinentes pour son scope.
//
// Structure : Role → Catégories → Questions
//
// Pour ajouter une question : edit ce fichier (pas de BD nécessaire — l'UI
// fait son rendu). On gardera ça en code source pour versioning + diffs.

export type FaqRole = "admin" | "rh" | "manager" | "candidate";

export interface FaqQuestion {
  q: string;
  a: string; // peut contenir des liens markdown [texte](url)
}

export interface FaqCategory {
  id: string;
  title: string;
  icon: string; // lucide name
  questions: FaqQuestion[];
}

export interface FaqRoleContent {
  role: FaqRole;
  intro: string;
  categories: FaqCategory[];
}

// ============================================================
// ADMIN
// ============================================================
const ADMIN_FAQ: FaqRoleContent = {
  role: "admin",
  intro: "Réponses aux questions techniques + opérationnelles pour les admins. Couvre la configuration, le monitoring, les opérations sensibles et le legal RH belge.",
  categories: [
    {
      id: "tunnels-acces",
      title: "Tunnels & accès distant",
      icon: "Globe",
      questions: [
        { q: "Comment savoir quel tunnel est actif maintenant ?", a: "Le fichier `caftan-rh/TUNNEL_URL.txt` contient toujours l'URL active (mis à jour par tunnel-keeper.ps1). Le bookmark stable GitHub raw est : https://raw.githubusercontent.com/Elbakr/Formulaire_candidats/caftan-rh-v2-prod/caftan-rh/TUNNEL_URL.txt" },
        { q: "Les magic links redirigent vers localhost — pourquoi ?", a: "Supabase valide redirect_to contre une allowlist. Aller sur dashboard.supabase.com → Auth → URL Configuration → ajouter `https://*.trycloudflare.com/**` et `https://*.loca.lt/**` dans Redirect URLs." },
        { q: "Comment relancer le tunnel cloudflared ?", a: "Le keeper PowerShell s'auto-redémarre. Si vraiment KO : `Stop-Process -Name cloudflared -Force` puis `powershell -File caftan-rh/scripts/tunnel-keeper.ps1` (background)." },
        { q: "Le code utilise-t-il toujours le tunnel actif ?", a: "Oui via `lib/public-base-url.ts:getPublicBaseUrl()` qui lit TUNNEL_URL.txt en priorité puis NEXT_PUBLIC_SITE_URL. Couverture : invite identifiants, magic links, signatures contrat, reset password, pre-interview, tracking PDFs." },
      ],
    },
    {
      id: "tuya-pointage",
      title: "Tuya & pointage temps réel",
      icon: "Activity",
      questions: [
        { q: "Combien d'empreintes par travailleur ?", a: "1 site = 2 empreintes (IN + OUT). Un travailleur multi-sites a donc 2 × N empreintes actives (sauf Anvers qui a un système différent). Voir `tuya_user_mapping`." },
        { q: "Lina (ou autre) n'apparaît pas dans Pointage E le 19/05 — pourquoi ?", a: "Soit le sync Tuya a raté ce jour-là (vérifier `tuya_sync_state.last_sync_at`), soit le travailleur a pointé sur un autre device. Solution : ajouter le shift manuellement via /planning/employees/[id]/prestations → bouton ➕ Shift manuel. L'audit log trace la correction." },
        { q: "Comment ajouter un nouveau device Tuya ?", a: "1) Enregistrer le device dans le portail Tuya. 2) Insérer dans `tuya_devices` avec `is_pointage=true` et `site_id`. 3) Pour chaque empreinte, créer un mapping dans `tuya_user_mapping` (tuya_user_id ou tuya_user_id_alpha + employee_id + direction in/out)." },
        { q: "Comment marquer un jour de repos pour distinguer d'un trou de pointage ?", a: "Page prestations → bouton 🌙 Jour de repos. Crée un `clock_entries kind='rest_day'`. Audit log automatique dans `clock_entry_corrections`." },
      ],
    },
    {
      id: "fiches-paie",
      title: "Fiches de paie & paiements",
      icon: "Wallet",
      questions: [
        { q: "Drop d'un PDF fiches paie qui contient 13 fiches — anti-doublon ?", a: "L'extracteur split par 'FEUILLE DE PAIE'/'LOONBRIEF'. Chaque fiche = 1 row uniquement si pas d'existant pour (employee+period+is_secondary). Re-drop = pas de doublons. Voir feedback_payslip_no_duplicates." },
        { q: "Double fiche même mois (régularisation) — comportement ?", a: "La 2ème fiche est marquée `is_secondary=true` + `scheduled_payment_date = now + 5-10 jours`. Cron quotidien `payslip-secondary-notify` libère automatiquement à J+6." },
        { q: "Watermark sur les PDFs envoyés — comment désactiver ?", a: "Pas d'option UI pour l'instant. Le watermark est dans `sendPayslipToEmployeeAction`. Si fallback nécessaire (PDF intact), supprimer l'import dynamique dans actions.ts ou retourner les bytes originaux dans `applyDynamicWatermark`." },
        { q: "Bulk actions — comment marquer plusieurs fiches payées d'un coup ?", a: "Sur /admin/payslips : checkboxes par fiche → barre flottante apparaît → 'Marquer payées' (avec confirmation total)." },
      ],
    },
    {
      id: "contrats",
      title: "Contrats (CDD + Étudiant)",
      icon: "FileSignature",
      questions: [
        { q: "Pourquoi pas de CDI possible ?", a: "Politique stricte CaftanRH : tous les contrats sont CDD ou Étudiant. Configuré dans `no-cdi-rule.sql` + validation côté UI." },
        { q: "Contrat avant date de début — pourquoi le bouton envoyer est bloqué ?", a: "Loi belge 3 juillet 1978 art. 9 : un contrat non signé avant l'entrée en service devient CDI. Si start_date < today, l'envoi est bloqué — reculer la date OU contacter un admin pour test (auto-redirect mail vers profile.email)." },
        { q: "Pré-signature employeur — comment fonctionne ?", a: "Va sur `/admin/settings/my-signature` → tracer ta signature → enregistrer. Stockée dans `profiles.signature_data_url`. Embedded automatique sur tous les contrats + ruptures envoyés via DocuSeal (1 seul signataire restant = employee)." },
        { q: "Layout des contrats — peut-on le modifier ?", a: "NON. Layout v8.1 inviolable. p margin >= 0.12cm + article margin >= 0.4cm. Si modification, refaire le QA pixel-perfect contre les PDFs originaux." },
      ],
    },
    {
      id: "rupture-amiable",
      title: "Rupture amiable (lettre 402.00)",
      icon: "FileX",
      questions: [
        { q: "Quelle valeur légale a la signature DocuSeal ?", a: "Signature électronique avancée (AES) eIDAS UE 910/2014. Même valeur juridique qu'une signature manuscrite. Audit log DocuSeal (IP, timestamp, durée de lecture) = preuve de consentement en cas de litige." },
        { q: "Mention 'lu et approuvé' — supprimée à juste titre ?", a: "Oui : pas obligatoire en droit BE pour une convention amiable. Remplacée par mention auto 'Lu et approuvé — signé électroniquement le JJ/MM/AAAA (eIDAS)' sous chaque signature. Cass. fr. 30 oct. 2008 confirme aussi." },
        { q: "Cooling-off 3 jours — pourquoi ?", a: "Demande worker → date effective minimum = requested_at + 3 jours (trigger DB inviolable `enforce_termination_earliest_date`). Évite les ruptures impulsives. Admin/RH peut fixer une date plus tôt si l'initiation vient d'eux." },
        { q: "Mode 'Imprimer' vs 'Aperçu' — différence ?", a: "Imprimer : mode papier avec mention manuscrite « lu et approuvé » + cases vides (signature stylo). Aperçu/Envoyer : mode eIDAS avec mention électronique + signature-field DocuSeal." },
      ],
    },
    {
      id: "audit-securite",
      title: "Audit & sécurité",
      icon: "ShieldCheck",
      questions: [
        { q: "Comment savoir qui a partagé/consulté un document ?", a: "Table `document_audit_log` (employee_id, doc_type, doc_ref, action, actor, IP, UA, timestamp). Backend prêt, UI dédiée à venir." },
        { q: "Historique des corrections de pointage ?", a: "Table `clock_entry_corrections` (action, before/after JSON, actor, raison, target_date). UI : bouton 📋 Historique sur page prestations." },
        { q: "RGPD — combien de temps les données candidats ?", a: "Maximum 12 mois après refus, puis suppression. Anonymisation auto J+12 mois pas encore implémentée (à faire)." },
      ],
    },
  ],
};

// ============================================================
// RH
// ============================================================
const RH_FAQ: FaqRoleContent = {
  role: "rh",
  intro: "Réponses pour la gestion quotidienne des employés, contrats, fiches de paie, candidats. Couvre les workflows opérationnels.",
  categories: [
    {
      id: "planning-equipe",
      title: "Planning & équipe",
      icon: "Calendar",
      questions: [
        { q: "Comment créer un shift ?", a: "Sur /planning/calendar : clic sur une cellule vide → modal avec employee + horaires. Drag & drop pour déplacer." },
        { q: "Renfort demandé — comment ça marche ?", a: "RH demande un renfort sur un shift → notification push à tous les employees disponibles. Le premier qui valide gagne. La validation expire automatiquement 1h après le début du shift, OU dès qu'un autre travailleur a comblé le besoin." },
        { q: "Comment vider une semaine entière pour un employee ?", a: "Sur sa fiche → bouton 'Vider semaine en cours'. Pour une autre semaine, utiliser /planning/employees/[id]/calendar avec navigation." },
      ],
    },
    {
      id: "fiches-employee",
      title: "Fiches employés",
      icon: "Users",
      questions: [
        { q: "Champs requis incomplets pour générer un contrat — quoi faire ?", a: "Sur la fiche employee, banner rouge liste les champs manquants. Onglet 'Embauche' → 'Demander au candidat' envoie un magic link 1h pour qu'il complète lui-même." },
        { q: "Comment inviter un employee à créer son compte ?", a: "Fiche employee → bouton 'Inviter (créer compte)'. Génère un mot de passe random. URL pointe sur le tunnel actif (visible iPhone). 3 modes d'envoi : Copier / WhatsApp / Email." },
        { q: "Avance salaire — comment l'enregistrer ?", a: "Fiche employee → onglet Avance → montant + note. La prochaine fiche de paie déduit automatiquement (max = net amount). Reset après paiement." },
        { q: "Employee en congé — apparaît-il dans la liste active ?", a: "Oui. Les listes 'employés actifs' incluent `status IN ('active', 'on_leave')`. Badge 'en congé' affiché dans l'UI." },
      ],
    },
    {
      id: "candidats",
      title: "Candidats & screening",
      icon: "UserCheck",
      questions: [
        { q: "Un candidat a postulé — où je trouve sa candidature ?", a: "/rh/candidates : liste avec filtres par statut, ville, etc." },
        { q: "Pré-entretien expiré — comment relancer ?", a: "Sur fiche candidat → onglet Pré-entretien → générer un nouveau lien. L'ancien est marqué expiré." },
        { q: "Screening : workflow de validation ?", a: "Candidat répond aux 30 questions → score auto + recommandation IA. RH consulte les résultats sur /rh/screening, ajoute son verdict (hired/refused/wait). Si red flag : alerte." },
        { q: "Comment voir tous les candidats avec score ≥ 80% ?", a: "/rh/screening → filtre 'Top scores'. Trier par recommandation pour ressortir les meilleurs." },
      ],
    },
    {
      id: "mails-communication",
      title: "Mails & communication",
      icon: "Mail",
      questions: [
        { q: "Tous les mails envoyés sont-ils archivés ?", a: "Oui dans `outbound_mails`. Page /rh/mails : recherche + filtres source/statut. Composer manuel sur /rh/mails/new avec pièces jointes (Supabase Storage 30j)." },
        { q: "Quelle adresse pour les réponses ?", a: "hr@caftanfactory.com (boîte commune RH). reply_to systématique sur tous les mails sortants." },
        { q: "Envoyer plusieurs fiches paie d'un coup ?", a: "/admin/payslips : checkboxes + barre flottante 'Envoyer en bloc'. Chaque mail est watermarké individuellement (nom destinataire embedded)." },
      ],
    },
    {
      id: "rupture-amiable-rh",
      title: "Rupture amiable",
      icon: "FileX",
      questions: [
        { q: "Comment initier une rupture amiable ?", a: "Fiche employee → bouton 'Rupture amiable' → modal avec date, représentant, ville, note → 'Générer la convention'. Statut direct = approved." },
        { q: "Un travailleur a demandé une rupture — comment valider ?", a: "Sur sa fiche, bouton rouge 'Demande rupture (à valider)' avec icône alerte. Clic → dialog avec date min imposée (J+3 cooling-off) + motif du travailleur affiché → 'Valider la demande'." },
        { q: "Imprimer la lettre pour signature stylo ?", a: "Modal Rupture → bouton 'Imprimer'. Ouvre la lettre avec mention manuscrite « lu et approuvé » + cases vides. Ctrl+P pour PDF." },
      ],
    },
  ],
};

// ============================================================
// MANAGER
// ============================================================
const MANAGER_FAQ: FaqRoleContent = {
  role: "manager",
  intro: "Réponses pour les managers : planning de son équipe, validations, prestations.",
  categories: [
    {
      id: "planning-manager",
      title: "Planning de mon équipe",
      icon: "Calendar",
      questions: [
        { q: "Comment voir le planning de mon site ?", a: "/planning/sites/[code] : vue dédiée du site, employees assignés, horaires." },
        { q: "Approuver un échange de shift entre 2 employees ?", a: "/planning/swaps : liste des demandes. Clic → vérifier impact (couvre quota, dispo OK) → Approuver/Refuser." },
        { q: "Demander un renfort sur un shift ?", a: "Clic sur le shift → bouton 'Demander renfort'. Notification push partie aux disponibles. Auto-cancel dès que quelqu'un valide." },
      ],
    },
    {
      id: "prestations-manager",
      title: "Prestations de mon équipe",
      icon: "Activity",
      questions: [
        { q: "Heures réelles vs planifiées — où voir ?", a: "Fiche employee → onglet Prestations. Compare clock_sessions (réel) vs shifts (planifié)." },
        { q: "Auto-OUT incorrect — comment corriger ?", a: "Sur la ligne du clock-out, badge 'AUTO-OUT (corrigible)' → bouton Modifier. Saisir l'heure réelle." },
      ],
    },
  ],
};

// ============================================================
// CANDIDATE / EMPLOYEE
// ============================================================
const CANDIDATE_FAQ: FaqRoleContent = {
  role: "candidate",
  intro: "Réponses aux questions que tu peux te poser en tant que travailleur. Couvre ton compte, ton planning, tes documents, ta paie.",
  categories: [
    {
      id: "mon-compte",
      title: "Mon compte",
      icon: "User",
      questions: [
        { q: "Je n'arrive plus à me connecter — que faire ?", a: "Sur la page de connexion, clic 'Mot de passe oublié'. Tu recevras un mail avec un lien pour redéfinir ton mot de passe." },
        { q: "Comment changer mon mot de passe ?", a: "Connecté → /me/profile → bouton 'Changer mot de passe'." },
        { q: "Mes infos personnelles sont incorrectes — comment les corriger ?", a: "/me/profile : tu peux modifier email, téléphone, adresse, IBAN. Pour des changements sensibles (nom, NRN), contacte RH." },
      ],
    },
    {
      id: "mon-planning",
      title: "Mon planning",
      icon: "Calendar",
      questions: [
        { q: "Où voir mes shifts ?", a: "/me/planning ou /me/today (aujourd'hui). Tu peux aussi consulter /me/clock pour les pointages." },
        { q: "Je ne peux pas être présent — comment signaler ?", a: "/me/absence : formulaire avec date + motif. Notification automatique à RH." },
        { q: "Échanger un shift avec un collègue ?", a: "/me/swaps : propose un échange. L'autre employee + manager doivent valider." },
        { q: "Indiquer mes disponibilités ?", a: "/me/availability : grille hebdomadaire à cocher. Le système autoplanner s'en sert." },
      ],
    },
    {
      id: "mes-documents",
      title: "Mes documents",
      icon: "FileText",
      questions: [
        { q: "Où télécharger mes fiches de paie ?", a: "/me/documents : toutes tes fiches paie + contrats. Chaque PDF est watermarké à ton nom pour traçabilité." },
        { q: "Mon contrat est-il signé ?", a: "/me/documents : tu vois le statut (en attente signature / signé). Si en attente, le mail DocuSeal contient le lien." },
        { q: "Mails reçus de CaftanRH ?", a: "/me/mails : historique de tous les mails que CaftanRH t'a envoyés (contrats, fiches paie, demandes infos, magic links)." },
      ],
    },
    {
      id: "signature-electronique",
      title: "Signature électronique",
      icon: "FileSignature",
      questions: [
        { q: "La signature électronique est-elle légale ?", a: "Oui — règlement eIDAS UE 910/2014. Même valeur qu'une signature manuscrite. Audit DocuSeal (timestamp, IP, durée lecture) sert de preuve." },
        { q: "Je ne reçois pas le mail DocuSeal — quoi faire ?", a: "Vérifier les spams. Sinon contacter RH pour renvoyer (sur la fiche admin, bouton 'Envoyer signature' qui régénère un nouveau lien)." },
      ],
    },
    {
      id: "rupture-amiable-worker",
      title: "Rupture amiable de contrat",
      icon: "FileX",
      questions: [
        { q: "Comment demander une rupture amiable ?", a: "/me/termination : formulaire avec motif + checkbox consentement. Demande envoyée à RH. Délai minimum 3 jours entre demande et date de fin (cooling-off légal)." },
        { q: "Quel est le délai d'examen ?", a: "RH a accès immédiat à ta demande. Statut visible sur /me/termination (pending_admin / approved / refused). Tu reçois un mail dès qu'elle change." },
        { q: "Puis-je annuler ma demande ?", a: "Tant que la convention n'est pas signée par les 2 parties, tu peux contacter RH pour annuler." },
      ],
    },
    {
      id: "primes-bonus",
      title: "Primes & bonus",
      icon: "Star",
      questions: [
        { q: "Où voir mes primes ?", a: "/me/my-bonus : historique des primes attribuées avec dates et montants." },
        { q: "Mon score ?", a: "/me/scoring : ton score basé sur ponctualité, ventes, comportement." },
      ],
    },
  ],
};

export const FAQ_BY_ROLE: Record<FaqRole, FaqRoleContent> = {
  admin: ADMIN_FAQ,
  rh: RH_FAQ,
  manager: MANAGER_FAQ,
  candidate: CANDIDATE_FAQ,
};

export function getFaqForRole(role: string): FaqRoleContent {
  if (role === "admin") return ADMIN_FAQ;
  if (role === "rh") return RH_FAQ;
  if (role === "manager") return MANAGER_FAQ;
  return CANDIDATE_FAQ;
}
