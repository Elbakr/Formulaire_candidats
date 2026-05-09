# Inventaire exhaustif des fonctionnalités de l'ancienne plateforme

_Généré automatiquement le 2026-05-09. Source de vérité pour la migration vers la nouvelle plateforme Next.js. Aucun feature listé ici ne doit être perdu sans décision explicite._

Sources analysées :
- `recrutement.html` (~302 KB · 5 229 lignes · cockpit RH monolithique)
- `planning-employes.html` (~690 KB · ~12 600 lignes · GestiPlanning monolithique)
- `formulaire-candidat.html` (~58 KB · 1 250 lignes · formulaire public lien unique)
- `a effacer.html` (~58 KB · ancienne version du formulaire — diffs marginaux uniquement)
- `caftan-rh-complet_105.zip` (244 KB · snapshot identique aux fichiers racine, légèrement antérieur)

---

## 1. recrutement.html (Cockpit RH)

### 1.1 Navigation et vues

Toutes ces vues sont mutuellement exclusives, gérées par `showView(v)` (`recrutement.html:3747-3757`). Topbar + sidebar rappelle chaque vue.

- `view-list` — Liste candidats (vue par défaut, `recrutement.html:304`)
- `view-settings` — Paramètres (`recrutement.html:348`)
- `view-agenda` — Agenda RDV (`recrutement.html:513`)
- `view-archives` — Candidats archivés (`recrutement.html:532`)
- `view-gf` — Synchronisation Gravity Forms (`recrutement.html:548`)
- `view-messagerie` — Messagerie/historique (`recrutement.html:613`)
- `view-templates` — Templates emails (`recrutement.html:634`)

### 1.2 Topbar (boutons globaux)

- Brand `☪ Caftan Factory — RH` + version `v2026.04.25-1629`
- Statut EmailJS inline (`#ebar-inline`)
- 📅 Agenda RDV → `showView('agenda')`
- 🔗 Gravity Forms → `showView('gf')`
- ✉ Templates → `showView('templates')`
- 💬 Messagerie → `showView('messagerie')`
- 💾 Backup JSON → `backupData()` (export JSON v3 contenant cands + pipeline + history + templates)
- 📊 Export Excel → `exportXLSX()` (TSV avec BOM UTF-8 + extension `.xlsx`)
- ↩ Restaurer → `<input type="file">` → `restoreData(input)`
- + Candidat → `openAddModal()`
- Bandeau email status (`#ebar`) qui passe en jaune (loading) / rouge (error) / vert (ok)

### 1.3 Sidebar — filtres pipeline + raccourcis

Pipeline avec compteurs (`recrutement.html:278-297`) :
- 📋 Tous · `setPipeFilter(null,…)` · `#nb-all`
- 📥 Nouveaux · `setPipeFilter('new',…)` · `#nb-new`
- 📞 Contactés · `setPipeFilter('contact',…)` · `#nb-contact`
- 📅 RDV · `#nb-rdv`
- ✅ Entretien · `#nb-done`
- 🎉 Engagé(e) · `#nb-hired` (badge vert)
- ⏳ Attente · `#nb-wait`
- 🚫 Refusé(e) · `#nb-refuse` (badge rouge)

Raccourcis vues (📋 Liste, 📅 Agenda, 🔗 GF, 💬 Messagerie, ✉ Templates), Outils (📥 Export CSV via `exportCSV()`, 🗄 Archives, 📅 GestiPlanning ouvre `planning-employes.html` dans onglet, ⚙️ Paramètres).

### 1.4 Constantes métier (à porter)

- `CF` (entreprise) : nom Caftan Factory, email `hr@caftanfactory.com`, phone `+32468596100`, WhatsApp `32468596100`, addr `Rue de Brabant 230, 1030 Schaerbeek (Bruxelles)` (`recrutement.html:1091`).
- `PIPE` : 7 statuts avec emoji + label + classe CSS (`recrutement.html:1097`).
- `EVAL_CRIT` : **7 critères** d'évaluation manager (NB : la nouvelle DB n'en prévoit que 5 axes scoring) (`recrutement.html:1107`) :
  - `ponctualite`, `presentation`, `communication`, `motivation`, `experience`, `polyvalence`, `disponibilite`
- `CHECKLIST_CATS` : 5 catégories × 21 items (`recrutement.html:1118-1166`) — voir §1.6
- `CITY_OK` : whitelist 14 communes Bruxelles (`recrutement.html:1172`)
- `GF_MAP` (mapping GF → champs internes) : `firstname:1, lastname:2, birthdate:4, email:5, phone:6, availableFrom:8, worktime:10, role:13, city:14`. Champ 11.1..11.7 = jours dispo Lun..Dim. Champ 7 = URL CV (heuristique). (`recrutement.html:1176`, `recrutement.html:2051-2111`).
- `GF_CFG` hardcoded : URL `https://caftanfactory.com`, formId 4, ck `ck_25452315496e2…`, cs `cs_f4ced7a759662…` (`recrutement.html:1177`).
- `LS` (clés localStorage) :
  - `rh_cands_v3` (cands)
  - `rh_hist_v1` (historique par cand id)
  - `rh_pipe_v1` (mapping id → stage)
  - `caftan_templates_v1` (overrides templates)
  - `rh_gf_v1` (lastSync GF)
  - `rh_archived_v1` (cands archivés)
  - `rh_last_save` (méta)
  - `rh_auto_backup` (backup avant fermeture)
  - `caftan_settings_v1` (settings utilisateur)
  - `gp_transfer_candidate` (transfert vers GestiPlanning)
- `GEO` : 4 zones de proximité (top Schaerbeek/limitrophe, bxl 19 communes, peri périphérie, fr France pénalisée) (`recrutement.html:1485`).
- `PRENOMS_F` / `PRENOMS_M` : ~150 prénoms FR/AR/africains pour détection genre (`recrutement.html:1585-1627`).

### 1.5 Configuration / Paramètres (`view-settings`, 7 blocs)

Stockage : `localStorage['caftan_settings_v1']` via `loadSettings()` / `saveSettings()` (`recrutement.html:4536-4670`).

1. **Identité entreprise** : `cfg-name`, `cfg-email`, `cfg-phone`, `cfg-wa`, `cfg-addr`
2. **Destinataires RH récap** (multi) : tags `cfg-rh-list`, ajout via `addRHEmail()`, suppression tag par tag — défaut `elbazikarim@gmail.com`
3. **EmailJS** : `cfg-ejs-sid`, `cfg-ejs-key`, `cfg-ejs-tmpl` + bouton **Tester** (`testEmailJS()`)
4. **Gravity Forms** : `cfg-gf-url`, `cfg-gf-ck`, `cfg-gf-cs`, `cfg-gf-fid`
5. **Mapping GF** (9 champs IDs) : `gfmap-firstname` … `gfmap-city`
6. **Interface & Comportement** : checkboxes `cfg-recap-always`, `cfg-assume-franco` (FR+AR par défaut si langues vides), `cfg-autosave` (toutes les 2 min), `cfg-send-delay` (ms entre emails 600 par défaut)
7. **Formulaire candidat en ligne** : `cfg-jsonbin-key`, `cfg-form-url` (URL hébergée GitHub Pages), `cfg-cloudinary-name`, `cfg-cloudinary-preset` + bouton `testFormLink()`

Actions : 💾 Sauvegarder, 📤 Exporter config JSON (`exportSettings`), 📥 Importer (`importSettings`), 🔄 Reset défauts (`resetSettings`).

Defaults hardcoded importants (`recrutement.html:4538-4569`) — `jsonbinKey: '$2a$10$F5WDFMcJ45ylysiNzaHp1ugrTiicbN38mz...'`, `formBaseUrl: 'https://elbakr.github.io/Formulaire_candidats/formulaire-candidat.html'`, `cloudinaryName: 'drzkhse8u'`, `cloudinaryPreset: 'caftan_rh'`. **À ne PAS migrer en clair vers la nouvelle plateforme** — les déplacer en variables d'environnement Supabase Vault.

### 1.6 Fiche candidat (modal `modal-cand`)

Layout 2 colonnes + bandeau (`recrutement.html:656-760`).

**Bandeau actions modale** :
- 👤 → GestiPlanning (`convertToGP`) écrit `gp_transfer_candidate` puis ouvre `planning-employes.html`
- ✉ Email (`openMailFor`)
- 🗄 Archiver (`archiveCand` + close)
- ✕ Fermer

**Header** : Nom, score sur 100 + label (Excellent/Très bon/Bon/Moyen/Faible/Éliminatoire), bouton Priorité (normal/high/urgent/watch).

**Stages** : 7 boutons clickables (`setStage`) — change pipeline direct.

