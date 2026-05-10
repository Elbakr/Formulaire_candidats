"use client";

// Client UI pour /admin/holidays.
// 3 onglets : fériés légaux, vacances scolaires, fermetures boutique.
// + une grille calendrier 12 mois × 31 jours qui colore chaque case selon la
//   nature du jour (férié / vacances / fermeture / week-end).
//
// Les CRUD sont câblés sur des server actions dans ./actions.ts.

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  RotateCcw,
  Calendar as CalendarIcon,
  GraduationCap,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addHolidayAction,
  deleteHolidayAction,
  toggleHolidayActiveAction,
  reseedBelgianHolidaysAction,
  addSchoolBreakAction,
  deleteSchoolBreakAction,
  addCompanyClosureAction,
  deleteCompanyClosureAction,
} from "./actions";

type Holiday = {
  id: string;
  date: string;
  label: string;
  kind: "legal" | "school_break" | "company_closure" | "event_other";
  country: string | null;
  region: string | null;
  recurring_yearly: boolean | null;
  is_active: boolean | null;
  notes: string | null;
};
type SchoolBreak = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  region: string | null;
};
type Closure = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  department_id: string | null;
  reason: string | null;
  created_at: string | null;
};
type Department = { id: string; name: string };

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const KIND_LABELS: Record<Holiday["kind"], string> = {
  legal: "Férié légal",
  school_break: "Vacances",
  company_closure: "Fermeture",
  event_other: "Autre",
};

