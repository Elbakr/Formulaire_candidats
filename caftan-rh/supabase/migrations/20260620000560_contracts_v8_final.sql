-- Karim 2026-05-29 v8 FINAL : templates definitifs graves en pierre
-- 1. Doublons retires (Fait en deux exemplaires + Signatures + Parapher + Biffer
--    sont rendus par le HTML wrapper docuseal-flow.ts une seule fois)
-- 2. Employee (temps plein) : 38h fixe coche par defaut
-- 3. Employee_pt (temps partiel) : horaire VARIABLE coche + mention planning
--    fourni 7 jours calendaires a l avance
-- 4. Student : horaire VARIABLE coche par defaut
-- 5. Lieu de travail : workplace + "ou tout autre lieu selon besoins entreprise"
-- 6. Salaire : "au bareme en vigueur de la CP 201" au lieu du gross_salary


update public.contract_templates set body_markdown = $contract_v8$
# CONTRAT DE TRAVAIL D'EMPLOYÉ

**Entre** **L'employeur** : **{{employer_name}}**
**Adresse** : {{employer_address}}
**Localité** : {{employer_locality}}
**Représenté par** : {{employer_representative}}

**Et** **L'employé** : **{{employee_last_name}} {{employee_first_name}}**
**NISS** : {{employee_niss}}
**Adresse** : {{employee_address}}
**Localité** : {{employee_locality}}

**IL EST CONVENU CE QUI SUIT :**

## Article 1.
L'employeur engage l'employé dans les liens d'un contrat de travail à partir du **{{start_date}}**

## Article 2.
L'employé assume la fonction suivante : **{{position}}**
Cette fonction comporte entre autres l'exécution des tâches suivantes :
{{tasks}}

*Hormis l'hypothèse où le contrat est conclu pour un travail nettement défini, la liste reprise ci-dessus est indicative, mais non limitative ; l'employé pourra donc être affecté à d'autres tâches compatibles avec ses capacités professionnelles, dans la mesure où ce changement ne lui cause aucun préjudice matériel ou moral.*

## Article 3.
Le lieu de travail est situé à : **{{workplace}}**, ou tout autre lieu d'établissement de l'employeur selon les besoins de l'entreprise.
Les parties conviennent que le lieu de travail n'est pas une condition de travail essentielle du présent contrat de travail et pourra donc être modifié de façon unilatérale par l'employeur en fonction des nécessités de l'entreprise.

## Article 4.
L'engagement est conclu :
- ☐ Pour une **durée indéterminée***
- ☒ Pour une **durée déterminée*** du **{{start_date}}** au **{{end_date}}**
- ☐ Pour un **travail nettement défini*** : ............................................................................................................

## Article 5.
La durée du travail est fixée (complétez la rubrique concerné) :
- ☒ À **{{weekly_hours}} heures par semaine** et est repartie comme suit* :

{{schedule_table}}

Un repos est accordé au cours de la journée de travail de ................. à .................

- ☐ À {{weekly_hours}} heures en moyenne par semaine et est établie conformément au système de l'horaire flottant applicable dans l'entreprise*.
- ☐ Autre répartition* : ........................................................................................................................

## Article 6.
La rémunération convenue est fixée selon le **barème salarial en vigueur de la Commission Paritaire n°201** (commerce de détail indépendant), conformément aux dispositions sectorielles applicables.

Toutes autres indemnités, en dehors du salaire brut mentionné ci-dessus ou celles imposées par la loi, un arrêté royal ou par une convention collective du travail, sont purement des libéralités. En tout temps elles peuvent être octroyées ou supprimées pour des raisons dont l'employeur se réserve le droit de décider souverainement et au sujet desquelles il n'est redevable d'aucune justification à l'égard du travailleur. Concernant lesdites indemnités, le travailleur ne pourra en aucun cas invoquer un usage généralisé, ni faire valoir à cet égard un droit, quel qu'il soit.