**Colonne gauche** :
- 👤 Identité (igrid) : Prénom, Nom, Email, Téléphone, Date naissance, Âge, Genre détecté (`detectGender`)
- 📋 Informations administratives (champs édit `adminField`) : Nationalité, Ville naissance, NRN (placeholder `00-00-00-000-00`), Adresse complète, IBAN (`BE00 0000 0000 0000`), Abonnement transport, Prix abonnement
- 💼 Candidature : Poste, Contrat, Horaire déclaré, Disponible dès, Disponibilités (jours), Ville/Site, Inscrit le
- 📄 CV & Documents : si `c.cv` → bouton Voir + Télécharger ; sinon warning rouge. CIN PDF avec input URL → uploadable depuis Cloudinary
- 🗣 Langues parlées : 9 boutons toggle FR/AR/NL/EN/ES/IT/TR/PT/DE (`toggleCandLang`)
- 📅 Disponibilités & Indisponibilités programmées : liste avec motif/from/to + bouton +/- (`addUnavail`/`removeUnavail`) — sera transmis au planning
- ⭐ Note manager : 5 étoiles (`setRating`) + textarea note (`updField('managerNote',…)`)

**Colonne droite** :
- 📊 Évaluation manager (7 critères) : 5 étoiles par critère (`setEval`)
- ✅ Checklist intelligente avec **5 catégories** :
  - 📞 Contact & Identification (cin, cin_pdf file, nrn input, nationalité input, ville naissance input, adresse input)
  - 💳 Informations financières (iban input, transport input, transport_prix input)
  - 📄 Documents CV & Dossier (cv_recu, cv_pdf file, motivation, références)
  - 🎯 Processus de recrutement (tel, physique, essai, contrat)
  - 🚀 Onboarding & Administration (onss, dimona, acces, formation, uniforme)
  - Barre de progression colorée (vert ≥80%, ambre ≥50%, rouge sinon)
- ⚡ Actions rapides : ✉ Email, 📋 Formulaire (envoie lien JSONBin via `sendFormLink`), 📁 Dossier PDF (envoie email pré-rempli `sendDossierRequest`), 🎉 Engager, 🚫 Refuser
- Statut formulaire en ligne (`mc-form-status`) : indique si bin créé, dernière vérif, bouton 🔄 Vérifier maintenant + 🔗 Copier lien

**Score breakdown** (panneau dynamique inséré après "Candidature") :
- Bloc Recommandation (icône + action + détail + score)
- Bloc Alertes (positives vert / warnings ambre / négatives rouge)
- Bloc Détail score (7 barres) : Disponibilité /22, Flexibilité /15, Proximité /15, Adéquation poste /12, Dossier /13, Âge /10, Langues /30

**Historique complet** (`mc-hist`) : timeline tlcnt/tldot avec couleur par type (email/status/note/eval/check/error). 25 derniers événements.

**Ajouter une note** : input + bouton (`addNote()` → enregistre via `addH(currentId,'note',txt)`).

### 1.7 Scoring intelligent (formule `calcScore`)

Barème **/100** (recrutement.html:1756-1810). Total max = 87 sans langues + 30 langues + 8 manager + 5 évaluations = ramené sur 100 via division par maxPossible (125 si langues connues, sinon 95).

Sous-scores :
- `scoreDispo` /22 : 7j=22, 6j=20, 5j=17, 4j=12, 3j=8, 2j=4, 1j=2 + bonus +2 si samedi
- `scoreFlex` /15 : 10h-20h=15, "toute"=15, plein=12, flexi=10, étudiant=9, partiel=6, matin=5
- `calcProximite` /15 : Schaerbeek+limitrophe=15, Bruxelles=10, Périphérie=5, Belgique=3, France=0+malus, autre=2
- `scoreAge` /10 : 18-22=9, 22-30=10, 30-40=9, 40-50=7, >50=4 ; mineur=-999 (éliminatoire absolu)
- `scorePoste` /12 : vendeur/caissier=12 (parfait), stock/retail/mode=8 (bon), service/admin=4
- `scoreDossier` /13 : email=3, phone=3, cv=5, birthdate=1, availableFrom=1
- `scoreLangues` /30 : FR=10, AR=10, NL=8, EN=5, autres +2 chacun (cap 6) — **hypothèse FR+AR par défaut** si aucune saisie
- Bonus manager : `managerRating*2` (max +8) + moyenne `evalScores` (cap +5)

Pénalités absolues :
- France (proxR.malus) → score capé à 10
- 0 jour dispo → score capé à 20
- Âge < 15 → 0 immédiat

Recommandations finales (`genRecommandation`) :
- ≥75 : 🌟 CONVOQUER EN PRIORITÉ (vert)
- ≥60 : ✅ CONVOQUER (vert)
- ≥45 : 👍 CONVOQUER + VÉRIFIER (cyan)
- ≥30 : ⏳ LISTE ATTENTE (ambre)
- <30 : ❌ REFUSER POLIMENT (rouge)
- France → 🚫 REFUSER (mobilité impossible)
- 0 dispo → ⚠️ DOSSIER INCOMPLET

Alertes (`genAlertes`) génère 3 listes (pos/warn/neg) selon les sous-scores : présence FR+AR, NL atout Anvers, samedi disponible (jour de pointe), proximité, France=blocant, CV manquant, contact incomplet, note manager <2 = rouge / >=4 = vert.

`scoreLabel(s)` : ≥80 🌟 Excellent · ≥65 ✅ Très bon · ≥50 👍 Bon · ≥35 ⚠️ Moyen · ≥20 ❌ Faible · sinon 🚫 Éliminatoire.

`detectGender(c)` : priorité champ saisi, sinon match dans `PRENOMS_F`/`PRENOMS_M`, sinon heuristique morphologique (terminaisons -e/-ée/-ine = F, -our/-oud/-ane = M).

### 1.8 Liste candidats (`view-list`)

- 8 boîtes stats (Total + 7 stages) cliquables (`recrutement.html:2256-2261`)
- Barre filtres : recherche libre `q`, select Postes (peuplé via `buildPosteFilter`), select Zones (Bruxelles/Schaerbeek/Molenbeek/Anvers), select CV (avec/sans/tous), tri (📅 récent / ⭐ score / 🔤 A-Z), bouton **🔎 Filtres** (drawer Smart Filter — voir 1.9), ✕ Reset
- Pills filtres actifs (`#sf-pills`)
- Compteur résultats live `#results-bar` (X candidat(s) affiché(s) / sur Y au total)
- Cartes candidats (`renderCards`) avec :
  - Checkbox sélection multiple
  - Avatar HSL coloré par dernier char de l'id
  - Badge GF, badge genre 👩/👨, âge
  - Pipeline badge + label score + délai d'attente (Aujourd'hui / Hier / Nj)
  - Score sur 100 + barre de progression + étoiles manager
  - Badges langues (FR/AR/NL/EN/extras), proximité, jours dispo, CV
  - Worktime + availableFrom badges
  - Email/Téléphone, lien Voir CV, ⬇ Télécharger
  - Warning éliminatoire (pas FR+AR ou France)
  - Actions rapides : ✉ Email, 📞 Contacter, 🎉 Engager, 🚫 Refus, 🗄, "Fiche + analyse →"

### 1.9 Smart Filter (drawer latéral)

Drawer violet (`#sf-drawer`, `recrutement.html:892-1050`) ouvert via `toggleSmartFilter`. État stocké en JS, application live (`sfLive`).

Critères :
- 🗣 Langues maîtrisées (multi-tags FR/AR/NL/EN, FR+AR obligatoires éliminatoires)
- 📆 Jours disponibles (Lun-Dim individuels + WE) — logique ET stricte
- Slider "Jours minimum/semaine" (Tous/1j..7j)
- ⭐ Score RH minimum (slider 0-100, presets ≥35/≥50/≥70)
- 📄 CV (Avec/Sans), 📍 Proximité (Très proche ≤2km / Bruxelles / Excl. France)
- 🗓 Disponibilité rapide : 7j/7, Toute la semaine, 6j+, 5j+, Week-end, ⚡ Immédiat
- Date "Disponible avant le"
- ⏰ Horaire déclaré (10h→20h / Plein / Partiel)
- 🎓 Profil candidat : Étudiant / CDD / CDI / Flexi (déduit du contractType, role, worktime, note, âge ≤25)
- 👤 Genre (F/H, ignore "?" inconnu)
- ⭐ Note manager minimum (1★..5★)

Compteurs : `#sf-result-bar` (rouge 0 / ambre <10 / violet sinon), `#sf-badge` sur le bouton, pills.

### 1.10 Templates emails (9 templates)

Stockés dans `TEMPLATES` (`recrutement.html:1241-1429`). Édits sauvegardés dans `localStorage['caftan_templates_v1']` (objet par id avec `{subject?, body?}`).

