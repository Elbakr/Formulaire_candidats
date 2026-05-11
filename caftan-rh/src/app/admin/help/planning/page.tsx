// /admin/help/planning — documentation des règles du solver de planning.
//
// Server component. Lit en direct :
//  - les segments du profil de rush global (rush_profile_segments site_id=NULL)
//  - les seasonal_events actifs ou à venir
// pour afficher des données "vivantes", pas des constantes hardcodées.
//
// Sécurité : admin / rh / manager (cohérent avec /admin/overtime-audit).

import Link from "next/link";
import {
  FileText,
  Sparkles,
  Activity,
  AlertTriangle,
  Clock,
  Users,
  Layers,
  Zap,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { loadRushProfile, RUSH_INTENSITY_PEAK_THRESHOLD } from "@/lib/rush-profile";
import { loadSeasonalEvents } from "@/lib/seasonal";
import { addDays, toISODate } from "@/lib/planning";

export const dynamic = "force-dynamic";

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-BE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function PlanningHelpPage() {
  await requireRole(["admin", "rh", "manager"]);

  // Données live
  const today = new Date();
  const todayISO = toISODate(today);
  const endRangeISO = toISODate(addDays(today, 90));
  const [segments, events] = await Promise.all([
    loadRushProfile(null),
    loadSeasonalEvents(todayISO, endRangeISO),
  ]);

  // Note : multiplicateurs Sam/fériés/période forte non encore exposés dans
  // org_settings — affichage des valeurs de référence documentaires.

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-gold-dark" />
          Aide planning — règles du solver
        </h1>
        <p className="text-sm text-ink-2">
          Comment Caftan HR planifie ton équipe, et où trouver les leviers de
          réglage.{" "}
          <Link
            href="/admin/overtime-audit"
            className="text-gold-dark hover:underline inline-flex items-center gap-1"
          >
            <Activity className="h-3.5 w-3.5" /> audit heures sup
          </Link>
        </p>
      </div>

      {/* Encadré rouge important */}
      <Card className="border-danger-light bg-danger-light/30 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <div className="font-bold text-danger">Important</div>
            <p>
              Le système actuel <strong>distingue</strong>&nbsp;:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Heures contractuelles</strong> (
                <code className="bg-surface px-1 rounded">is_overtime=false</code>
                ) : étalées par le solver phase 1 dans la limite{" "}
                <code className="bg-surface px-1 rounded">weekly_hours</code>.
              </li>
              <li>
                <strong>Heures supplémentaires</strong> (
                <code className="bg-surface px-1 rounded">is_overtime=true</code>
                ) : autorisées au cas par cas par l&apos;admin/RH avec
                multiplicateur ×1.25 / ×1.5 / ×2.
              </li>
            </ul>
            <p>
              Les shifts historiques créés avant la mise en place de cette
              séparation peuvent apparaître en dépassement non taggé. Va sur{" "}
              <Link
                href="/admin/overtime-audit"
                className="text-gold-dark hover:underline font-bold"
              >
                /admin/overtime-audit
              </Link>{" "}
              pour les reclassifier.
            </p>
          </div>
        </div>
      </Card>

      {/* 1. Phase 1 */}
      <Section
        icon={<Layers className="h-4 w-4 text-gold-dark" />}
        title="1. Phase 1 — distribution contractuelle"
      >
        <p>
          Le solver compose le planning hebdo en respectant un{" "}
          <strong>HARD CAP weekly_hours</strong> par employé. Aucun shift
          contractuel ne fait dépasser ce plafond — si plus d&apos;heures sont
          nécessaires, on bascule en phase 2 (OT).
        </p>
        <h3 className="text-sm font-bold mt-3">Tiers de priorité</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <Badge tone="success">Tier 1 — primary</Badge> assignés au site via{" "}
            <code className="bg-surface-2 px-1 rounded">site_assignments.is_primary = true</code>
            . Premiers servis.
          </li>
          <li>
            <Badge tone="warn">Tier 2 — secondary</Badge> assignés au site mais
            non-primary. Backup naturel.
          </li>
          <li>
            <Badge tone="muted">Tier 3 — external / renfort</Badge> appelés en
            cross-site si on n&apos;arrive pas à couvrir avec les tiers 1+2.
          </li>
        </ul>
        <h3 className="text-sm font-bold mt-3">Tri étalement + équité</h3>
        <p>
          Au sein d&apos;un tier, le solver trie par&nbsp;:
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          <li>moins d&apos;heures déjà planifiées cette semaine,</li>
          <li>moins d&apos;heures cumulées sur les 4 dernières semaines,</li>
          <li>distance trajet (cross-site).</li>
        </ol>
        <h3 className="text-sm font-bold mt-3">Contraintes consultées</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <strong>holidays</strong> avec <code>priority ≥ 2</code> (jours
            fériés bloquants : Aïd, légaux),
          </li>
          <li>
            <strong>company_closures</strong> (fermetures boutique, globales ou
            par département),
          </li>
          <li>
            <strong>fixed_off_days</strong> de l&apos;employé (par exemple
            « toujours OFF le dimanche »),
          </li>
          <li>
            <strong>time_off_requests</strong> approuvés (vacances, raisons
            personnelles),
          </li>
          <li>
            <strong>employee_unavailabilities</strong> (créneaux ponctuels non
            dispo),
          </li>
          <li>
            <strong>conflits horaires</strong> : pas deux shifts qui se
            chevauchent.
          </li>
        </ul>
      </Section>

      {/* 2. Phase 2 */}
      <Section
        icon={<Zap className="h-4 w-4 text-warn" />}
        title="2. Phase 2 — heures supplémentaires au cas par cas"
      >
        <p>
          Si la phase 1 n&apos;a pas pu couvrir toute la demande (shifts{" "}
          <em>uncovered</em>), un bouton <strong>« Voir les options »</strong>{" "}
          s&apos;affiche dans le solver. Il propose :
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            la liste des employés candidats, triée par <strong>moins
            d&apos;heures déjà faites</strong> (équité),
          </li>
          <li>
            un choix individuel par employé : <Badge tone="muted">Refuser</Badge>{" "}
            <Badge tone="success">×1.25</Badge>{" "}
            <Badge tone="warn">×1.5</Badge>{" "}
            <Badge tone="danger">×2</Badge>,
          </li>
          <li>
            une pause <strong>15 min minimum</strong> entre un shift contractuel
            et un shift OT le même jour.
          </li>
        </ul>
        <p className="text-xs text-ink-3">
          L&apos;admin/RH valide → le shift est créé avec{" "}
          <code className="bg-surface-2 px-1 rounded">is_overtime=true</code> et
          le multiplicateur correspondant.
        </p>
      </Section>

      {/* 3. Coefficients rush */}
      <Section
        icon={<Clock className="h-4 w-4 text-violet" />}
        title="3. Coefficients de rush horaire"
      >
        <p className="text-sm">
          Le solver priorise les <strong>seniors</strong> sur les créneaux
          « pic » (intensité &gt;{" "}
          <code className="bg-surface-2 px-1 rounded">
            {RUSH_INTENSITY_PEAK_THRESHOLD}
          </code>
          ). Voici le profil global actuel (site_id = NULL) :
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs mt-2 border border-line rounded-md overflow-hidden">
            <thead className="bg-surface-2 text-ink-3 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-2 py-1.5">Plage</th>
                <th className="text-left px-2 py-1.5">Label</th>
                <th className="text-right px-2 py-1.5">Coefficient</th>
              </tr>
            </thead>
            <tbody>
              {segments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-2 py-2 text-center text-ink-3">
                    Aucun segment global défini.
                  </td>
                </tr>
              ) : (
                segments
                  .slice()
                  .sort((a, b) => a.start_minute - b.start_minute)
                  .map((s, i) => (
                    <tr
                      key={i}
                      className="border-t border-line"
                    >
                      <td className="px-2 py-1.5 tabular-nums">
                        {fmtMin(s.start_minute)}–{fmtMin(s.end_minute)}
                      </td>
                      <td className="px-2 py-1.5 text-ink-2">
                        {s.label ?? "—"}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-bold ${
                          s.weight >= 2
                            ? "text-danger"
                            : s.weight >= 1.4
                              ? "text-warn"
                              : "text-ink"
                        }`}
                      >
                        ×{s.weight.toFixed(1)}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        <h3 className="text-sm font-bold mt-3">
          Multiplicateurs samedi & jours fériés
        </h3>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            Samedi&nbsp;: <strong>×1.5</strong> par défaut (pondération de
            l&apos;intensité du créneau).
          </li>
          <li>
            Jour férié&nbsp;: <strong>×2.0</strong> par défaut (priorisation
            seniors et déclenchement d&apos;OT plus probable).
          </li>
          <li>
            Période forte (Soldes, fêtes)&nbsp;:{" "}
            <strong>×{`{seasonal_events.staff_multiplier}`}</strong> — voir
            section 4 ci-dessous.
          </li>
        </ul>
      </Section>

      {/* 4. Saisonnalités */}
      <Section
        icon={<Sparkles className="h-4 w-4 text-info" />}
        title="4. Saisonnalités"
      >
        <p className="text-sm">
          Les <strong>seasonal_events</strong> (Ramadan, Aïd, Soldes, Saint-Nicolas…)
          appliquent un multiplicateur d&apos;effectif (
          <code className="bg-surface-2 px-1 rounded">staff_multiplier</code>)
          à la demande de couverture phase 1. Événements actifs ou à venir
          dans les 90 jours :
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs mt-2 border border-line rounded-md overflow-hidden">
            <thead className="bg-surface-2 text-ink-3 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-2 py-1.5">Nom</th>
                <th className="text-left px-2 py-1.5">Type</th>
                <th className="text-left px-2 py-1.5">Période</th>
                <th className="text-right px-2 py-1.5">Multiplicateur</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-center text-ink-3">
                    Aucun événement saisonnier configuré sur les 90 jours.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="px-2 py-1.5 font-bold">{e.name}</td>
                    <td className="px-2 py-1.5">
                      <Badge
                        tone={
                          e.kind === "peak"
                            ? "warn"
                            : e.kind === "closed"
                              ? "danger"
                              : "muted"
                        }
                      >
                        {e.kind}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {fmtDate(e.start_date)} → {fmtDate(e.end_date)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {e.staff_multiplier !== null
                        ? `×${e.staff_multiplier}`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 5. Liens utiles */}
      <Section
        icon={<Users className="h-4 w-4 text-success" />}
        title="5. Aller plus loin"
      >
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <Link
              href="/admin/seasonal"
              className="text-gold-dark hover:underline"
            >
              Gérer les saisonnalités
            </Link>
          </li>
          <li>
            <Link
              href="/admin/holidays"
              className="text-gold-dark hover:underline"
            >
              Fériés & fermetures boutique
            </Link>
          </li>
          <li>
            <Link
              href="/admin/settings"
              className="text-gold-dark hover:underline"
            >
              Paramètres org (multiplicateurs rush, IA, etc.)
            </Link>
          </li>
          <li>
            <Link
              href="/admin/overtime-audit"
              className="text-gold-dark hover:underline"
            >
              Audit heures sup (reclassification douce)
            </Link>
          </li>
        </ul>
      </Section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h2 className="text-base font-bold flex items-center gap-2 mb-2">
        {icon}
        {title}
      </h2>
      <div className="space-y-2 text-sm text-ink-2">{children}</div>
    </Card>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "success" | "warn" | "danger" | "muted" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "bg-success-light text-success"
      : tone === "warn"
        ? "bg-warn-light text-warn"
        : tone === "danger"
          ? "bg-danger-light text-danger"
          : tone === "info"
            ? "bg-info-light text-info"
            : "bg-surface-2 text-ink-2";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-bold tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}