## Article 7.
En outre, il est convenu l'octroi des avantages suivants* :
- ☐ **Titres-repas*** :
  valeur faciale du titre-repas de ............................................. €,
  comprenant une participation de l'employé de ............................. €,
  et une intervention patronale de ............................................. €.
- ☐ **Autres*** : {{benefits}}

*préciser les éventuels avantages accordés au travailleur et, le cas échéant, les conditions d'octroi de ces avantages*

## Article 8.
Le paiement de la rémunération sera effectué par banque sur le compte bancaire ci-dessous :
IBAN : **{{iban}}**
BIC : **{{bic}}**

## Article 9.
Les conditions de travail et de rémunération (par exemple : la prime de fin d'année) sont établies et adaptées, le cas échéant, sur base des décisions de la commission paritaire **{{paritary_commission}}**

## Article 10.
- Le travailleur défendra toujours les intérêts de l'employeur. Il veillera à ce qu'aucun discrédit ne soit jeté sur la renommée et la réputation de ce dernier et de sa politique.
- Le travailleur ne peut transmettre, prêter ou céder à quiconque des documents ou de la documentation, des formulaires, des tableaux, des dessins ou des diagrammes, de la correspondance, des listes de clients ou de fournisseurs, des logiciels ou autres supports de données, les originaux ou des copies de ceux-ci, qui sont la propriété de l'employeur.
- Toute invention et / ou amélioration, de quelle nature qu'elles soient, auxquelles le travailleur aurait collaboré, sont de plein droit la propriété de l'employeur.
- Tant pendant qu'après l'exécution du présent contrat, le travailleur n'aura pas le droit de révéler aux concurrents ou à quiconque les secrets concernant le fonctionnement de l'entreprise de l'employeur. Il s'abstiendra de poser des actes de concurrence déloyale ou d'y prêter son concours.
- Le travailleur consacrera l'intégralité de son activité professionnelle à l'exécution du présent contrat. Il s'engage à ne pas travailler pour son propre compte ou pour celui de tiers sans l'accord écrit préalable de l'employeur.
- Le travailleur ne peut prendre quelque engagement, conclure quelque contrat ou accepter quelque mandat pour le compte de l'employeur ou à charge de celui-ci.
- Le travailleur s'engage à respecter la confidentialité des données personnelles conformément au Règlement général 2016/679 sur la protection des données lorsqu'il est amené à traiter de telles données avec l'autorisation de l'employeur.

## Article 11.
Le travailleur avisera immédiatement l'employeur de tout retard ou de toute absence au travail, dont il justifiera également sur le champ. L'impossibilité faite à l'employé de fournir son travail par suite de maladie ou d'accident, doit être justifiée par un certificat médical envoyé à l'employeur dans les 2 jours ouvrables à compter du jour de l'incapacité de travail, le cachet de la poste faisant foi, ou encore, être remis en mains propres de l'employeur dans le même délai.

En cas de prolongation de l'incapacité, une nouvelle attestation sera présentée, au plus tard le premier jour ouvrable suivant la période arrivée à expiration.

Le travailleur prendra ses vacances en concertation avec l'employeur et avec l'accord de celui-ci.

## Article 12.
Si le présent contrat a été conclu pour une **durée indéterminée**, l'employeur et le travailleur ont le droit de mettre fin au contrat de travail moyennant un préavis écrit notifié à l'autre partie et dont le délai est conforme aux prescriptions des articles 37/2 et suivants de la loi du 3 juillet 1978 relative aux contrats de travail. Ce délai prend cours le lundi suivant le jour où la lettre de préavis est censée être réceptionnée.

*La partie qui met fin au contrat sans motif grave ou sans respecter le délai dont question ci-avant est tenue de payer à l'autre partie une indemnité égale à la rémunération en cours correspondant soit au délai de préavis, soit à la partie de ce délai restant à courir.*

## Article 13.
Si le présent contrat a été conclu pour une **durée déterminée** ou pour un **travail nettement défini**, il prend fin automatiquement au terme fixé ou à l'achèvement du travail convenu. Si la rupture intervient avant le terme fixé ou avant la fin du travail convenu, sauf en cas de rupture pour motif grave, une indemnité sera due conformément à l'article 40, § 1er de la loi du 3 juillet 1978.

Toutefois, durant la première moitié de la durée convenue du présent contrat, l'employeur et le travailleur pourront, sauf en cas de motif grave, résilier celui-ci moyennant le respect des délais de préavis déterminés par l'article 37/2 de la loi du 3 juillet 1978.
Ce délai prendra cours le lundi suivant le jour où la lettre de préavis est censée être réceptionnée.

*La période durant laquelle un préavis est possible ne peut dépasser 6 mois. Le délai de préavis doit prendre fin au plus tard le dernier jour de la période durant laquelle un préavis est possible.*

## Article 14.
Pour le reste, le présent contrat est soumis aux dispositions de la loi du 3 juillet 1978 relative aux contrats de travail et de ses arrêtés d'application, de la loi du 26 décembre 2013 concernant l'introduction d'un statut unique entre ouvriers et employés en ce qui concerne les délais de préavis et le jour de carence ainsi que de mesures d'accompagnement, des conventions collectives de travail sectorielles ou interprofessionnelles rendues obligatoires et du règlement de travail.

## Article 15.
Il est, en outre, convenu ce qui suit : {{special_conditions}}

## Article 16.
Le travailleur reconnaît avoir reçu un exemplaire du règlement de travail, avoir pris connaissance de celui-ci et en accepter les dispositions. Les clauses du présent contrat qui dérogent à celles du règlement de travail au moment de la signature primeront sur ces dernières.
*Loi du 3 juillet 1978 relative aux contrats de travail — Articles 37/2 et suivants (délais de préavis), Article 40 § 1er (rupture anticipée d'un CDD).*

*Loi du 26 décembre 2013 concernant l'introduction d'un statut unique entre ouvriers et employés en ce qui concerne les délais de préavis et le jour de carence ainsi que de mesures d'accompagnement.*

*Règlement général 2016/679 (RGPD) sur la protection des données.*

*Loi du 12 avril 1965 concernant la protection de la rémunération des travailleurs.*

*Conventions collectives de travail sectorielles ou interprofessionnelles rendues obligatoires (CP n°201 — commerce de détail indépendant).*

*Employeur : {{employer_name}} — BCE {{employer_bce}} — ONSS {{employer_onss}} — RC {{employer_rc}} — {{employer_address}}, {{employer_locality}}.*
$contract_v8$, updated_at = now() where code = 'employee';

update public.contract_templates set body_markdown = $contract_v8$
# CONTRAT DE TRAVAIL À TEMPS PARTIEL POUR EMPLOYÉ

**Entre** **L'employeur** : **{{employer_name}}**
**Adresse** : {{employer_address}}
**Localité** : {{employer_locality}}
**Représenté par** : {{employer_representative}}

**Et** **L'employé** : **{{employee_last_name}} {{employee_first_name}}**
**NISS** : {{employee_niss}}
**Adresse** : {{employee_address}}
**Localité** : {{employee_locality}}

**IL EST CONVENU CE QUI SUIT :**

## Article 1.
L'employeur engage l'employé dans les liens d'un contrat de travail à partir du **{{start_date}}**

## Article 2.
L'employé assume la fonction suivante : **{{position}}**
Cette fonction comporte entre autres l'exécution des tâches suivantes :
{{tasks}}

*Hormis l'hypothèse où le contrat est conclu pour un travail nettement défini, la liste reprise ci-dessus est indicative, mais non limitative ; l'employé pourra donc être affecté à d'autres tâches compatibles avec ses capacités professionnelles, dans la mesure où ce changement ne lui cause aucun préjudice matériel ou moral.*

## Article 3.
Le lieu de travail est situé à : **{{workplace}}**, ou tout autre lieu d'établissement de l'employeur selon les besoins de l'entreprise.
Les parties conviennent que le lieu de travail n'est pas une condition de travail essentielle du présent contrat de travail et pourra donc être modifié de façon unilatérale par l'employeur en fonction des nécessités de l'entreprise.

## Article 4.
L'engagement est conclu :
- ☐ Pour une **durée indéterminée***
- ☒ Pour une **durée déterminée*** du **{{start_date}}** au **{{end_date}}**
- ☐ Pour un **travail nettement défini*** : ............................................................................................................

## Article 5.
La durée du travail est établie (complétez la rubrique concerné) :

- ☐ à **{{weekly_hours}}h par semaine** suivant l'**horaire fixe** de travail décrit ci-après*.
  *Le travailleur est/n'est pas* soumis, dans ce cadre, au système de l'horaire flottant applicable dans l'entreprise.*
  ***Veuillez compléter également la grille 1 figurant en annexe.***

- ☐ à {{weekly_hours}}h sur un cycle de ........ semaines et suivant l'**horaire fixe** de travail décrit ci-après*.
  *Le travailleur est/n'est pas* soumis, dans ce cadre, au système de l'horaire flottant applicable dans l'entreprise.*
  *Il y a lieu dans ce cas de mentionner la durée totale des prestations au cours du cycle (ex.: 30h par quinzaine et de préciser l'importance du cycle (ex.: 2 semaines; 4 semaines).*
  ***Veuillez compléter également la grille 2 figurant en annexe.***

- ☒ à {{weekly_hours}}h par semaine* ou à {{weekly_hours}}h sur un cycle de ........ semaines*.
  *Dans le cadre de ce régime de travail, l'**horaire de travail** (c'est-à-dire les jours et heures de prestation) **est variable et sera communiqué au travailleur au moins 5 jours ouvrables à l'avance. L'horaire effectif est communiqué au travailleur **au moins 7 jours calendaires à l'avance** par voie d'affichage à l'établissement ou par tout autre moyen écrit.** par affichage d'un avis dans les locaux de l'entreprise, à l'endroit où le règlement de travail peut être consulté.*

- ☐ à une durée hebdomadaire moyenne de {{weekly_hours}}h fixée sur une période de ........ semaines*.
  *Dans le cadre de ce régime de travail flexible (c'est-à-dire que la durée hebdomadaire effective de travail peut varier d'une semaine à l'autre), **l'horaire de travail** (c'est-à-dire les jours et les heures de prestations) **est également variable et sera communiqué au travailleur au moins 5 jours ouvrables à l'avance** par affichage d'un avis dans les locaux de l'entreprise, à l'endroit où le règlement de travail peut être consulté.*

## Article 6.
La rémunération convenue est fixée selon le **barème salarial en vigueur de la Commission Paritaire n°201** (commerce de détail indépendant), conformément aux dispositions sectorielles applicables.

Toutes autres indemnités, en dehors du salaire brut mentionné ci-dessus ou celles imposées par la loi, un arrêté royal ou par une convention collective du travail, sont purement des libéralités. En tout temps elles peuvent être octroyées ou supprimées pour des raisons dont l'employeur se réserve le droit de décider souverainement et au sujet desquelles il n'est redevable d'aucune justification à l'égard du travailleur. Concernant lesdites indemnités, le travailleur ne pourra en aucun cas invoquer un usage généralisé, ni faire valoir à cet égard un droit, quel qu'il soit.

## Article 7.
En outre, il est convenu l'octroi des avantages suivants* :
- ☐ **Titres-repas*** :
  valeur faciale du titre-repas de ............................................. €,
  comprenant une participation de l'employé de ............................. €,
  et une intervention patronale de ............................................. €.
- ☐ **Autres*** : {{benefits}}

*préciser les éventuels avantages accordés au travailleur et, le cas échéant, les conditions d'octroi de ces avantages*

## Article 8.
Le paiement de la rémunération sera effectué par banque sur le compte bancaire ci-dessous :
IBAN : **{{iban}}**
BIC : **{{bic}}**

## Article 9.
Les conditions de travail et de rémunération (par exemple : la prime de fin d'année) sont établies et adaptées, le cas échéant, sur base des décisions de la commission paritaire **{{paritary_commission}}**

## Article 10.
- Le travailleur défendra toujours les intérêts de l'employeur. Il veillera à ce qu'aucun discrédit ne soit jeté sur la renommée et la réputation de ce dernier et de sa politique.
- Le travailleur ne peut transmettre, prêter ou céder à quiconque des documents ou de la documentation, des formulaires, des tableaux, des dessins ou des diagrammes, de la correspondance, des listes de clients ou de fournisseurs, des logiciels ou autres supports de données, les originaux ou des copies de ceux-ci, qui sont la propriété de l'employeur.
- Toute invention et / ou amélioration, de quelle nature qu'elles soient, auxquelles le travailleur aurait collaboré, sont de plein droit la propriété de l'employeur.
- Tant pendant qu'après l'exécution du présent contrat, le travailleur n'aura pas le droit de révéler aux concurrents ou à quiconque les secrets concernant le fonctionnement de l'entreprise de l'employeur. Il s'abstiendra de poser des actes de concurrence déloyale ou d'y prêter son concours.
- Le travailleur consacrera l'intégralité de son activité professionnelle à l'exécution du présent contrat. Il s'engage à ne pas travailler pour son propre compte ou pour celui de tiers sans l'accord écrit préalable de l'employeur.
- Le travailleur ne peut prendre quelque engagement, conclure quelque contrat ou accepter quelque mandat pour le compte de l'employeur ou à charge de celui-ci.
- Le travailleur s'engage à respecter la confidentialité des données personnelles conformément au Règlement général 2016/679 sur la protection des données lorsqu'il est amené à traiter de telles données avec l'autorisation de l'employeur.

## Article 11.
Le travailleur avisera immédiatement l'employeur de tout retard ou de toute absence au travail, dont il justifiera également sur le champ. L'impossibilité faite à l'employé de fournir son travail par suite de maladie ou d'accident, doit être justifiée par un certificat médical envoyé à l'employeur dans les 2 jours ouvrables à compter du jour de l'incapacité de travail, le cachet de la poste faisant foi, ou encore, être remis en mains propres de l'employeur dans le même délai.

En cas de prolongation de l'incapacité, une nouvelle attestation sera présentée, au plus tard le premier jour ouvrable suivant la période arrivée à expiration.

Le travailleur prendra ses vacances en concertation avec l'employeur et avec l'accord de celui-ci.

## Article 12.
Si le présent contrat a été conclu pour une **durée indéterminée**, l'employeur et le travailleur ont le droit de mettre fin au contrat de travail moyennant un préavis écrit notifié à l'autre partie et dont le délai est conforme aux prescriptions des articles 37/2 et suivants de la loi du 3 juillet 1978 relative aux contrats de travail. Ce délai prend cours le lundi suivant le jour où la lettre de préavis est censée être réceptionnée.

*La partie qui met fin au contrat sans motif grave ou sans respecter le délai dont question ci-avant est tenue de payer à l'autre partie une indemnité égale à la rémunération en cours correspondant soit au délai de préavis, soit à la partie de ce délai restant à courir.*

## Article 13.
Si le présent contrat a été conclu pour une **durée déterminée** ou pour un **travail nettement défini**, il prend fin automatiquement au terme fixé ou à l'achèvement du travail convenu. Si la rupture intervient avant le terme fixé ou avant la fin du travail convenu, sauf en cas de rupture pour motif grave, une indemnité sera due conformément à l'article 40, § 1er de la loi du 3 juillet 1978.

Toutefois, durant la première moitié de la durée convenue du présent contrat, l'employeur et le travailleur pourront, sauf en cas de motif grave, résilier celui-ci moyennant le respect des délais de préavis déterminés par l'article 37/2 de la loi du 3 juillet 1978.
Ce délai prendra cours le lundi suivant le jour où la lettre de préavis est censée être réceptionnée.

*La période durant laquelle un préavis est possible ne peut dépasser 6 mois. Le délai de préavis doit prendre fin au plus tard le dernier jour de la période durant laquelle un préavis est possible.*

## Article 14.
Pour le reste, le présent contrat est soumis aux dispositions de la loi du 3 juillet 1978 relative aux contrats de travail et de ses arrêtés d'application, de la loi du 26 décembre 2013 concernant l'introduction d'un statut unique entre ouvriers et employés en ce qui concerne les délais de préavis et le jour de carence ainsi que de mesures d'accompagnement, des conventions collectives de travail sectorielles ou interprofessionnelles rendues obligatoires et du règlement de travail.

## Article 15.
Il est, en outre, convenu ce qui suit : {{special_conditions}}

## Article 16.
Le travailleur reconnaît avoir reçu un exemplaire du règlement de travail, avoir pris connaissance de celui-ci et en accepter les dispositions. Les clauses du présent contrat qui dérogent à celles du règlement de travail au moment de la signature primeront sur ces dernières.

---

## ANNEXE : HORAIRES DE TRAVAIL FIXÉS CONTRACTUELLEMENT

### Grille 1. Horaire fixe de travail établi sur une semaine

{{schedule_grid}}

Total des heures de la semaine : ............................................................

Intervalles de repos par jour : de ........ à ........ et de ........ à ........

### Grille 2. Horaire fixe de travail établi sur un cycle de travail supérieur à une semaine

**Première semaine**

| Jour | Horaire matin | Horaire après-midi | Total |
|---|---|---|---|
| Lundi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mardi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mercredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Jeudi | de ............ à ............ | et de ............ à ............ | = ............ |
| Vendredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Samedi | de ............ à ............ | et de ............ à ............ | = ............ |
| Dimanche | de ............ à ............ | et de ............ à ............ | = ............ |

Total des heures de la semaine : ............................................................

Intervalles de repos par jour : de ........ à ........ et de ........ à ........

**Deuxième semaine**

| Jour | Horaire matin | Horaire après-midi | Total |
|---|---|---|---|
| Lundi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mardi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mercredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Jeudi | de ............ à ............ | et de ............ à ............ | = ............ |
| Vendredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Samedi | de ............ à ............ | et de ............ à ............ | = ............ |
| Dimanche | de ............ à ............ | et de ............ à ............ | = ............ |

Total des heures de la semaine : ............................................................

Intervalles de repos par jour : de ........ à ........ et de ........ à ........

**Troisième semaine**

| Jour | Horaire matin | Horaire après-midi | Total |
|---|---|---|---|
| Lundi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mardi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mercredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Jeudi | de ............ à ............ | et de ............ à ............ | = ............ |
| Vendredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Samedi | de ............ à ............ | et de ............ à ............ | = ............ |
| Dimanche | de ............ à ............ | et de ............ à ............ | = ............ |

Total des heures de la semaine : ............................................................

Intervalles de repos par jour : de ........ à ........ et de ........ à ........

**Quatrième semaine**

| Jour | Horaire matin | Horaire après-midi | Total |
|---|---|---|---|
| Lundi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mardi | de ............ à ............ | et de ............ à ............ | = ............ |
| Mercredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Jeudi | de ............ à ............ | et de ............ à ............ | = ............ |
| Vendredi | de ............ à ............ | et de ............ à ............ | = ............ |
| Samedi | de ............ à ............ | et de ............ à ............ | = ............ |
| Dimanche | de ............ à ............ | et de ............ à ............ | = ............ |

Total des heures de la semaine : ............................................................

Intervalles de repos par jour : de ........ à ........ et de ........ à ........
*Loi du 3 juillet 1978 relative aux contrats de travail — Articles 37/2 et suivants (délais de préavis), Article 40 § 1er (rupture anticipée d'un CDD).*

*Loi du 26 décembre 2013 concernant l'introduction d'un statut unique entre ouvriers et employés en ce qui concerne les délais de préavis et le jour de carence ainsi que de mesures d'accompagnement.*

*Règlement général 2016/679 (RGPD) sur la protection des données.*

*Loi du 12 avril 1965 concernant la protection de la rémunération des travailleurs.*

*Conventions collectives de travail sectorielles ou interprofessionnelles rendues obligatoires (CP n°201 — commerce de détail indépendant).*

*Pour le contrat à temps partiel : Loi du 3 juillet 1978 ainsi que les dispositions spécifiques au régime de travail à temps partiel (durée hebdomadaire moyenne, horaire variable communiqué au moins 5 jours ouvrables à l'avance, affichage de l'horaire dans les locaux à l'endroit où le règlement de travail peut être consulté).*

*Employeur : {{employer_name}} — BCE {{employer_bce}} — ONSS {{employer_onss}} — RC {{employer_rc}} — {{employer_address}}, {{employer_locality}}.*
$contract_v8$, updated_at = now() where code = 'employee_pt';

update public.contract_templates set body_markdown = $contract_v8$
# CONTRAT D'OCCUPATION D'ÉTUDIANT

*Le contrat d'occupation d'étudiant est un document social. Il doit être tenu sur le lieu de travail où l'étudiant est occupé et conservé pendant 5 ans à dater du jour qui suit celui de la fin de l'exécution du contrat.*

**Entre** **L'employeur** : **{{employer_name}}**
**Adresse** : {{employer_address}}
**Localité** : {{employer_locality}}
**Représenté par** : {{employer_representative}}

**Et** **L'ouvrier** : **{{employee_last_name}} {{employee_first_name}}**
**NISS** : {{employee_niss}}
**Adresse** : {{employee_address}}
**Localité** : {{employee_locality}}

**IL EST CONVENU CE QUI SUIT :**

## Article 1.
L'employeur engage l'étudiant pour remplir les tâches et/ou fonctions suivantes : **{{position}}**
...........................................................................................................................................................................

*Cette liste est indicative mais non limitative ; l'étudiant pourra donc être affecté à d'autres tâches similaires, pour autant que ce changement ne lui cause aucun préjudice matériel ou moral.*

## Article 2.
L'engagement est conclu pour une période déterminée (maximum 12 mois) prenant cours le **{{start_date}}** pour se terminer le **{{end_date}}**.

## Article 3.
Les 3 premiers jours de travail sont considérés comme **période d'essai**.

## Article 4.
L'étudiant est engagé pour travailler à : **{{workplace}}**, ou tout autre lieu d'établissement de l'employeur selon les besoins de l'entreprise.
...........................................................................................................................................................................

## Article 5.
La durée du travail est fixée (complétez la rubrique concerné) :

- ☐ À **{{weekly_hours}} heures par semaine** et est repartie comme suit* :

{{schedule_table}}

Un repos est accordé au cours de la journée de travail de ................. à .................

- ☒ à {{weekly_hours}}h par semaine* suivant un horaire variable
  *Dans le cadre de ce régime de travail, **l'horaire de travail** (c'est-à-dire les jours et heures de prestation) **est variable** et sera communiqué au travailleur au moins 5 jours ouvrables à l'avance par affichage d'un avis dans les locaux de l'entreprise, à l'endroit où le règlement de travail peut être consulté.*

- ☐ À {{weekly_hours}} heures en moyenne par semaine et est établie conformément au système de l'horaire flottant applicable dans l'entreprise*.

- ☐ Autre répartition* : ........................................................................................................................

## Article 6.
La loi du 12 avril 1965 concernant la protection de la rémunération des travailleurs est applicable à ce contrat.

## Article 7.
La rémunération convenue est fixée selon le **barème salarial en vigueur de la Commission Paritaire n°201** (commerce de détail indépendant), conformément aux dispositions sectorielles applicables.

*S'il n'y a pas possibilité de fixer au moment de la conclusion du contrat le montant de la rémunération, il y a lieu d'indiquer le mode et la base de calcul de cette rémunération.*

## Article 8.
Le paiement de la rémunération sera effectué par banque sur le compte

IBAN : **{{iban}}**
BIC : **{{bic}}**

## Article 9.
(Eventuellement) Il est convenu l'octroi des avantages suivants : {{benefits}}

*Préciser les éventuels avantages accordés à l'étudiant et, le cas échéant, les conditions d'octroi de ces avantages.*

## Article 10.
Les conditions de travail sont établies sur base des décisions de la commission paritaire **{{paritary_commission}}**.

## Article 11.
Jusqu'à l'expiration de la **période d'essai**, l'employeur et l'étudiant pourront mettre fin au présent contrat sans préavis ni indemnité.

## Article 12.
Après la période d'essai, chacune des parties peut mettre fin au contrat de travail, avant l'expiration du terme, moyennant un préavis notifié à l'autre partie ou sans préavis contre le paiement d'une indemnité de rupture égale à la rémunération correspondant à la durée du délai de préavis. Les délais de préavis à respecter sont :

| Durée du contrat de travail | Employeur | Étudiant |
|---|---|---|
| Jusqu'à 1 mois inclus | 3 jours calendriers | 1 jour calendrier |
| Plus de 1 mois | 7 jours calendriers | 3 jours calendriers |

## Article 13.
Pour le reste, le contrat est soumis aux dispositions de la loi du 3 juillet 1978 et de ses arrêtés d'application, de la loi du 26 décembre 2013 concernant l'introduction d'un statut unique entre ouvriers et employés en ce qui concerne les délais de préavis et le jour de carence ainsi que de mesures d'accompagnement, des conventions collectives sectorielles ou interprofessionnelles rendues obligatoires et du règlement de travail.

## Article 14.
L'étudiant reconnaît avoir reçu un exemplaire du présent contrat et une copie du règlement de travail. Il déclare en accepter les clauses et conditions.
*Loi du 3 juillet 1978 relative aux contrats de travail — base légale des contrats de travail en Belgique, y compris pour les contrats d'occupation d'étudiant.*

*Loi du 12 avril 1965 concernant la protection de la rémunération des travailleurs — applicable au présent contrat d'occupation d'étudiant.*

*Loi du 26 décembre 2013 concernant l'introduction d'un statut unique entre ouvriers et employés en ce qui concerne les délais de préavis et le jour de carence ainsi que de mesures d'accompagnement.*

*Règlement général 2016/679 (RGPD) sur la protection des données personnelles.*

*Conventions collectives sectorielles ou interprofessionnelles rendues obligatoires (CP n°201 — commerce de détail indépendant).*

*Délais de préavis applicables aux contrats d'occupation d'étudiant (Article 12 ci-dessus) : 3 jours calendriers (employeur) / 1 jour calendrier (étudiant) jusqu'à 1 mois inclus ; 7 jours calendriers (employeur) / 3 jours calendriers (étudiant) au-delà d'un mois. La période d'essai est fixée à 3 jours par l'Article 3 et permet la rupture sans préavis ni indemnité.*

*Durée maximale du contrat d'occupation d'étudiant : 12 mois (Article 2). Cotisation de solidarité ONSS applicable dans les limites du contingent annuel d'heures défini par l'arrêté royal.*

*Employeur : {{employer_name}} — BCE {{employer_bce}} — ONSS {{employer_onss}} — RC {{employer_rc}} — {{employer_address}}, {{employer_locality}}.*
$contract_v8$, updated_at = now() where code = 'student';