| ID | Label | Slots dates/heures | Auto-pipeline après envoi |
|---|---|---|---|
| `invite` | 📅 Invitation entretien | oui (dates + créneaux) | new → contact |
| `invite_activa` | ⭐ Invitation + Plan Activa | oui | new → contact |
| `confirm_rdv` | ✅ Confirmation entretien | oui (1 date + 1 créneau) | → rdv |
| `relance` | 🔔 Relance candidature | non | new → contact |
| `refuse_positive` | 🚫 Refus positif | non | → refuse |
| `waitlist` | ⏳ Liste d'attente | non | → wait |
| `hired` | 🎉 Félicitations — Engagement | oui (prise de poste) | → hired |
| `docrequest` | 📋 Demande documents | non | — |
| `dispo_urgente` | ⚡ Disponibilité urgente | oui | — |
| `dossier_complet` | 📁 Demande dossier complet | non | — (envoyé via `sendDossierRequest`) |

Particularités :
- **Plan Activa Bruxelles** : template spécifique demandant attestation Actiris + relevé de situation
- Tous les templates incluent `sig()` : signature HTML Caftan Factory + email mailto + WhatsApp click-to-chat
- `dossier_complet` : email HTML très riche avec 6 sections (Identification, Bancaire, Transport, Disponibilités, Langues, Documents) avec cases pré-cochées si données déjà connues, sinon "À compléter ⚠️"
- Vue Templates (`renderTmpls`) : éditeur inline subject + body, aperçu avec données fictives, reset par template ou global

### 1.11 Modale Email (`modal-mail`)

Champs (`recrutement.html:763-833`) :
- Destinataires (max 6 affichés + "...et X autres")
- Sélecteur Template
- Sujet modifiable
- **Section dates/créneaux** (visible si template invitation) :
  - Textarea "Dates proposées (une par ligne)"
  - Textarea "Créneaux horaires (une par ligne)"
- **RDV séquentiels** (checkbox `seq-cb`) : assignation auto d'un créneau différent par candidat (`calcSlot`) avec date / heure début / durée par candidat (défaut 20 min)
- Textarea "Ajout personnalisé"
- Bouton 👁 Aperçu, ✉ Envoyer via EmailJS

Envoi (`sendMails`, `recrutement.html:3252-3318`) :
1. Loop `mailIds` avec `await new Promise(r=>setTimeout(r,600))` entre envois (anti-spam)
2. `ejsSend(to, name, subj, body)` via EmailJS service `service_of648pl`, template `template_caftan`, public key `ccnn5U3CXuyX-XJOg`
3. Auto-pipeline selon template
4. `addH` ajout historique avec metadata (template, subject, sentAt, dates, times)
5. Récap RH (`sendRHRecap`) envoyé à toutes les adresses `rhEmails`
6. Alerte récap au RH : `elbazikarim@gmail.com` hardcodée

Récap RH (`sendRHRecap`) : email HTML avec :
- En-tête + compteur envoyés/échecs
- Si RDV séquentiels : agenda tabulaire (heure/candidat/poste/contact/statut)
- Sinon : liste simple
- Section échecs en rouge
- Sujet : `📅 Agenda entretiens [date] — N RDV planifiés` ou `📋 Récap envoi "[label]" — N candidat(s)`

### 1.12 Agenda RDV (`view-agenda`)

3 vues (week/day/list) avec `agOffset`. Extraction RDV via `getAgRDVs()` qui parse l'historique (`type==='email'` + dates + times) (`recrutement.html:4107-4137`).

Parser dates `parseAgDate` : ISO, dd/mm/yyyy, "lundi 5 mai 2026" (mois FR/EN abrégés `jan/fév/mar/avr/mai/juin/juil/aoû/sep/oct/nov/déc`).

- **Vue semaine** : grille 7 jours × 13 heures (8h-20h, 48px/h), événements positionnés en absolute. Surbrillance jour courant.
- **Vue jour** : 60px/h, événements détaillés avec actions (Fiche, Email).
- **Vue liste** : groupé par mois, cliquable.

Boutons : ← Préc. · Aujourd'hui · Suiv. → · Sélecteur Semaine/Jour/Liste.

### 1.13 Messagerie (`view-messagerie`)

Layout 2 colonnes (260px liste + thread).

- Liste : items triés par dernier événement DESC, badges nb emails ✉ + nb notes 📝 + pipeline
- Filtres : Tous / Emails / Notes (`setMsgFilter`)
- Recherche `#msearch`
- Thread : affichage par cards expansibles avec icône par type (✉/📝/🔄/⭐/✅/⚠️). Bouton 📝 Note (`addNoteThread` via `prompt`), ✉ Email, 📋 Fiche.
- Export CSV `exportMsgCSV` : Date, Candidat, Email, Poste, Pipeline, Type, Action, Sujet, Créneaux

### 1.14 Sync Gravity Forms (`view-gf`)

UI (`recrutement.html:548-604`) :
- Périodes (boutons radio) : 🔄 Tout / 📅 Aujourd'hui / 📆 Cette semaine / 🗓 Ce mois / 📁 3 derniers mois / ✏️ Dates libres (date from + date to)
- ID formulaire (défaut 4), Entrées max/page (défaut 200)
- 🔄 Synchroniser (`runGFSync`) → fetch paginé avec stop anticipé si dates antérieures
- 📥 Importer les nouveaux / 🔄 Réimporter tout
- Aperçu 10 premiers candidats avec badge Nouveau/Existant + score auto
- Helpnote CORS plugin
- 📂 Import CSV alternatif sans API : `handleCSVImport(input)` détecte séparateur `;` ou `,`, auto-map headers (prénom/nom/email/tél/poste/ville/dispo)

