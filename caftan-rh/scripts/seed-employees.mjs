#!/usr/bin/env node
// Seed initial des 15 employés actifs récupérés de planning-employes.html
// + 6 sites/services. Crée pour chaque employé un compte Supabase Auth
// avec mot de passe temporaire et écrit credentials dans employees-credentials.md.

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Sites / départements à créer ──────────────────────────────────────────
const SITES = [
  { code: "A", name: "Boutique A — Brabant", city: "Bruxelles", address: "Rue de Brabant 230, 1030 Schaerbeek" },
  { code: "B", name: "Boutique B — Ransfort", city: "Bruxelles", address: "Rue Ransfort 67, 1080 Molenbeek" },
  { code: "C", name: "Boutique C — Anvers", city: "Anvers", address: "Lange Kievitstraat 64, 2018 Antwerpen" },
  { code: "D", name: "Boutique D — Brabant", city: "Bruxelles", address: "Bruxelles" },
  { code: "E", name: "Mobile / Télétravail", city: "Bruxelles", address: "Télétravail / Mobile" },
  { code: "F", name: "Anvers — Déplacements", city: "Anvers", address: "Déplacements Belgique" },
];

// ─── 15 employés actifs ────────────────────────────────────────────────────
const EMPLOYEES = [
  // Étudiantes
  { firstname: "Ibtissem", lastname: "Benoukhita",   contract: "Étudiant", hours: 30, defaultSite: "A", note: "30h/mois — 1 semaine sur 2", startDate: "2024-09-01" },
  { firstname: "Aya",      lastname: "Baroudi",      contract: "Étudiant", hours: 20, defaultSite: "A", startDate: "2024-09-01" },
  { firstname: "Hafsa",    lastname: "Imachaal",     contract: "Étudiant", hours: 18, defaultSite: "A", startDate: "2024-09-01" },
  { firstname: "Yasmine",  lastname: "Benazzouz",    contract: "Étudiant", hours: 20, defaultSite: "B", startDate: "2024-09-01" },
  { firstname: "Salima",   lastname: "Alaoui",       contract: "Étudiant", hours: 20, defaultSite: "B", startDate: "2024-09-01" },
  { firstname: "Souad",    lastname: "El Aissaouy",  contract: "Étudiant", hours: 24, defaultSite: "A", startDate: "2024-09-01" },
  { firstname: "Ali",      lastname: "El Habil Addas", contract: "Étudiant", hours: 16, defaultSite: "B", startDate: "2025-01-01" },
  { firstname: "Chaimae",  lastname: "Rais",         contract: "Étudiant", hours: 20, defaultSite: "A", startDate: "2025-01-01" },
  { firstname: "Hidaya",   lastname: "Elbazi",       contract: "Étudiant", hours: 24, defaultSite: "B", startDate: "2025-01-01" },
  { firstname: "Salmane",  lastname: "Elbazi",       contract: "Étudiant", hours: 20, defaultSite: "A", startDate: "2025-01-01" },
  // CDI
  { firstname: "Ramdane",  lastname: "Malha",        contract: "CDI", hours: 24, defaultSite: "B", note: "Commence mercredi à 12h — congé vendredi", startDate: "2025-01-01" },
  { firstname: "Omaima",   lastname: "Ouahi",        contract: "CDI", hours: 40, defaultSite: "A", note: "Commence dimanche à 12h — congé lundi", startDate: "2025-01-01" },
  { firstname: "Ilham",    lastname: "Serghini",     contract: "CDI", hours: 18, defaultSite: "A", startDate: "2025-01-01" },
  { firstname: "Keltoum",  lastname: "El Mrabet",    contract: "CDI", hours: 14, defaultSite: "B", startDate: "2025-01-01" },
  { firstname: "Kaouthar", lastname: "Sebab",        contract: "CDI", hours: 18, defaultSite: "A", startDate: "2025-01-01" },
];

const EMAIL_DOMAIN = "caftanrh.example";

