-- Karim 2026-06-04 : bascule du défaut Article 5 (horaire de travail) de FIXE
-- vers VARIABLE sur les 3 templates de contrat (CDD plein, CDD partiel,
-- Étudiant). Raison : retail CaftanRH a un planning hebdo qui change toutes
-- les semaines (sites multiples, swaps, renforts), donc l'horaire variable
-- (communiqué min 5 jours ouvrables d'avance, affichage interne) reflète
-- la réalité juridique.
--
-- Le texte des templates reste INTACT (memory: layout v8.1 inviolable +
-- contrats reproduits mot pour mot). Seul le ☒/☐ change.
--
-- Si admin a deja modifie le template via UI, la REPLACE devient no-op
-- silencieusement (= aucun risque de casser un override existant).

-- ────────────────────────────────────────────────────────────────
-- 1) employee (CDD plein)
--    Option A "X h/sem et repartie comme suit"  ☒ → ☐
--    Option B "X h en moyenne ... horaire flottant" ☐ → ☒
-- ────────────────────────────────────────────────────────────────
UPDATE public.contract_templates
SET body_markdown = REPLACE(
  REPLACE(
    body_markdown,
    '- ☒ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*',
    '- ☐ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*'
  ),
  '- ☐ À {{weekly_hours}} heures en moyenne par semaine et est établie conformément au système de l''horaire flottant',
  '- ☒ À {{weekly_hours}} heures en moyenne par semaine et est établie conformément au système de l''horaire flottant'
)
WHERE code = 'employee';

-- ────────────────────────────────────────────────────────────────
-- 2) employee_pt (CDD partiel)
--    Option A "X h/sem horaire fixe"           ☒ → ☐
--    Option C "X h/sem horaire variable (5j d avance)" ☐ → ☒
-- ────────────────────────────────────────────────────────────────
UPDATE public.contract_templates
SET body_markdown = REPLACE(
  REPLACE(
    body_markdown,
    '- ☒ à **{{weekly_hours}}h par semaine** suivant l''**horaire fixe**',
    '- ☐ à **{{weekly_hours}}h par semaine** suivant l''**horaire fixe**'
  ),
  '- ☐ à {{weekly_hours}}h par semaine* ou à {{weekly_hours}}h sur un cycle',
  '- ☒ à {{weekly_hours}}h par semaine* ou à {{weekly_hours}}h sur un cycle'
)
WHERE code = 'employee_pt';

-- ────────────────────────────────────────────────────────────────
-- 3) student
--    Option A "X h/sem repartie comme suit"   ☒ → ☐
--    Option B "X h/sem suivant horaire variable" ☐ → ☒
-- ────────────────────────────────────────────────────────────────
UPDATE public.contract_templates
SET body_markdown = REPLACE(
  REPLACE(
    body_markdown,
    '- ☒ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*',
    '- ☐ À **{{weekly_hours}} heures par semaine** et est repartie comme suit*'
  ),
  '- ☐ à {{weekly_hours}}h par semaine* suivant un horaire variable',
  '- ☒ à {{weekly_hours}}h par semaine* suivant un horaire variable'
)
WHERE code = 'student';
