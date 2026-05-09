"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { exportPayrollAction } from "./actions";
import { toast } from "sonner";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function PayrollExporter({ departments }: { departments: { id: string; name: string }[] }) {
  const now = new Date();
  // Default to previous month (typical payroll cutoff)
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [year, setYear] = useState<string>(String(defaultYear));
  const [month, setMonth] = useState<string>(String(defaultMonth));
  const [deptId, setDeptId] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const years = [defaultYear - 1, defaultYear, defaultYear + 1].map(String);

  function exportCsv() {
    startTransition(async () => {
      const r = await exportPayrollAction({
        year: Number(year),
        month: Number(month),
        departmentId: deptId === "all" ? null : deptId,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const blob = new Blob([r.csv ?? ""], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename ?? "payroll.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export OK — ${r.employee_count ?? 0} employés, ${Number(r.total_hours ?? 0).toFixed(1)}h.`);
    });
  }

  return (
    <div className="p-5">
      <div className="grid md:grid-cols-4 gap-3 items-end">
        <div>
          <Label>Année</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Mois</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Service</Label>
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="gold" disabled={pending} onClick={exportCsv}>
          <Download className="h-4 w-4" /> {pending ? "Export…" : "Exporter CSV"}
        </Button>
      </div>
      <div className="mt-3 text-xs text-ink-3">
        L'export agrège les shifts <strong>terminés</strong> (status=done) du mois sélectionné.
        Heures de week-end (sam/dim) et heures de nuit (22h–06h) sont comptées séparément.
      </div>
    </div>
  );
}