function fmtDate(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function daysInMonth(year: number, monthIdx0: number): number {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function isoOf(year: number, month0: number, day: number): string {
  const m = String(month0 + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${m}-${dd}`;
}

export function HolidaysAdmin({
  currentYear,
  holidays,
  schoolBreaks,
  closures,
  departments,
}: {
  currentYear: number;
  holidays: Holiday[];
  schoolBreaks: SchoolBreak[];
  closures: Closure[];
  departments: Department[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [viewYear, setViewYear] = useState(currentYear);

  // Dialogs
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [closureDialogOpen, setClosureDialogOpen] = useState(false);

  const holidayFormRef = useRef<HTMLFormElement>(null);
  const breakFormRef = useRef<HTMLFormElement>(null);
  const closureFormRef = useRef<HTMLFormElement>(null);

  // Map département.id → nom
  const deptName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  // Pour l'affichage calendrier, on filtre les éléments concernant viewYear
  const yearStart = `${viewYear}-01-01`;
  const yearEnd = `${viewYear}-12-31`;

  const yearHolidays = useMemo(
    () => holidays.filter((h) => h.date >= yearStart && h.date <= yearEnd && h.is_active !== false),
    [holidays, yearStart, yearEnd],
  );
  const yearBreaks = useMemo(
    () => schoolBreaks.filter((b) => b.end_date >= yearStart && b.start_date <= yearEnd),
    [schoolBreaks, yearStart, yearEnd],
  );
  const yearClosures = useMemo(
    () => closures.filter((c) => c.end_date >= yearStart && c.start_date <= yearEnd),
    [closures, yearStart, yearEnd],
  );

  function refresh() {
    router.refresh();
  }

  function onAddHoliday(fd: FormData) {
    startTransition(async () => {
      const r = await addHolidayAction(fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Jour férié ajouté.");
        holidayFormRef.current?.reset();
        setHolidayDialogOpen(false);
        refresh();
      }
    });
  }

  function onDeleteHoliday(id: string, label: string) {
    if (!confirm(`Supprimer "${label}" ?`)) return;
    startTransition(async () => {
      const r = await deleteHolidayAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Supprimé.");
        refresh();
      }
    });
  }

  function onToggleActive(id: string, isActive: boolean) {
    startTransition(async () => {
      const r = await toggleHolidayActiveAction(id, isActive);
      if (r?.error) toast.error(r.error);
      else refresh();
    });
  }

  function onReseed() {
    if (!confirm(`Réinitialiser les 10 jours fériés légaux belges pour ${viewYear} ? (les entrées existantes ne sont pas écrasées)`)) return;
    startTransition(async () => {
      const r = await reseedBelgianHolidaysAction(viewYear);
      if ("error" in r && r.error) {
        toast.error(r.error);
      } else if ("inserted" in r) {
        toast.success(`${r.inserted} ajoutés, ${r.skipped} déjà présents.`);
        refresh();
      }
    });
  }

  function onAddBreak(fd: FormData) {
    startTransition(async () => {
      const r = await addSchoolBreakAction(fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Période ajoutée.");
        breakFormRef.current?.reset();
        setBreakDialogOpen(false);
        refresh();
      }
    });
  }

  function onDeleteBreak(id: string, label: string) {
    if (!confirm(`Supprimer "${label}" ?`)) return;
    startTransition(async () => {
      const r = await deleteSchoolBreakAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Supprimé.");
        refresh();
      }
    });
  }

  function onAddClosure(fd: FormData) {
    startTransition(async () => {
      const r = await addCompanyClosureAction(fd);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Fermeture ajoutée.");
        closureFormRef.current?.reset();
        setClosureDialogOpen(false);
        refresh();
      }
    });
  }

  function onDeleteClosure(id: string, label: string) {
    if (!confirm(`Supprimer la fermeture "${label}" ?`)) return;
    startTransition(async () => {
      const r = await deleteCompanyClosureAction(id);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Supprimée.");
        refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Jours fériés &amp; fermetures</h1>
          <p className="text-sm text-ink-2">
            Calendrier officiel + fermetures spécifiques (formations, inventaire, événements). Les jours fériés sont automatiquement exclus du planning.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setViewYear(viewYear - 1)} title="Année précédente">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewYear(currentYear)}>
            Cette année
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewYear(viewYear + 1)} title="Année suivante">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="ml-2 inline-flex items-center px-2.5 py-1 rounded-md bg-ink text-white text-xs font-bold tabular-nums">
            {viewYear}
          </span>
          <Button variant="gold" size="sm" onClick={onReseed} disabled={pending} title="Re-seed les 10 fériés légaux belges">
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser fériés BE
          </Button>
        </div>
      </div>

      {/* Calendrier visuel 12 mois × 31 jours */}
      <YearCalendar
        year={viewYear}
        holidays={yearHolidays}
        schoolBreaks={yearBreaks}
        closures={yearClosures}
        deptName={deptName}
      />

      <Tabs defaultValue="legal" className="space-y-3">
        <TabsList>
          <TabsTrigger value="legal">
            <CalendarIcon className="h-3.5 w-3.5" /> Fériés légaux
            <span className="ml-1.5 text-[10px] text-ink-3 font-mono">{yearHolidays.length}</span>
          </TabsTrigger>
          <TabsTrigger value="school">
            <GraduationCap className="h-3.5 w-3.5" /> Vacances scolaires
            <span className="ml-1.5 text-[10px] text-ink-3 font-mono">{yearBreaks.length}</span>
          </TabsTrigger>
          <TabsTrigger value="closures">
            <Building2 className="h-3.5 w-3.5" /> Fermetures boutique
            <span className="ml-1.5 text-[10px] text-ink-3 font-mono">{yearClosures.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="legal">
          <Card>
            <CardHeader className="flex flex-row items-center">
              <div className="flex-1">
                <CardTitle>Jours fériés &amp; événements ponctuels</CardTitle>
                <CardDescription>Affichés sur le planning et exclus de l'auto-génération.</CardDescription>
              </div>
              <Button variant="gold" size="sm" onClick={() => setHolidayDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {yearHolidays.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-3">
                  Aucun jour férié pour {viewYear}. Clique <strong>Réinitialiser fériés BE</strong> pour seeder les 10 jours légaux belges.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
                      <tr>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Libellé</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Région</th>
                        <th className="p-2 text-left">Statut</th>
                        <th className="p-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {yearHolidays.map((h) => (
                        <tr key={h.id} className="hover:bg-surface-2">
                          <td className="p-2 font-mono text-xs">{fmtDate(h.date)}</td>
                          <td className="p-2 font-bold">{h.label}</td>
                          <td className="p-2">
                            <Badge variant="muted" className="text-[10px]">{KIND_LABELS[h.kind]}</Badge>
                          </td>
                          <td className="p-2 text-xs text-ink-3">{h.region ?? h.country ?? "—"}</td>
                          <td className="p-2">
                            {h.is_active ? (
                              <Badge variant="hired" className="text-[10px]">Actif</Badge>
                            ) : (
                              <Badge variant="muted" className="text-[10px]">Désactivé</Badge>
                            )}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => onToggleActive(h.id, !h.is_active)}
                              title={h.is_active ? "Désactiver" : "Activer"}
                            >
                              {h.is_active ? "Désactiver" : "Activer"}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={pending}
                              onClick={() => onDeleteHoliday(h.id, h.label)}
                              title="Supprimer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="school">
          <Card>
            <CardHeader className="flex flex-row items-center">
              <div className="flex-1">
                <CardTitle>Vacances scolaires</CardTitle>
                <CardDescription>Indicatif pour anticiper l'activité (étudiants & familles).</CardDescription>
              </div>
              <Button variant="gold" size="sm" onClick={() => setBreakDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {yearBreaks.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-3">Aucune période enregistrée.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
                      <tr>
                        <th className="p-2 text-left">Période</th>
                        <th className="p-2 text-left">Libellé</th>
                        <th className="p-2 text-left">Région</th>
                        <th className="p-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {yearBreaks.map((b) => (
                        <tr key={b.id} className="hover:bg-surface-2">
                          <td className="p-2 font-mono text-xs whitespace-nowrap">
                            {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
                          </td>
                          <td className="p-2 font-bold">{b.label}</td>
                          <td className="p-2 text-xs text-ink-3">{b.region ?? "—"}</td>
                          <td className="p-2 text-right">
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={pending}
                              onClick={() => onDeleteBreak(b.id, b.label)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closures">
          <Card>
            <CardHeader className="flex flex-row items-center">
              <div className="flex-1">
                <CardTitle>Fermetures boutique</CardTitle>
                <CardDescription>
                  Formation, inventaire, événement… Liées à un département ou globales.
                </CardDescription>
              </div>
              <Button variant="gold" size="sm" onClick={() => setClosureDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Ajouter une fermeture
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {yearClosures.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-3">Aucune fermeture programmée.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-3">
                      <tr>
                        <th className="p-2 text-left">Période</th>
                        <th className="p-2 text-left">Libellé</th>
                        <th className="p-2 text-left">Boutique</th>
                        <th className="p-2 text-left">Motif</th>
                        <th className="p-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {yearClosures.map((c) => (
                        <tr key={c.id} className="hover:bg-surface-2">
                          <td className="p-2 font-mono text-xs whitespace-nowrap">
                            {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                          </td>
                          <td className="p-2 font-bold">{c.label}</td>
                          <td className="p-2 text-xs">
                            {c.department_id ? deptName.get(c.department_id) ?? "(supprimé)" : (
                              <Badge variant="gold" className="text-[10px]">Toutes boutiques</Badge>
                            )}
                          </td>
                          <td className="p-2 text-xs text-ink-3 max-w-[260px] truncate" title={c.reason ?? ""}>
                            {c.reason ?? "—"}
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={pending}
                              onClick={() => onDeleteClosure(c.id, c.label)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Dialog : ajouter un jour férié ──────────────────────────── */}
      <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
        <DialogContent className="max-w-[480px]">
          <form ref={holidayFormRef} action={onAddHoliday}>
            <DialogHeader>
              <DialogTitle>Ajouter un jour férié</DialogTitle>
              <DialogDescription>Date unique (sans récurrence dynamique).</DialogDescription>
            </DialogHeader>
            <div className="p-5 space-y-3">
              <div>
                <Label htmlFor="hol-date">Date</Label>
                <Input id="hol-date" name="date" type="date" required />
              </div>
              <div>
                <Label htmlFor="hol-label">Libellé</Label>
                <Input id="hol-label" name="label" placeholder="ex: Pont du 1er mai" required />
              </div>
              <div>
                <Label htmlFor="hol-kind">Type</Label>
                <select
                  id="hol-kind"
                  name="kind"
                  defaultValue="legal"
                  className="flex h-9 w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-3 py-2 text-sm"
                >
                  <option value="legal">Férié légal</option>
                  <option value="event_other">Autre événement</option>
                </select>
              </div>
              <div>
                <Label htmlFor="hol-region">Région (optionnel)</Label>
                <Input id="hol-region" name="region" placeholder="ex: BE-BRU" />
              </div>
              <div>
                <Label htmlFor="hol-notes">Notes</Label>
                <Input id="hol-notes" name="notes" placeholder="optionnel" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setHolidayDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" size="sm" disabled={pending}>
                Ajouter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog : ajouter des vacances scolaires ─────────────────── */}
      <Dialog open={breakDialogOpen} onOpenChange={setBreakDialogOpen}>
        <DialogContent className="max-w-[480px]">
          <form ref={breakFormRef} action={onAddBreak}>
            <DialogHeader>
              <DialogTitle>Ajouter des vacances scolaires</DialogTitle>
            </DialogHeader>
            <div className="p-5 space-y-3">
              <div>
                <Label htmlFor="br-label">Libellé</Label>
                <Input id="br-label" name="label" placeholder="ex: Vacances de printemps 2026" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="br-start">Du</Label>
                  <Input id="br-start" name="start_date" type="date" required />
                </div>
                <div>
                  <Label htmlFor="br-end">Au</Label>
                  <Input id="br-end" name="end_date" type="date" required />
                </div>
              </div>
              <div>
                <Label htmlFor="br-region">Région</Label>
                <Input id="br-region" name="region" defaultValue="BE-BRU" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setBreakDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" size="sm" disabled={pending}>
                Ajouter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog : ajouter une fermeture ──────────────────────────── */}
      <Dialog open={closureDialogOpen} onOpenChange={setClosureDialogOpen}>
        <DialogContent className="max-w-[520px]">
          <form ref={closureFormRef} action={onAddClosure}>
            <DialogHeader>
              <DialogTitle>Programmer une fermeture</DialogTitle>
              <DialogDescription>
                Formation interne, inventaire, événement, jour de pont. Aucune affectation auto-générée
                pendant la période.
              </DialogDescription>
            </DialogHeader>
            <div className="p-5 space-y-3">
              <div>
                <Label htmlFor="cl-label">Libellé</Label>
                <Input id="cl-label" name="label" placeholder="ex: Inventaire annuel" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cl-start">Du</Label>
                  <Input id="cl-start" name="start_date" type="date" required />
                </div>
                <div>
                  <Label htmlFor="cl-end">Au</Label>
                  <Input id="cl-end" name="end_date" type="date" required />
                </div>
              </div>
              <div>
                <Label htmlFor="cl-dept">Boutique</Label>
                <select
                  id="cl-dept"
                  name="department_id"
                  defaultValue="all"
                  className="flex h-9 w-full rounded-[var(--radius-sm)] border-[1.5px] border-line bg-surface px-3 py-2 text-sm"
                >
                  <option value="all">Toutes boutiques</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cl-reason">Motif</Label>
                <Input id="cl-reason" name="reason" placeholder="optionnel" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setClosureDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="gold" size="sm" disabled={pending}>
                Programmer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Calendar 12 mois × 31 jours ──────────────────────────────────────────
//
// Une grille rapide qui colore chaque case selon sa nature dominante :
//   - week-end (gris pâle)
//   - férié légal (rouge)
//   - fermeture boutique (or)
//   - vacances scolaires (violet)
// Tooltip natif (`title`) sur chaque case avec le détail.

function YearCalendar({
  year,
  holidays,
  schoolBreaks,
  closures,
  deptName,
}: {
  year: number;
  holidays: Holiday[];
  schoolBreaks: SchoolBreak[];
  closures: Closure[];
  deptName: Map<string, string>;
}) {
  // index par date pour lookup O(1)
  const holIndex = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  function tagsFor(dateISO: string) {
    const tags: { kind: "legal" | "school_break" | "closure"; label: string }[] = [];
    const h = holIndex.get(dateISO);
    if (h) tags.push({ kind: "legal", label: h.label });
    for (const b of schoolBreaks) {
      if (dateISO >= b.start_date && dateISO <= b.end_date) {
        tags.push({ kind: "school_break", label: b.label });
      }
    }
    for (const c of closures) {
      if (dateISO >= c.start_date && dateISO <= c.end_date) {
        const where = c.department_id
          ? deptName.get(c.department_id) ?? "(boutique)"
          : "Toutes boutiques";
        tags.push({ kind: "closure", label: `${c.label} (${where})` });
      }
    }
    return tags;
  }

  function colorFor(dateISO: string, isWeekend: boolean): { bg: string; ring: string } {
    const tags = tagsFor(dateISO);
    if (tags.some((t) => t.kind === "legal")) {
      return { bg: "bg-danger-light text-danger font-bold", ring: "ring-1 ring-danger/40" };
    }
    if (tags.some((t) => t.kind === "closure")) {
      return { bg: "bg-gold-light text-gold-dark font-bold", ring: "ring-1 ring-gold/50" };
    }
    if (tags.some((t) => t.kind === "school_break")) {
      return { bg: "bg-violet-light text-violet", ring: "" };
    }
    if (isWeekend) {
      return { bg: "bg-surface-2 text-ink-3", ring: "" };
    }
    return { bg: "bg-surface text-ink-2", ring: "" };
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendrier {year}</CardTitle>
        <CardDescription>
          <span className="inline-flex items-center gap-1 mr-3">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger-light ring-1 ring-danger/40" />
            Férié légal
          </span>
          <span className="inline-flex items-center gap-1 mr-3">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gold-light ring-1 ring-gold/50" />
            Fermeture boutique
          </span>
          <span className="inline-flex items-center gap-1 mr-3">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-light" />
            Vacances scolaires
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-surface-2" />
            Week-end
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full p-3">
            {/* Header : numéros de jours 1..31 */}
            <div className="grid grid-cols-[110px_repeat(31,minmax(22px,1fr))] gap-px text-[10px] text-ink-3">
              <div></div>
              {Array.from({ length: 31 }, (_, i) => (
                <div key={i} className="text-center font-mono">{i + 1}</div>
              ))}
            </div>
            {MONTHS_FR.map((mLabel, mIdx) => {
              const dim = daysInMonth(year, mIdx);
              return (
                <div
                  key={mIdx}
                  className="grid grid-cols-[110px_repeat(31,minmax(22px,1fr))] gap-px mt-px"
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-ink-2 pr-2 self-center">
                    {mLabel}
                  </div>
                  {Array.from({ length: 31 }, (_, dIdx) => {
                    const day = dIdx + 1;
                    if (day > dim) {
                      return <div key={dIdx} className="bg-transparent" />;
                    }
                    const dateISO = isoOf(year, mIdx, day);
                    const dow = new Date(year, mIdx, day).getDay(); // 0 = dim
                    const isWe = dow === 0 || dow === 6;
                    const tags = tagsFor(dateISO);
                    const c = colorFor(dateISO, isWe);
                    const tooltip = [
                      fmtDate(dateISO),
                      ...(tags.length ? tags.map((t) => `${KIND_LABELS_SHORT[t.kind]}: ${t.label}`) : []),
                    ].join(" — ");
                    return (
                      <div
                        key={dIdx}
                        title={tooltip}
                        className={`h-6 flex items-center justify-center text-[10px] rounded-sm ${c.bg} ${c.ring}`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const KIND_LABELS_SHORT: Record<"legal" | "school_break" | "closure", string> = {
  legal: "Férié",
  school_break: "Vacances",
  closure: "Fermeture",
};