function slugify(s) {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function emailFor(emp) {
  return `${slugify(emp.firstname)}.${slugify(emp.lastname)}@${EMAIL_DOMAIN}`;
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz";
function genPassword(len = 12) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}

async function ensureDepartments() {
  console.log("→ Sites/départements...");
  const idByCode = new Map();
  for (const site of SITES) {
    const { data: existing } = await supabase
      .from("departments")
      .select("id")
      .eq("name", site.name)
      .maybeSingle();
    if (existing?.id) {
      idByCode.set(site.code, existing.id);
      console.log(`  · ${site.name} déjà présent`);
      continue;
    }
    const { data: created, error } = await supabase
      .from("departments")
      .insert({ name: site.name })
      .select("id")
      .single();
    if (error) { console.error(`  ✗ ${site.name}:`, error.message); continue; }
    idByCode.set(site.code, created.id);
    console.log(`  ✓ ${site.name} créé`);
  }
  return idByCode;
}

async function findUserByEmail(email) {
  // listUsers returns paginated; iterate
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureEmployee(emp, deptId) {
  const email = emailFor(emp);
  const fullName = `${emp.firstname} ${emp.lastname}`;
  let password = null;
  let status = "existed";

  // Auth user
  let user = await findUserByEmail(email);
  if (!user) {
    password = genPassword(12);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      console.error(`  ✗ ${fullName}: auth ${error.message}`);
      return null;
    }
    user = data.user;
    status = "created";
  }

  // Employees row (insert if not exists for this profile)
  const { data: existing } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("employees").insert({
      profile_id: user.id,
      email,
      full_name: fullName,
      job_title: emp.contract === "CDI" ? "Vendeur·se" : "Étudiant·e — Vendeur·se",
      contract_type: emp.contract,
      weekly_hours: emp.hours,
      department_id: deptId,
      start_date: emp.startDate,
      notes: emp.note ?? null,
      status: "active",
    });
    if (error) {
      console.error(`  ✗ ${fullName}: employees ${error.message}`);
      return null;
    }
  }

  console.log(`  ${status === "created" ? "✓" : "·"} ${fullName} (${email}) ${status}`);
  return { fullName, email, password, status, contract: emp.contract, hours: emp.hours };
}

async function main() {
  const idByCode = await ensureDepartments();

  console.log("\n→ Employés (création + comptes Auth)...");
  const results = [];
  for (const emp of EMPLOYEES) {
    const r = await ensureEmployee(emp, idByCode.get(emp.defaultSite) ?? null);
    if (r) results.push(r);
  }

  // Generate credentials report (only newly created)
  const newOnes = results.filter((r) => r.status === "created");
  const md = renderCredentialsMarkdown(results, newOnes);
  const outPath = resolve(__dirname, "../employees-credentials.md");
  await writeFile(outPath, md, "utf8");

  console.log("");
  console.log(`Done. ${newOnes.length} comptes créés / ${results.length - newOnes.length} déjà présents.`);
  console.log(`Credentials → ${outPath}`);
}

function renderCredentialsMarkdown(all, created) {
  const today = new Date().toISOString().split("T")[0];
  return `# CaftanRH — Comptes employés (généré le ${today})

> ⚠️ Ce fichier est **NON committé sur git** (ignoré). Il contient les mots de passe temporaires en clair. Communique-les individuellement aux employés et **demande-leur de les changer** à la première connexion.

## Comment se connecter

1. Va sur le site CaftanRH
2. Clique **Se connecter**
3. Saisis ton email + mot de passe ci-dessous
4. Tu seras redirigé vers ton espace personnel (\`/me\`) où tu pourras :
   - Voir tes shifts (Mon planning)
   - Demander des congés
   - Mettre à jour ton profil et ton mot de passe (à venir)

## Comptes nouvellement créés (${created.length})

${created.length === 0 ? "_Aucun nouveau compte cette fois — tout existe déjà._" : `
| Nom complet | Contrat | Heures/sem | Email de connexion | Mot de passe temporaire |
|---|---|---|---|---|
${created.map((r) => `| ${r.fullName} | ${r.contract} | ${r.hours}h | \`${r.email}\` | \`${r.password}\` |`).join("\n")}
`}

## Tous les employés (${all.length})

| Nom | Email | Statut |
|---|---|---|
${all.map((r) => `| ${r.fullName} | \`${r.email}\` | ${r.status === "created" ? "✓ nouveau" : "déjà actif"} |`).join("\n")}

## ⚠️ Important

- Les emails sont des **placeholders** au format \`prenom.nom@caftanrh.example\`. Pour activer la récupération de mot de passe et les notifications email, mets à jour les emails réels via \`/admin/users\` puis (optionnel) demande aux employés de re-définir leur mot de passe.
- Mots de passe affichés **uniquement lors de la création**. Si quelqu'un perd le sien, utilise \`/admin/users\` pour réinitialiser ou le supprimer/recréer.
- Ce fichier sera écrasé à chaque exécution de \`npm run seed:employees\`.
`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
