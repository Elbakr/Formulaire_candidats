// Karim 2026-05-22 : seed des 3 modeles de contrat extraits des PDF de
// 19h17 (CT employe TP, CT employe TP partiel, CT etudiant). Chaque template
// contient le texte complet avec des variables {{xxx}} qui seront
// substituees a la generation.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const EMPLOYEE_TEMPLATE = `
# CONTRAT DE TRAVAIL D'EMPLOYÉ

**Entre**

L'employeur : **{{employer_name}}**
Adresse : {{employer_address}}
Localité : {{employer_locality}}
Représenté par : {{employer_representative}}

**Et**

L'employé : **{{employee_last_name}} {{employee_first_name}}**
NISS : {{employee_niss}}
Adresse : {{employee_address}}
Localité : {{employee_locality}}

**IL EST CONVENU CE QUI SUIT :**

## Article 1.
L'employeur engage l'employé dans les liens d'un contrat de travail à partir du **{{start_date}}**.

## Article 2.
L'employé assume la fonction suivante : **{{position}}**
Cette fonction comporte entre autres l'exécution des tâches suivantes :
{{tasks}}

Hormis l'hypothèse où le contrat est conclu pour un travail nettement défini, la liste reprise ci-dessus est indicative, mais non limitative ; l'employé pourra donc être affecté à d'autres tâches compatibles avec ses capacités professionnelles, dans la mesure où ce changement ne lui cause aucun préjudice matériel ou moral.

## Article 3.
Le lieu de travail est situé à : **{{workplace}}**.
Les parties conviennent que le lieu de travail n'est pas une condition de travail essentielle du présent contrat de travail et pourra donc être modifié de façon unilatérale par l'employeur en fonction des nécessités de l'entreprise.

## Article 4.
L'engagement est conclu pour **{{contract_duration}}**{{#if end_date}} du {{start_date}} au {{end_date}}{{/if}}.

## Article 5.
La durée du travail est fixée à **{{weekly_hours}} heures par semaine**, répartie comme suit :
{{schedule_table}}

Un repos est accordé au cours de la journée de travail.

## Article 6.
À la date du présent contrat, la rémunération convenue est fixée à **{{gross_salary}} € bruts par {{salary_period}}**.

Toutes autres indemnités, en dehors du salaire brut mentionné ci-dessus ou celles imposées par la loi, un arrêté royal ou par une convention collective du travail, sont purement des libéralités.

## Article 7.
Avantages convenus : {{benefits}}

## Article 8.
Le paiement de la rémunération sera effectué par banque sur le compte :
- **IBAN** : {{iban}}
- **BIC** : {{bic}}

## Article 9.
Les conditions de travail et de rémunération sont établies sur base des décisions de la commission paritaire **{{paritary_commission}}**.

## Article 10.
- Le travailleur défendra toujours les intérêts de l'employeur.
- Le travailleur ne peut transmettre, prêter ou céder à quiconque des documents propriété de l'employeur.
- Toute invention/amélioration auxquelles le travailleur aurait collaboré est de plein droit propriété de l'employeur.
- Tant pendant qu'après l'exécution du contrat, le travailleur n'aura pas le droit de révéler les secrets concernant l'entreprise.
- Le travailleur consacrera l'intégralité de son activité professionnelle à l'exécution du présent contrat.
- Le travailleur s'engage à respecter la confidentialité des données personnelles (RGPD 2016/679).

## Article 11.
Le travailleur avisera immédiatement l'employeur de tout retard ou absence. L'incapacité par suite de maladie ou accident doit être justifiée par certificat médical dans les 2 jours ouvrables.

## Article 12.
Si le présent contrat a été conclu pour une **durée indéterminée**, l'employeur et le travailleur peuvent y mettre fin moyennant un préavis écrit conforme aux articles 37/2 et suivants de la loi du 3 juillet 1978.

## Article 13.
Si le présent contrat a été conclu pour une **durée déterminée** ou un **travail nettement défini**, il prend fin automatiquement au terme fixé. Durant la première moitié de la durée convenue, chaque partie peut résilier moyennant préavis (article 37/2).