Algo `runGFSync` (`recrutement.html:4857-4907`) :
- Auth Basic (ck:cs)
- Endpoint `${wpUrl}/wp-json/gf/v2/entries?form_ids[]=${fid}&paging[page_size]=${limit}&paging[current_page]=${page}`
- Pagination jusqu'à `total_count` ou max 25 pages
- Filtre client-side `_gfDateFilter` (l'API GF v2 ne supporte pas `search[start_date]`)
- Mapping `gfMap` extrait 9 champs + 7 jours dispo + URL CV (champ 7 ou alternatives) + âge calculé

### 1.15 Bulk actions (sélection multiple)

Selection bar collée en bas (`#selbar`, `recrutement.html:646-654`), visible si `sel.size > 0` :
- ✉ Envoyer email (bulk) → `openMailModal()`
- 📊 Changer statut → `openStatusModal` puis `applyStatus` (loop `setPipe` sur sélection)
- 🗄 Archiver → `archiveSelected`
- ☑ Tout sélectionner → `selectAll(filtered())`
- ✕ Désélectionner → `clearSel`
- 📥 Export sélection → `exportCSV(true)`

### 1.16 Archives (`view-archives`)

Storage : `localStorage['rh_archived_v1']` (`recrutement.html:4912-5052`).

- Recherche dans archives `#arch-search`
- Compteur + Export archives CSV
- Carte par candidat archivé (avatar gris, opacity .85, hover .95) avec :
  - Date archivage + date inscription
  - Pipeline badge + langues + CV
  - Boutons : ↩ Désarchiver (`unarchiveCand`), 📄 CV, 🗑 Supprimer définitivement (`deleteArchived` — supprime aussi historique)
- `archiveCand(id)` confirme, marque `archived:true + archivedAt`, retire de `cands`, ajoute à archives, log historique
- Restauration via input file pour backup .json

### 1.17 History / Audit log

`addH(id, type, action, detail, extra)` (`recrutement.html:1454-1458`) — préfixe `h[id]` array, `unshift` (newest first).

Types : `email`, `status`, `note`, `eval`, `check`, `error`.

Champs `extra` typiques : `{template, subject, sentAt, dates, times}` pour emails.

Persistance : `localStorage['rh_hist_v1']` + sauvegarde double dans IndexedDB (DB `CaftanRH_DB` v1, store `data`, key `rh_history`).

### 1.18 Backup/Restore + Persistance ultra-robuste

`backupData()` exporte JSON v3 (cands, pipeline, history, templates, total, at).

`masterSave()` (`recrutement.html:4415-4433`) :
- Triple sauvegarde : localStorage + IndexedDB + meta `rh_last_save`
- Auto-save toutes les 2 minutes (`startAutoSave`)
- `beforeunload` : sauvegarde + auto-backup `rh_auto_backup` si historique non vide

`masterLoad()` choisit la meilleure source (localStorage vs IDB) par timestamp. `checkIntegrity()` au démarrage : si <90% des candidats attendus, recover depuis IDB.

### 1.19 Export Excel / CSV

- `exportXLSX()` : génère TSV avec BOM UTF-8 + extension `.xlsx` (compatible Excel/Numbers/LibreOffice). 20 colonnes incluant détectedLangs, score, statut, priorité, notes
- `exportCSV(selOnly, archivesOnly)` : 18 colonnes, séparateur `;`, BOM UTF-8
- `exportCSVMac` : variante avec `\r\n`
- `exportMsgCSV` : export messagerie

### 1.20 Formulaire candidat en ligne (lien unique JSONBin)

Workflow (`recrutement.html:1820-2028`) :
1. RH clique "📋 Formulaire" sur fiche → confirme
2. `createCandidateBin(c)` POST sur `https://api.jsonbin.io/v3/b` avec X-Master-Key + headers `X-Bin-Name: CaftanRH-{id}-{timestamp}` + `X-Bin-Private: false`. Payload contient toutes les données connues + `_formComplete: false`
3. `c.adminData.formBinId = binId` + `formSentAt`, sauvegarde immédiate
4. Construction URL : `${baseUrl}?bin=${binId}&cid=${id}&key=${key}&cloud=...&preset=...`
5. Email envoyé avec lien stylé + bouton CTA + lien direct copyable
6. Pipeline → `contact` ("Formulaire envoyé")
7. `startPollingCandidate(id, binId)` lance interval 90s + premier check à 5s
8. `pollCandidate` : GET `https://api.jsonbin.io/v3/b/${binId}/latest` ; si `data._formComplete` → merge des champs (firstname, lastname, email, phone, birthdate, dispo, nbJours, worktime, availableFrom, contractType, cv, adminData, langs, langLevels, message), recalcul score, ajout historique, notif visuelle 8s, toast, récap RH
9. `resumePolling()` au boot relance les polls non terminés

### 1.21 Toutes les fonctions JS notables

(Liste exhaustive — extraite via grep `^function`/`^async function` sur `recrutement.html`)

| Fonction | Rôle 1-ligne |
|---|---|
| `ejsInit` | Charge dynamiquement EmailJS depuis CDN et init |
| `ejsSend` | Envoi email via EmailJS service `service_of648pl` template `template_caftan` |
| `calcSlot(start,k,dur)` | Calcule créneau séquentiel pour RDV bulk |
| `fmtDate(iso)` | Formatage date `fr-BE` weekday + day + month + year |
| `ldTmplEdits/svTmplEdits` | Lit/écrit `caftan_templates_v1` |
| `sig()` | HTML signature email Caftan |
| `loadD/saveD` | Charge/sauvegarde candidats (saveD délègue à masterSave) |
| `getP/setP` | Read/write `rh_pipe_v1` |
| `addH` | Ajoute événement historique |
| `setPipe` | Change stage + log historique |
| `calcProximite` | Score géo /15 selon GEO 4 zones |
| `scoreDispo/scoreFlex/scoreAge/scorePoste/scoreDossier/scoreLangues` | Sous-scores |
| `detectGender` | Détecte F/M depuis prénom |
| `genAlertes/genRecommandation` | Génère listes alertes + reco finale |
| `calcScore` | Score /100 final + détails dans `c.scoreDetails` |
| `scColor/scoreLabel` | Mapping couleur + label texte |
| `getJsonbinKey/getFormBaseUrl` | Lecture settings |
| `createCandidateBin` | POST JSONBin v3 |
| `getCandidateFormUrl` | Construit URL avec params |
| `sendFormLink` | Workflow complet : bin + email + polling |
| `startPollingCandidate/pollCandidate/resumePolling/pollNow` | Système polling JSONBin |
| `copyFormLinkById/testFormLink/copyFormLink` | Helpers UX lien |
| `gfVal/gfCvUrl/gfMap` | Mapping entrée GF → candidat interne |
| `runGFSync` | Sync GF avec pagination + filtre date |
| `gfStatus/showGFPreview` | UI status GF |
| `importAll` | Importe candidats GF (force=true pour upsert) |
| `handleCSVImport/parseCSV` | Import CSV alternatif |
| `filtered/filtered_base` | Pipeline filtres (avec/sans smart filters) |
| `render/renderStats/renderCards` | Rendu liste |
| `buildPosteFilter` | Auto-build select postes depuis cands |
| `setPipeFilter/setSort` | Filter + tri |
| `openCand` | Ouvre fiche candidat avec tous les panneaux dynamiques |
| `igrid` | Helper pour grid info candidat |
| `adminField/saveAdminField` | Champ édition admin (NRN, IBAN, etc.) |
| `toggleChkId` | Toggle item checklist |
| `addUnavail/removeUnavail` | Indisponibilités programmées |
| `renderHist/renderStars` | Rendu historique + étoiles |
| `setStage/setStageAndClose/quickPipe` | Variantes change stage |
| `sendDossierRequest/buildDossierBody` | Email dossier pré-rempli HTML riche |
| `setRating/setEval` | Rating manager + scores critères |
| `toggleCandLang/renderCandLangBtns` | Boutons FR/AR/NL/EN/ES/IT/TR/PT/DE |
| `toggleChk/updField/addNote` | Helpers fiche |
| `convertToGP` | Transfert vers GestiPlanning via localStorage |
| `openMailModal/openMailFor/populateMail/onTmplSel/previewMail/toggleSeq/sendMails/sendRHRecap` | Modale envoi email + récap RH |
| `toggleSel/selectAll/clearSel/updateSelBar` | Sélection multiple |
| `openStatusModal/applyStatus` | Bulk change status |
| `openAddModal/saveNewCand` | Création candidat manuel |
| `exportCSV/exportXLSX/_exportCSVExcel/exportCSVMac` | Exports |
| `renderMsgList/openThread/addNoteThread/setMsgFilter/exportMsgCSV` | Messagerie |
| `renderTmpls/exBody/togTmpl/onTI/prevTmpl/rstTmpl/resetAllTmpls` | Éditeur templates |
| `backupData/restoreData` | JSON backup |
| `openOv/closeOv/showView/toast` | UI helpers |
| `openDrawer/closeDrawer/toggleSmartFilter/sfToggle/sfNbj/sfSetRating/sfState/sfHasFilters/sfLive/sfUpdateCount/resetSmartFilter/resetAllFilters/applySmartFilters` | Smart filter drawer |
| `getAgRDVs/parseAgDate/getWeekStart/agToday/agMove/setAgView/renderAgenda/renderAgWeek/renderAgDay/renderAgList/agClickRDV` | Agenda |
| `initIDB/idbSave/idbGet/masterSave/masterLoad/saveHistory/loadHistory/showSaveIndicator/startAutoSave/checkIntegrity/getH/setH` | Persistance ultra-robuste |
| `loadSettings/applySettings/saveSettings/readSettingsForm/populateSettingsForm/renderRHEmails/addRHEmail/removeRHEmail/testEmailJS/exportSettings/importSettings/resetSettings/getRHEmails` | Paramètres |
| `setGFPeriod/_weekStart/_weekEnd/_gfGetDateRange/_gfDateFilter` | Périodes GF |
| `getArchived/saveArchived/archiveCand/archiveSelected/unarchiveCand/deleteArchived/updateArchiveBadge/renderArchives` | Archives |

### 1.22 Edge cases / règles métier détectées

- **Plan Activa Bruxelles** : template `invite_activa` avec mention attestation Actiris + relevé de situation
- **NRN format** belge `XX.XX.XX-XXX.XX` (11 chiffres, date naissance + séquence + clé) — mentionné dans formulaire et templates
- **IBAN Belge** placeholder `BE00 0000 0000 0000`
- **Distance domicile-travail** demandée en km (transport)
- **Période d'essai** dans la checklist
- **Hypothèse FR+AR par défaut** : `cfg.assumeFranco = true` → si aucune langue saisie, le scoring suppose franco-arabophone
- **Samedi = jour de pointe** : bonus +2 dans `scoreDispo`, alerte "✅ Samedi disponible — jour de pointe boutique mode"
- **France = mobilité impossible** : score capé à 10, recommandation auto = REFUSER
- **Mineur (<18)** : score 0 immédiat (-999), label "🚫 Mineur ⛔"
- **Dossier "complet"** : email pré-rempli avec coches ✅ pour données connues et ⚠️ "À compléter" en rouge sinon
- **Auto-pipeline** : envoi `invite/relance` → contact, `confirm_rdv` → rdv, `hired` → hired, etc.
- **Records max** : 25 dernières entrées dans timeline, 50 au max dans historique affiché messagerie

---

## 2. planning-employes.html (GestiPlanning)

### 2.1 Sites/locations (6 sites A-F)

`SITES` (`planning-employes.html:1717-1724`) :
| ID | Nom | Ville | Adresse | Couleur | Light |
|---|---|---|---|---|---|
| A | A Brabant | Bruxelles | Rue de Brabant 230, 1030 Schaerbeek | #2d5be3 | #eef1fd |
| B | B Ransfort | Bruxelles | Rue Ransfort 67, 1080 Molenbeek | #16a34a | #dcfce7 |
| C | C Antw | Anvers | Lange Kievitstraat 64, 2018 Antwerpen | #7c3aed | #f3e8ff |
| D | D Brabant | Bruxelles | Bruxelles (entrepôt) | #ea580c | #ffedd5 |
| E | E Molenb | Bruxelles | Télétravail / Mobile | #0891b2 | #cffafe |
| F | F Antw | Anvers | Déplacements Belgique | #be185d | #fce7f3 |

Aliases legacy : `SCH=A`, `MOL=B`, `ANT=C`.

### 2.2 Comptes hardcodés (3)

`DEFAULT_PROFILES` (`planning-employes.html:7870-7874`) :
- `admin` — Karim · `pin:'0000'` · couleur bleue
- `manager` — Manager · `pin:'1111'` · couleur verte
- `viewer` — Lecteur · `pin:'2222'` · couleur violette

`canEdit()` : admin OU manager. `isAdmin()` : admin uniquement.

### 2.3 Employés pré-chargés (15)

`employees` (`planning-employes.html:8264-8285`) :

**Étudiantes** (`status:'Etudiant'`, `pause:15`, `regime:'week'` sauf indiqué) :
1. **Ibtissem Benoukhita** : 30h `regime:'month'`, `wdMode:'3'`, **`weekCycle:2, weekPhase:0`** = "30h par mois - 1 semaine sur 2", site défaut A, sites [A,B], début 2024-09-01
2. Aya Baroudi : 20h, wdMode auto, site A, sites [A,B]
3. Hafsa Imachaal : 18h, site A, sites [A,B]
4. Yasmine Benazzouz : 20h, site B, sites [B,A]
5. Salima Alaoui : 20h, site B, sites [B,A]
6. Souad El Aissaouy : 24h, site A, sites [A,B]
7. **Ali El Habil Addas** : 16h, wdMode 4, **`hoursYearBudget:650`**, site B, sites [B,D], début 2025-01-01
8. Chaimae Rais : 20h, site A, sites [A,B], début 2025-01-01
9. Hidaya Elbazi : 24h, site B, sites [B,A]
10. Salmane Elbazi : 20h, site A, sites [A,B]

**CDI** (`status:'CDI'`, `pause:30`) :
11. **Ramdane Malha** : 24h, `startTime:'12:00'`, wdMode 4, note `Commence le mercredi a 12h - conge vendredi`, site B, sites [B,D]
12. **Omaima Ouahi** : 40h, `startTime:'12:00'`, wdMode 6, note `Commence le dimanche a 12h - conge lundi`, site A
13. Ilham Serghini : 18h, wdMode auto, site A, sites [A,B]
14. Keltoum El Mrabet : 14h, wdMode 2, site B, sites [B,A]
15. Kaouthar Sebab : 18h, wdMode auto, site A, sites [A,B]

`mkEmp` factory (`planning-employes.html:8201-8257`) initialise tous les champs : firstname/lastname, role, status, startDate/endDate, identité étendue (birthdate, birthcity, civil, family, phone, email), adresse (street, zip, city), légal (nrn, iban), transport (transport, transportCost, transportFreq, distance), incitation (activa), planning (hours/hoursRaw, regime, startTime, endTime, wdMode, pause, prefOff, fixedOff, weekCycle, weekPhase, weekHoursOverride, weeks, hoursConsumedYear, **hoursYearBudget:650** par défaut), RH qualitatif (motivation 1-5, constraints, polyvalence, languages, note), sites + workerPin + workerAvailability, availability (preferred, unavail, defaultSite), hoursMaxMonth + allowOvertime, **grade** ('directeur'|'manager'|'senior'|'vendeur'|'junior'|'stagiaire'), anciennete, **profilIntegration** ('natif'|'arrivant'|'nouvel_arrivant'), restDays + restDaysLocked.

`STATUS_COLORS` (`planning-employes.html:1676-1685`) : 8 statuts colorés (CDI, CDD, Etudiant, Interim, Stage, Independant, Flexi, Volontaire).

### 2.4 Algorithme génération planning (très riche)

Constantes :
- `SHIFTS` : 7 shifts prédéfinis (10:15-20:00 pause 30, 10:30-19:45, 11:00-19:45, 10:00-15:15, 14:30-19:30, 12:30-17:15, 14:00-19:15)
- `START_TIMES` : créneaux toutes les 15 min de 10h à 20h
- `PAUSE_LABELS` : 0 / 15 / 30 / 45 / 60 min
- `STORE_NEEDS` (`planning-employes.html:1927-1991`) : besoins par site et jour. Structure `{[siteId]:{[dow:0-6]:[{debut, fin, vendeurs, role, _venFreMatin?, _venFreAprem?}]}}` — **horaires officiels par site** :
  - A : 7j/7 10h-20h, jour férié spécial, vendredi split matin/aprem
  - B : Lun-Ven 10h30-19h30, Sam+Dim 10h-20h
  - C : 7j/7 10h-19h
  - D (entrepôt) : Lun-Ven 10h30-19h30, Sam+Dim 10h-20h, role `Logistique`
  - E (Online) : Lun-Ven 10h-19h30, Sam+Dim 10h-20h, role `Online`
  - F : 7j/7 10h30-18h45
- `JOURS_FERIES` : Belges fixes (1/1, 1/5, 21/7, 15/8, 1/11, 11/11, 25/12) + mobiles approx (1/4, 21/4, 9/5, 19/6) + internationaux (21/6, 31/10, 14/2, 8/3, 26/12)
- `VACANCES_SCOLAIRES` : Toussaint, Noël, Carnaval, Pâques, Grandes vacances (mi-juil → fin août)

Pause vendredi prière (`FRIDAY_PAUSE_WINTER` 12:55-13:45 / `FRIDAY_PAUSE_SUMMER` 13:55-14:45) — `splitVendrediPause` découpe les créneaux qui chevauchent. Détection auto été/hiver via `isHeureDEte` (dernier dim mars → dernier dim oct).

**Profil affluence pondéré** (`getRushProfile`, `planning-employes.html:1804-1848`) — courbe horaire par segment :
- 10h-12h : ×0.4 (creux matin)
- 12h-13h : ×0.8 (pré-montée)
- 13h-15h : ×1.5 (montée critique)
- 15h-17h : ×3.0 PIC ABSOLU (×3.5 le samedi)
- 17h-picEnd (18h en été ou jour spécial, sinon 17h) : ×2.0
- picEnd-19h : ×1.0
- 19h-20h : ×0.5

Multiplicateur global :
- Samedi : ×1.4
- Férié : ×1.3
- Vacances scolaires/dim : ×1.2
- Période forte (jours 27-31 + 1-10 du mois, règle "27-10") : ×1.15 (configurable via `AUTOPLAN_RULES.periodeForteCoeff` défaut 1.3, max 1.5 pour férié)
- `DATE_COEFFS` : potentiomètre par date spécifique

Algo `matchWorkersToCreneau` (`planning-employes.html:2222-2331`) score par worker :
- Responsable effectif site → +50
- Senior/manager/directeur ≥3 mois ancienneté + responsable absent → +30
- defaultSite → +10, sites list → +6, no site → +3
- Planning existant règle 11 → +20 (conserve start time exact)
- `workerPrefScore` : préférences horaires
- `coverRatio` (workerVal/maxVal × 8) — bonus si présent au pic
- Polyvalence (sites>1) → +1
- Pénalité de charge : >35h/sem (ou 42h pour 6j/7) → -1, >×1.2 → -2
- Pénalité jour repos préféré → -3

`AUTOPLAN_RULES` 11+1 règles activables (`planning-employes.html:2337-2411`) :
1. `priorityDayOrder` : Sam → Fériés → Dim → Semaine
2. `mixProfiles` : équipe ≥2 doit inclure 1 senior (>3 mois) si étudiants
3. `seniorityBalance` : 1 senior par tranche de 2 étudiants
4. `integrationBalance` : mélanger profils intégrés + nouveaux arrivants
5. `gradeBalance` : 1 senior/manager par site si dispo
6. `respectMonthlyMax` : pas dépasser hoursMaxMonth sauf `allowOvertime`
7. `balanceRestDays` : pas 2 collègues off le même jour
8. `fridayContinuity` : équipe matin = priorité l'après-midi vendredi
9. `separateLeaders` : si responsable assigné, seniors vont sur autres sites
10. `minOnePerSite` : minimum 1 worker/site/jour (sinon signalement)
11. `useExistingPlan` : conserver planning mensuel manuel comme base
12. `periodeForteCoeff` (+ value 1.3) : multiplicateur

`canWorkerDoMultiSite` + `COMPATIBLE_SITES` (mapping) gère bascule inter-sites.

Génération propositions : `genPlanningProposals(siteId, weekStart, n=3, msBlockedMap)` — **3 propositions alternatives** par défaut.

`runMultiSiteAutoplan` / `runGlobalAutoplan(dateStart, dateEnd, orderedSites, nbProps)` : auto-plan multi-sites avec drag&drop pour réordonner les sites prioritaires.

### 2.5 UI views et écrans

Views principaux (`planning-employes.html`) :
- Sidebar liste employés (`renderSidebar`) : recherche, filtres, sélection, badges (status, hoursMaxMonth atteint, PIN actif)
- Panel principal employé : `loadPanel`, vue Semaine (drag-edit shifts) + vue Mois (`toggleViewMode`, `renderMonthView`)
- Modaux : Add Employee, Edit Employee, Day Edit, Validation Center, Site View, Worker Portal, Profiles, Sync, Audit, Reset, Rest Days Manager, Store Needs Editor, Store Manager Config, Multi-Site Autoplan, Multi-Site Results, All Sites Overview, Absence Explain, Manual Assign, Eval Modal, Cand modals (GF), Print Modal
- Topbar : sélecteur semaine, undo/redo (Ctrl+Z/Y), 🌙 dark mode (i18n `toggleLang`), 🔄 sync cloud, 📋 audit, badge profil

### 2.6 Vue agenda employé / week view

`renderWeek()` (`planning-employes.html:9313+`) : grille jour × heures. Pour chaque jour :
- Statut (work/repos/conge/maladie/non-defini) cyclable via `cycleStatus(i)`
- Start/Pause/Pause2/End éditables (`setDayStart`, `setDayPause`, `setDayPause2`, `setDayEnd`)
- Calcul net heures (`calcNetHours`) avec déduction pause
- Site assigné (`renderSiteAssignRow`)
- Application shift prédéfini (`applyShift(dayIdx, shiftIdx)`)

Stats hebdo : heures planifiées vs cible (`getWeekHours`), `weekHoursOverride` par semaine, `applyWeekToAll()` propage à toutes les semaines, `undoApplyWeekToAll()` annule.

Vue mois (`renderMonthView`) : calendrier complet, `preFillMonthFromPrefs(e, year, month, overwrite)`, `clearMonthPlan()`, `saveMonthTemplate/applyMonthTemplate/deleteMonthTemplate` (clé `gp_month_templates`).

### 2.7 Time off / congés

- `plannedLeaves[]` : congés prévus `{start, end}` (`addPlannedLeave`, `removePlannedLeave`)
- Statut journée : `repos`, `conge`, `maladie`, `non-defini`, `work`
- `syncUnavailabilities(e)` : merge depuis fiche RH

### 2.8 Stats / dashboards

- `calcMonthPlannedHours/getMonthBudget/calcMonthRemaining` : suivi heures/mois
- `calcYearRemaining` (étudiants) : `YEARLY_BUDGET = 650` heures/an
- `isWeekEmpty/isActiveWeek` : helpers
- `calcMonthRanking(year, month)` : classement mensuel (employee scoring)
- `getEmpScore(empId)` : score employé global
- `openEvalModal/removeEvalEntry` : éval employé (clé `gp_evaluations`)

### 2.9 Backup / Sync (JSONBin)

- Clé `gp_sync_config` : `{masterKey, binId, lastSync}`
- Master key par défaut hardcoded : `$2a$10$F5WDFMcJ45ylysiNzaHp1ugrTiicbN38mz...`
- `cloudPush` : PUT `https://api.jsonbin.io/v3/b/${binId}` avec `record:{...payload, lastModified}`
- `cloudPull` : GET avec `?meta=false`
- `_lastKnownModified` pour éviter pull redondant
- Partage multi-PC via URL `?bid=xxx`
- `buildStatePayload/applyStatePayload` : sérialisation
- `scheduleSyncPush` : debounce push
- `_setSyncStatus` : indicateur visuel (local/syncing/ok/error)

### 2.10 Worker Portal (espace travailleur)

`openWorkerPortal()` → écran login PIN à 4 chiffres → match dans `employees[*].workerPin`.

Onglets travailleur (`workerTab`) :
- Mon planning (`renderWorkerPlanning`) — semaine courante
- Mes disponibilités (`renderWorkerAvail`) — `waToggleAll`/`waUpdateAll` par jour
- Demandes de changement (`renderWorkerChanges` / `saveWorkerChanges`)

Notifications (`updateNotifBadge`, `openNotifCenter`) : pending changes, dispos modifiées, demandes traitées (`renderNotifPending/renderNotifAvail/renderNotifDone`, `markChangeStatus`).

### 2.11 Audit / Historique / Undo-Redo

- `auditLog(action, empId, empName, dateStr, before, after, source)` clé `gp_audit` (max 500 entrées)
- Sources : `auto` 🤖 / `manual` ✏️ / `worker` 👤 / `reset` 🔄
- `autoPlanHistorySave/Restore` : 5 snapshots max (`gp_autoplan_history`)
- `histPush/histUndo/histRedo` : undo/redo 50 états (Ctrl+Z/Y)
- `openAuditPanel` : panneau combiné historique + log

### 2.12 Reset planning

`openResetPanel/executeReset` : reset par plage dates × sites (checkbox multi) × type (auto seulement / tout).

### 2.13 Bulk mode (édition masse)

- `_bulkMode` toggle, `_bulkSelected` Set
- `bulkArchive`, `bulkDelete`, `openBulkEdit` : édit en masse `key, type, opts` (ex: `availability.defaultSite`, `wdMode`, `pause`, etc.)
- `applyBulkEdit` applique sur tous sélectionnés

### 2.14 Store needs editor (besoins boutique)

- `openStoreNeedsEditor`, `openStoreNeedsExceptions(siteId)` : exceptions par date
- `STORE_NEEDS_EXCEPTIONS` clé `gp_store_needs_exceptions`
- `bulkCopyDay`, `bulkCopySite`, `bulkSetVendeurs`, `resetStoreNeeds`
- `renderSlotsForDay/updateSlot/addSlot/removeSlot` : édition créneaux par jour
- `openDateCoeffManager` : potentiomètre coefficient par date

### 2.15 Store managers (responsables sites)

- `storeManagers` clé `gp_store_managers` : mapping `{siteId: empId}`
- `getEffectiveManager(siteId)` : récupère le manager (ou senior remplaçant si manager absent)
- `openStoreManagerConfig`, `setStoreManager(siteId, empId)`

### 2.16 GF integration (rare — secondaire à recrutement.html)

`GF_FIELD_TARGETS` : 14 champs (firstname, lastname, email, phone, role, city, zip, contractType, worktime, exp, skills, availableFrom, note, transport).

Note : **mapping différent de recrutement.html** ! Ici `email=3, phone=4, role=5, ville=6, zip=7, contractType=8` etc. À harmoniser dans la nouvelle plateforme.

`computeCandScore(c)` : barème /100 différent (exp×5 cap 25, availableFrom 10, langs ×5, role retail 15, contact complet 10, ville Bxl 10, contractType Etudiant/CDD +5, note longue +5).

### 2.17 Authentification + Profils utilisateurs

- `_loginProfileId, _pinBuffer`, `pinKey(k)` (digit input), `updatePinDots`
- `renderProfileSelector` (cards initiales), `selectProfile(id)`, `cancelProfileSelect`
- `doLogin` → `completeLogin` : appliquer permissions, masquer login screen
- `openProfileSwitch` : changer de profil
- `renderProfilesPanel/saveProfile/editProfile/deleteProfile/clearProfileForm` : CRUD profils
- `applyProfilePermissions` : grise les boutons selon role
- `updateProfileBadge` : badge actif

### 2.18 Internationalisation

`TRANSLATIONS` (`planning-employes.html:1469+`) : FR + NL — `toggleLang()`, `applyI18n()`, `t(key)`. Couvre la majorité des labels UI.

### 2.19 Export PDF

`exportPDF/exportPDFWeeks(totalWeeks)` (`planning-employes.html:10177+`) : génère 1/2/3 semaines en PDF avec couleurs par semaine (`WEEK_COLORS_PDF` : bleu/vert/violet). `printGlobalView`, `printSiteRecap`. Modal `openPrintModal/getPrintWeeksChoice`.

### 2.20 Validation Center

`openValidationCenter`, `validateDay(empIdx, wOff, di, approved)` : workflow validation manager (refus/accept des changements proposés par worker).

### 2.21 Site View / Vue site

`openSiteView`, `renderSiteModal`, `setSiteTab(id)`, `renderSiteContent`, `changeSiteWeek(dir)` : vue centrée sur un site avec planning de tous ses workers.

### 2.22 Edge cases / règles métier détectées

- **Étudiant** : `YEARLY_BUDGET = 650h/an` par défaut, `hoursYearBudget` par employé
- **Cycle 1 sem sur 2** : Ibtissem Benoukhita (`weekCycle:2, weekPhase:0`)
- **Ramdane Malha** : "Commence mercredi 12h, congé vendredi" — `startTime:'12:00'`, wdMode 4
- **Omaima Ouahi** : "Commence dimanche 12h, congé lundi" — `startTime:'12:00'`, wdMode 6
- **Ali El Habil Addas** : `hoursYearBudget:650` explicite
- **Pause vendredi prière** auto-détectée (été/hiver) avec `splitVendrediPause`
- **Période forte 27-10 du mois** : multiplicateur ×1.15 par défaut
- **Vacances scolaires belges** : Toussaint, Noël (chevauchement année), Carnaval, Pâques, Grandes vacances → considérées comme jour spécial
- **Heure d'été belge** : pic étendu jusqu'à 18h au lieu de 17h
- **Samedi = pic ×3.5** (vs ×3.0 jours normaux)
- **CDI/CDD ≥12 mois ancienneté → 6j/7 autorisé** (vs 35h/5j sinon)
- **Dimona/ONSS** mentionnés dans la checklist mais pas automatisé
- **Polyvalence multi-sites** : `COMPATIBLE_SITES` mapping, bonus +1 dans scoring
- **Profil intégration** : `natif`/`arrivant`/`nouvel_arrivant` impacte règle d'équilibrage équipe
- **PIN admin par défaut 0000** : warning console au boot
- **Transfert RH→GestiPlanning** via `localStorage['gp_transfer_candidate']` (récupéré par `checkRHTransfer`)
- **Drag & drop reordering** des sites dans Multi-Site Autoplan (`initMultiSiteDragSort`, `getDragAfterElement`, `updateMsOrder`)
- **Distribuer les pauses déjeuner** : `distributeLunchBreaks(siteId, dateStr, workingEmps)` répartit les pauses pour toujours avoir du monde au comptoir

---

## 3. formulaire-candidat.html (Formulaire public lien unique)

### 3.1 Structure et init

- URL params : `?bin=XXX` (JSONBin id), `?cid=XXX` (candidate id), `?key=XXX` (master key), `?cloud=XXX&preset=XXX` (Cloudinary)
- Au load : `loadFromBin()` → pré-remplit, sinon affiche banner d'erreur "Lien invalide ou expiré"
- Defaults hardcoded : `JSONBIN_KEY: '$2a$10$F5WDFMcJ45ylysiNzaHp1ugrTiicbN38mz...'`, `CLOUDINARY: {cloudName:'drzkhse8u', uploadPreset:'caftan_rh'}`
- Header sticky : logo + barre de progression dynamique (`updateProgress`)
- 7 sections accordion (toggle indépendant)

### 3.2 Sections (7)

1. **🪪 Identification** (open par défaut) :
   - `f-firstname`, `f-lastname`, `f-email`, `f-phone`, `f-birthdate` (pré-remplis ✓)
   - `f-birthcity` (Lieu de naissance) — req
   - `f-nationality` — req
   - `f-nrn` (NRN) — req, format `XX.XX.XX-XXX.XX`, maxlength 15, formaté via `formatNRN` (auto-points/tirets)
   - `f-address` — req

2. **💳 Coordonnées bancaires** :
   - `f-iban` — req, format `BE00 0000 0000 0000`, maxlength 20, formaté via `formatIBAN` (auto-espaces)
   - `f-iban-name` — Titulaire

3. **🚇 Transport** :
   - `f-transport-type` (select : STIB/SNCB/TEC/De Lijn/Voiture/Vélo/À pied/Combo)
   - `f-transport-name` (nom abonnement)
   - `f-transport-price` (prix)
   - `f-transport-km` (distance)

4. **📅 Disponibilités** :
   - 7 boutons jours (Lun-Dim) toggleables (`toggleDay`)
   - `f-worktime` select : "Toute la journée 10h→20h ← Idéal boutique" (premier choix), Matin uniquement, Après-midi, Temps plein flexible, Temps partiel flexible, Étudiant
   - `f-available-from` (date)
   - `f-contract` select : CDD, CDI, Contrat étudiant, Flexi-job, Intérim, Les deux
   - `f-unavail` textarea (vacances, examens, Ramadan)

5. **🗣 Langues parlées** : 8 langues × 4 niveaux (Débutant/Intermédiaire/Courant/Langue maternelle) — `LANGS = [FR, AR, NL, EN, ES, IT, TR, PT]` avec FR+AR essentiels. `setLangLevel(code, level, btn)` stocke dans `langValues`.

6. **📎 Documents** : 4 zones d'upload Cloudinary (`uploadFile` POST `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`) avec `uploadPreset` :
   - 📄 CV (req) : PDF/Word/image, max 10 Mo
   - 🪪 CIN recto/verso (req)
   - 📸 Photo (opt)
   - 📋 Autre document (opt)
   - Drag&drop, progress bar, états idle/progress/done, remove
   - URLs dans `uploads = {cv:'...', cin:'...', photo:'...', other:'...'}`

7. **💬 Message libre** : textarea optionnelle

### 3.3 Système de progress

- `calcProgress()` : pourcentage requis
- `updateProgress()` : barre colorée
- `updateBadges()` : badge par section (done/partial/missing)

### 3.4 Auto-save

- `autoSaveDebounced` : debounce 2.5s sur input
- `startAutosave` : interval 60s
- `autoSave` : POST/PUT JSONBin avec `_formComplete: false`

### 3.5 Soumission

`submitForm()` :
1. `collectFormData()` : agrège tous les champs + `_formComplete: true` + `submittedAt`
2. `saveToBin(data)` PUT JSONBin
3. Affiche `success-screen` avec greeting + nom

### 3.6 UX details

- Banner pré-rempli ✓ (vert) si données déjà connues (`f.classList.add('prefilled')`)
- Banner status (warn/ok/error) selon état du bin
- Greeting "Bonjour {firstname}" personnalisé
- Mobile-first : viewport-fit, apple-mobile-web-app, autocomplete, font-size 16px+ pour iOS
- Fonts : Cormorant Garamond + DM Sans + DM Mono (IBAN/NRN)
- Couleurs : noir + or `#c8a96e`/`#a07840` (Caftan Factory branding)

---

## 4. a effacer.html

Diff avec `formulaire-candidat.html` (analyse) : différences mineures (~21 lignes de diff sur 1250). Probablement une version antérieure à la dernière itération du formulaire — **aucune fonctionnalité unique manquante** détectée. Fichier à supprimer dans la nouvelle plateforme (le nom même indique "à effacer").

---

## 5. caftan-rh-complet_105.zip

Contenu après extraction sur `C:\Users\KElba\AppData\Local\Temp\caftanrh-extract` :

| Fichier | Taille zip | Différence vs racine |
|---|---|---|
| `formulaire-candidat.html` | 57 166 B | -1 256 B vs 58 422 B (légèrement plus ancien) |
| `index.html` | 219 B | -11 B (page racine GitHub Pages — redirige vers recrutement) |
| `planning-employes.html` | 650 638 B | -39 170 B (ancienne version, manque les derniers ajouts dont validation center/audit récents) |
| `recrutement.html` | 296 936 B | -5 228 B (ancienne version) |

**Aucun fichier nouveau** dans le zip — c'est juste un snapshot de packaging. Pas de JSON/JS séparés. À ignorer pour la migration.

---

## 6. Comparaison avec la nouvelle plateforme `caftan-rh/src`

### 6.1 Présent dans l'ancien, ABSENT dans la nouvelle (À RESTITUER) — PRIORITAIRE

1. **Smart Filter drawer ultra-riche** (langues × jours × score × proximité × profil × genre × note manager × dispo rapide) — la nouvelle a une `candidates-table` simple avec status/jobs filters. → **Bloc UX critique pour le RH**.
2. **Score breakdown détaillé** : 7 barres de score (Disponibilité, Flexibilité, Proximité, Adéquation poste, Dossier, Âge, Langues) + Recommandation auto + Alertes pos/warn/neg. La nouvelle a `computeCandidateScore` simple (40 complétude / 10 motivation / 15 dispo / 15 langues / 10 CV) sans détail visible.
3. **Détection genre** depuis prénom (`PRENOMS_F/M` 150+ entrées)
4. **Hypothèse FR+AR par défaut** (`assumeFranco`) — pas implémentée
5. **Plan Activa Bruxelles** : template dédié + mention dans recommandations
6. **Templates 9 emails complets** avec dates/heures variables et auto-pipeline. La nouvelle a `email-templates.ts` minimaliste avec `{{firstname}}` Mustache et 4 emails (acknowledgement/invite/reject/offer).
7. **RDV séquentiels** (1 candidat = 1 créneau auto, durée par candidat)
8. **Récap RH automatique** après chaque envoi (agenda tabulaire si séquentiel)
9. **Multi-destinataires RH** récap (tags configurables)
10. **Formulaire candidat lien unique** (JSONBin + Cloudinary + polling 90s) → **toute cette UX manque**
11. **Dossier complet pré-rempli** : email HTML riche avec ✅/⚠️ par champ
12. **Checklist intelligente 5 catégories × 21 items** (avec types : checkbox/input/file)
13. **Indisponibilités programmées** par candidat (label + from + to)
14. **9 langues parlées** (FR/AR/NL/EN/ES/IT/TR/PT/DE) avec boutons toggle ; nouvelle DB a `langs jsonb` mais pas l'UI complète
15. **Agenda RDV 3 vues** (semaine/jour/liste) avec extraction depuis emails envoyés
16. **Archives** complètes avec restore/delete
17. **Bulk : email + status + archive + select all + export selection** (la nouvelle a `bulk` partiel)
18. **Sync GF avec périodes** (Aujourd'hui/Semaine/Mois/3 mois/Custom + stop anticipé pagination)
19. **Import CSV alternatif** sans API GF
20. **Persistance triple** (localStorage + IndexedDB + auto-backup beforeunload)
21. **Export Excel/XLSX** (TSV BOM)

**GestiPlanning** :
22. **Worker Portal PIN** (espace travailleur avec planning + dispos + demandes changement)
23. **Algorithme planning ultra-riche** (11 règles + scoring horaire pondéré + multi-site + 3 propositions) — la nouvelle a `auto-planning.ts` minimaliste (target days × shift hours, pas de scoring rush hours, pas de multi-site, pas de règles)
24. **Vue Mois** + month templates
25. **Validation Center** (workflow approbation modifs worker)
26. **Audit log + autoplan history** (5 snapshots restaurables)
27. **Pause vendredi prière** auto été/hiver
28. **Période forte 27-10 du mois** + vacances scolaires belges + jours fériés
29. **Distribution pauses déjeuner** auto
30. **Compatibilité multi-sites** + drag&drop priorité sites
31. **Store needs editor** (avec exceptions par date)
32. **Store managers** (responsables sites avec promotion auto senior)
33. **Bulk edit employés** (`openBulkEdit` 1 champ × N employés)
34. **Rest days manager** : distribution équilibrée jours repos
35. **Date coefficients** (potentiomètre par date)
36. **Cloud sync JSONBin** avec partage URL `?bid=xxx`
37. **Print PDF** 1/2/3 semaines avec couleurs alternées
38. **Eval modal** (entretiens employé mensuels avec score)
39. **Internationalisation** FR/NL
40. **Undo/Redo Ctrl+Z/Y** sur 50 états

### 6.2 Présent dans l'ancien, AMÉLIORÉ dans la nouvelle

- **Pipeline 7 statuts** : équivalent (renommage `done`→`rdv_done`, `wait`→`wait_decision`)
- **Persistance** : Supabase Realtime > localStorage triple
- **Auth** : Supabase Auth + RLS > 3 PIN hardcoded
- **GF sync** : Cron Vercel toutes les 15 min (`/api/cron/gf-sync`) > sync manuelle
- **Emails** : Resend (managé) > EmailJS (frontend)
- **Multi-tenant** : profiles par utilisateur > localStorage partagé
- **Time clock** mobile prévu (mention README) — pas dans l'ancien
- **Sequences** (séquences emails programmées) : nouvelle a `/rh/sequences` avec cron tick — pas dans l'ancien
- **Onboarding workflow** : nouvelle a `/onboarding` avec templates + détail employé — pas dans l'ancien
- **Scoring équipe** (5 axes auto + manuel) : nouvelle a vue dédiée + cron `/api/cron/scoring-recompute` — l'ancien n'a que `evalScores` 7 critères dans la fiche candidat
- **Payroll export** : nouvelle a `/admin/payroll` CSV pivot — totalement nouveau
- **Activity log centralisé** : `/admin/activity` avec `ACTIVITY_KINDS` + filtres — meilleur que `addH` localStorage

### 6.3 Présent dans l'ancien mais probablement OBSOLÈTE

- `a effacer.html` (le nom est explicite)
- **EmailJS** : la nouvelle utilise Resend côté serveur (mieux). `service_of648pl`, `template_caftan`, `ccnn5U3CXuyX-XJOg` — à supprimer
- **JSONBin formulaire candidat** : la nouvelle utilise Supabase + Storage (mieux). Cloudinary peut être remplacé par Supabase Storage
- **localStorage** comme source de vérité (cands/pipe/hist/templates) : la nouvelle utilise Supabase
- **PIN 4 chiffres hardcodés** (0000/1111/2222) : Supabase Auth (mieux)
- **3 vues agenda redondantes** : la nouvelle a `agenda-grid` — peut-être garder qu'une vue
- **Import CSV manuel** : peut-être obsolète si `/api/cron/gf-sync` couvre tout
- **`exportXLSX` qui génère du TSV trompeur** : la nouvelle peut faire un vrai XLSX avec une lib
- **Settings page complète** : déjà dans `/admin/settings`
- **Champs IBAN/NRN/transport en clair localStorage** : la nouvelle a la table `candidates` avec RLS — bien mieux

---

## 7. Synthèse — TOP 10 features les plus impactantes encore à restituer

Classement par valeur business pour le patron Caftan Factory :

1. **Algorithme génération planning Caftan-spécifique** : profil affluence pondéré (10h-20h × ×0.4-×3.5), multiplicateurs (samedi 1.4×, fériés 1.3×, période 27-10 ×1.15, vacances scolaires belges, heure d'été), 11 règles activables, pause vendredi prière auto été/hiver, 3 propositions alternatives, multi-site avec ordre prioritaire drag-drop. **Sans ça, l'autoplan Next.js actuel est trop naïf** pour les boutiques mode bruxelloises.

2. **Smart Filter drawer + score breakdown détaillé** : RH a besoin de filtrer "candidat femme, FR+AR, ≥4j/sem dont samedi, ≤2km de Schaerbeek, score ≥60, étudiant" en 3 clics. Plus le détail visible des 7 barres de score + recommandation auto + alertes positives/négatives qui guide la décision.

3. **Worker Portal PIN** : chaque employé voit son planning, modifie ses dispos, demande des changements. **Réduit les frictions RH→worker** énormément. PIN à 4 chiffres simple à mémoriser, pas de mot de passe.

4. **Templates emails 9 + récap RH multi-destinataires + RDV séquentiels** : RH peut convoquer 12 candidats à la suite avec créneaux 20 min auto, et reçoit un récap agenda PDF-able. Plan Activa = 1 template dédié = 0 risque d'oublier la mention. **Fait gagner 1h/semaine au RH**.

5. **Formulaire candidat lien unique** (pré-rempli + JSONBin + polling 90s + Cloudinary) : RH envoie 1 lien, candidat complète où il manque, RH reçoit notif visuelle dès soumission. **Workflow IBAN/NRN/CIN sans aller-retour email**. Exigence RGPD : à porter sur Supabase Storage + service role.

6. **Dossier complet pré-rempli** : email HTML riche avec coches ✅ pour ce qu'on sait déjà et ⚠️ pour ce qui manque + boutons WhatsApp + mailto. **Réduit l'effort cognitif candidat** = taux de retour bien meilleur.

7. **Checklist intelligente 5 catégories × 21 items** avec types (checkbox/input/file) et progression colorée : permet au RH de ne pas oublier ONSS/Dimona/uniforme/formation/contrat. Migration en table `onboarding_steps` côté Supabase.

8. **Audit log + autoplan history (5 snapshots restaurables)** : si le manager fait n'importe quoi avec autoplan, on peut restaurer la version précédente en 1 clic. **Filet de sécurité indispensable** pour un cockpit critique.

9. **Plan Activa Bruxelles** : ce n'est PAS un détail. C'est une subvention ~€500/mois × 12 mois × N salariés = des milliers d'€/an. **Le template dédié + alerte automatique dans la fiche** doit absolument être restitué.

10. **Indisponibilités programmées par candidat** (vacances/examens/Ramadan) avec sync vers planning : 1 saisie au recrutement = 1 contrainte respectée 12 mois plus tard dans l'autoplan. **Évite de planifier un étudiant qui a annoncé "examens en juin" en 1ère semaine de juin**. Nécessite jonction Supabase `candidate.unavailable_periods` ↔ `auto-planning`.

---

## Notes de migration

- **Secrets exposés en clair dans les fichiers HTML** (à roter avant déploiement public) :
  - GF Consumer Key/Secret (`ck_25452315496e2565945bb457526f7d392bf13293`, `cs_f4ced7a759662ff35abbddfeb336f5970cd4e7af`)
  - JSONBin Master Key (`$2a$10$F5WDFMcJ45ylysiNzaHp1ugrTiicbN38mz.YET3k.C8sCV46iYLtG`)
  - EmailJS Public Key (`ccnn5U3CXuyX-XJOg`)
  - Cloudinary cloud name `drzkhse8u` + preset `caftan_rh`

- **Adresses email RH par défaut** : `elbazikarim@gmail.com`, `hr@caftanfactory.com`

- **Numéros de téléphone hardcodés** : `+32468596100` / WhatsApp `32468596100`

- **GF Mapping incohérent** entre `recrutement.html` (city=14, role=13) et `planning-employes.html` (role=5, city=6) — la nouvelle plateforme a `gravity-forms.ts` avec `GF_FIELD_TARGETS` à harmoniser.

- **Naming pipeline** : ancien `done` (Entretien fait) ↔ nouveau `rdv_done`. Migration de données : prévoir mapping.

- L'icône utilisée partout dans l'ancien est ☪ (croissant lune) — branding Caftan. Pas dans la nouvelle (probablement intentionnel).
