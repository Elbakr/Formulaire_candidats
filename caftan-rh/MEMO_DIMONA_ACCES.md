# Mémo — Obtenir les 3 accès pour l'auto-Dimona (Web Service REST v2)

**Pour :** Karim Elbazi — AMD MEGASTORE SRL (BCE 0660.936.422, ONSS 100-1471015-66)
**But :** activer l'envoi automatique des déclarations Dimona depuis Caftan HR.
**À prévoir avant de commencer :** ta **carte eID + lecteur** (ou **itsme**), ton **numéro national**, et le fait d'être **représentant légal** de la société (c'est ton cas).

> Ordre imposé : 1 → 2 → 3. Chaque étape débloque la suivante. Compte ~1 à 2 semaines
> au total (délais de validation ONSS/certificat).

---

## Étape 0 — Vérifier le préalable (rapide)
La société doit être **enregistrée comme employeur à l'ONSS** → c'est déjà le cas (tu as un n° ONSS et des fiches de paie). ✅ Rien à faire.

---

## Étape 1 — Te désigner **Gestionnaire d'Accès Principal (GAP)** via CSAM
C'est la clé qui ouvre tout le reste. Le GAP = la personne qui gère les accès numériques de la société.

1. Va sur **CSAM → Gestion des Gestionnaires d'Accès (GGA)** :
   https://www.csam.be/fr/gestion-gestionnaires-acces.html
2. Clique **« Se connecter »** et identifie-toi avec **eID / itsme** (en tant que **représentant légal** d'AMD Megastore).
3. **Désigne le Gestionnaire d'Accès Principal** (toi-même). Prépare :
   - Tes coordonnées : nom, prénom, **n° national**, téléphone.
   - Coordonnées du **responsable** dans la société (toi aussi) : idem.
4. **Active le compte** de la société à la première connexion (signature via eID/itsme).

📄 Guide pas-à-pas officiel : https://www.csam.be/fr/documents/pdf/guide-utilisateur.pdf
ℹ️ Page « Gérer l'accès pour mon entreprise » (sécu sociale) :
https://www.socialsecurity.be/site_fr/employer/infos/secured_access/enterprise_access.htm

> Résultat : tu es GAP → tu peux activer des canaux techniques et créer des accès.

---

## Étape 2 — Activer le **canal REST** + le **certificat** dans Chaman
Une fois GAP :

1. Accède au **portail API de la sécurité sociale** :
   https://apiportal.socialsecurity.be/
2. Ouvre **Chaman** (gestion des canaux) depuis l'accès sécurisé entreprise.
3. **Active le canal « REST »** pour AMD Megastore (c'est le canal de l'API Dimona v2).
4. **Certificat** : suis la procédure Chaman pour associer/obtenir le **certificat entreprise**
   (connexion sécurisée mTLS). Si un certificat technique est requis, Chaman t'indique
   le fournisseur/format ; garde le **fichier certificat + sa clé** en lieu sûr.

📄 Doc REST : https://www.rest-documentation.socialsecurity.be/

> Résultat : le canal REST est ouvert + tu as un certificat.

---

## Étape 3 — Obtenir les **credentials OAuth2** (client id + secret)
1. Toujours sur **https://apiportal.socialsecurity.be/** , enregistre une **application**
   (ton « client ») pour l'API **Dimona v2**.
2. Choisis le flux **OAuth2 « Client Credentials »**.
3. Le portail te fournit un **Client ID** et un **Client Secret**. Note-les précieusement
   (le secret ne se réaffiche pas — traite-le comme un mot de passe).

📄 API Dimona v2 (OpenAPI) : https://www.socialsecurity.be/site_fr/employer/applics/dimona/documents/yaml/openapi_dimona_v2.zip

> Résultat : tu as Client ID + Client Secret + l'URL du serveur OAuth.

---

## Ce que tu m'envoies à la fin (par un canal sûr, PAS par email en clair)
Quand tu as tout, transmets-moi (je les mets en variables d'environnement Vercel, jamais dans le code) :
1. **DIMONA_OAUTH_CLIENT_ID**
2. **DIMONA_OAUTH_CLIENT_SECRET**
3. L'**URL du serveur OAuth** (token) + l'**endpoint Dimona v2** confirmés
4. Le **certificat** (fichier + clé) si mTLS requis

⚠️ **Sécurité** : ne me colle pas le secret/certificat en clair dans le chat. On utilisera
un dépôt sécurisé (ex. tu les mets toi-même dans Vercel → Settings → Environment Variables,
et tu me confirmes juste « c'est fait »). Le certificat/secret ne doit jamais être commité.

## Ensuite (moi)
Je finalise `submitDimonaIn` (token OAuth2 → POST du payload selon l'OpenAPI v2 → mTLS),
je branche un bouton **« Déclarer à l'ONSS »** sur la fiche travailleur, avec **confirmation
1 clic avant chaque envoi** (la validation Dimona reste **humaine**). Tant que ce n'est pas
activé, tu restes en **semi-auto** (portail + « Marquer déclarée »), qui fonctionne déjà.

---
### Récap express
| # | Accès | Où | Tu obtiens |
|---|---|---|---|
| 1 | Gestionnaire d'Accès Principal | CSAM / GGA (eID/itsme) | droit de gérer les accès |
| 2 | Canal REST + certificat | Chaman (portail API) | canal ouvert + certificat |
| 3 | Credentials OAuth2 | Portail API (apiportal) | Client ID + Secret |