## Article 14.
Le présent contrat est soumis aux dispositions de la loi du 3 juillet 1978 et du règlement de travail.

## Article 15.
Conditions particulières : {{special_conditions}}

## Article 16.
Le travailleur reconnaît avoir reçu un exemplaire du règlement de travail.

---

Fait en deux exemplaires à **{{contract_location}}**, le **{{contract_date}}**.
Chacune des parties reconnaît avoir reçu un exemplaire original.
`;

const EMPLOYEE_PT_TEMPLATE = `
# CONTRAT DE TRAVAIL À TEMPS PARTIEL POUR EMPLOYÉ

**Entre**

L'employeur : **{{employer_name}}**
Adresse : {{employer_address}}
Localité : {{employer_locality}}
Représenté par : {{employer_representative}}

**Et**

L'employé : **{{employee_last_name}} {{employee_first_name}}**
NISS : {{employee_niss}}
Adresse : {{employee_address}}
Localité : {{employee_locality}}

**IL EST CONVENU CE QUI SUIT :**

## Article 1.
L'employeur engage l'employé dans les liens d'un contrat de travail à partir du **{{start_date}}**.

## Article 2.
L'employé assume la fonction suivante : **{{position}}**
Tâches : {{tasks}}

## Article 3.
Le lieu de travail est situé à : **{{workplace}}**. Modifiable unilatéralement selon les nécessités de l'entreprise.

## Article 4.
L'engagement est conclu pour **{{contract_duration}}**{{#if end_date}} du {{start_date}} au {{end_date}}{{/if}}.

## Article 5.
La durée du travail est établie à **{{weekly_hours}} heures par semaine** suivant **{{schedule_type}}**.
{{#if schedule_cycle_weeks}}Sur un cycle de {{schedule_cycle_weeks}} semaines.{{/if}}
Voir annexe pour le détail des grilles horaires.

## Article 6.
À la date du présent contrat, la rémunération convenue est fixée à **{{gross_salary}} € bruts par {{salary_period}}**.

## Article 7.
Avantages : {{benefits}}

## Article 8.
Paiement par virement bancaire :
- **IBAN** : {{iban}}
- **BIC** : {{bic}}

## Article 9.
Conditions de travail et de rémunération : commission paritaire **{{paritary_commission}}**.

## Article 10.
Obligations du travailleur (loyauté, confidentialité, secret professionnel, RGPD) — voir détail.

## Article 11.
Avis immédiat de tout retard/absence. Certificat médical dans les 2 jours.

## Article 12.
Préavis pour CDI : conforme aux articles 37/2 et suivants de la loi du 3 juillet 1978.

## Article 13.
Pour CDD ou travail nettement défini : fin automatique au terme.

## Article 14.
Soumis à la loi du 3 juillet 1978, au règlement de travail.

## Article 15.
Conditions particulières : {{special_conditions}}

## Article 16.
Reconnaissance de réception du règlement de travail.

---

## ANNEXE : HORAIRES DE TRAVAIL FIXÉS CONTRACTUELLEMENT

### Grille horaire

{{schedule_grid}}

Total des heures de la semaine : **{{weekly_hours}}h**

---

Fait en deux exemplaires à **{{contract_location}}**, le **{{contract_date}}**.
`;

const STUDENT_TEMPLATE = `
# CONTRAT D'OCCUPATION D'ÉTUDIANT

*Le contrat d'occupation d'étudiant est un document social. Il doit être tenu sur le lieu de travail où l'étudiant est occupé et conservé pendant 5 ans à dater du jour qui suit celui de la fin de l'exécution du contrat.*

**Entre**

L'employeur : **{{employer_name}}**
Adresse : {{employer_address}}
Localité : {{employer_locality}}
Représenté par : {{employer_representative}}

**Et**

L'ouvrier : **{{employee_last_name}} {{employee_first_name}}**
NISS : {{employee_niss}}
Adresse : {{employee_address}}
Localité : {{employee_locality}}

**IL EST CONVENU CE QUI SUIT :**

## Article 1.
L'employeur engage l'étudiant pour remplir les tâches et/ou fonctions suivantes : **{{position}}**

Cette liste est indicative mais non limitative.

## Article 2.
L'engagement est conclu pour une période déterminée (maximum 12 mois) prenant cours le **{{start_date}}** pour se terminer le **{{end_date}}**.

## Article 3.
Les 3 premiers jours de travail sont considérés comme **période d'essai**.

## Article 4.
L'étudiant est engagé pour travailler à : **{{workplace}}**.

## Article 5.
La durée du travail est fixée à **{{weekly_hours}} heures par semaine** suivant **{{schedule_type}}**.

{{schedule_table}}

## Article 6.
La loi du 12 avril 1965 concernant la protection de la rémunération des travailleurs est applicable à ce contrat.

## Article 7.
La rémunération convenue est fixée à **{{gross_salary}} € bruts par {{salary_period}}**.

## Article 8.
Paiement par virement bancaire :
- **IBAN** : {{iban}}
- **BIC** : {{bic}}

## Article 9.
Avantages éventuels : {{benefits}}

## Article 10.
Conditions de travail établies sur base des décisions de la commission paritaire **{{paritary_commission}}**.

## Article 11.
Jusqu'à l'expiration de la **période d'essai**, l'employeur et l'étudiant pourront mettre fin au présent contrat sans préavis ni indemnité.

## Article 12.
Après la période d'essai, chacune des parties peut mettre fin au contrat moyennant préavis :

| Durée du contrat | Préavis employeur | Préavis étudiant |
|---|---|---|
| Jusqu'à 1 mois inclus | 3 jours calendriers | 1 jour calendrier |
| Plus de 1 mois | 7 jours calendriers | 3 jours calendriers |

## Article 13.
Soumis à la loi du 3 juillet 1978 et de ses arrêtés d'application.

## Article 14.
L'étudiant reconnaît avoir reçu un exemplaire du présent contrat et une copie du règlement de travail.

---

Fait en deux exemplaires à **{{contract_location}}**, le **{{contract_date}}**.
`;

const templates = [
  {
    code: "employee",
    name: "Contrat de travail d'employé (temps plein)",
    kind: "employee",
    title: "CONTRAT DE TRAVAIL D'EMPLOYÉ",
    body: EMPLOYEE_TEMPLATE.trim(),
    has_annex: false,
  },
  {
    code: "employee_pt",
    name: "Contrat de travail à temps partiel pour employé",
    kind: "employee_pt",
    title: "CONTRAT DE TRAVAIL À TEMPS PARTIEL POUR EMPLOYÉ",
    body: EMPLOYEE_PT_TEMPLATE.trim(),
    has_annex: true,
  },
  {
    code: "student",
    name: "Contrat d'occupation d'étudiant",
    kind: "student",
    title: "CONTRAT D'OCCUPATION D'ÉTUDIANT",
    body: STUDENT_TEMPLATE.trim(),
    has_annex: false,
  },
];

for (const t of templates) {
  const exists = await c.query("select id from contract_templates where code=$1", [t.code]);
  if (exists.rowCount > 0) {
    await c.query(
      `update contract_templates set name=$1, kind=$2, title=$3, body_markdown=$4, has_schedule_annex=$5, updated_at=now() where code=$6`,
      [t.name, t.kind, t.title, t.body, t.has_annex, t.code],
    );
    console.log(`  ✓ UPDATE ${t.code} (${t.name})`);
  } else {
    await c.query(
      `insert into contract_templates (code, name, kind, title, body_markdown, has_schedule_annex) values ($1, $2, $3, $4, $5, $6)`,
      [t.code, t.name, t.kind, t.title, t.body, t.has_annex],
    );
    console.log(`  ✓ INSERT ${t.code} (${t.name})`);
  }
}

console.log(`\n${templates.length} templates seeded.`);
await c.end();
