"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileSpreadsheet } from "lucide-react";
import { downloadXlsx } from "@/lib/xlsx-export";
import { tenureLabel, seniorTier, seniorTierLabel } from "@/lib/tenure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { createEmployeeAction } from "../actions";
import { toast } from "sonner";

export type EmployeeForExport = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  contract_type: string | null;
  weekly_hours: number | null;
  status: string;
  start_date: string | null;
  department: { name: string } | null;
};

export function ExportEmployeesButton({ employees }: { employees: EmployeeForExport[] }) {
  function exportXlsx() {
    downloadXlsx(`employes-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Employés",
        rows: employees,
        columns: [
          { key: "full_name", header: "Nom", width: 25 },
          { key: "email", header: "Email", width: 30 },
          { key: "phone", header: "Téléphone", width: 18 },
          { key: "job_title", header: "Poste", width: 22 },
          { key: (r) => r.department?.name ?? "", header: "Service", width: 18 },
          { key: "contract_type", header: "Contrat", width: 12 },
          { key: "weekly_hours", header: "H/sem", width: 8 },
          { key: "start_date", header: "Date entrée", width: 12 },
          {
            key: (r) => (r.start_date ? tenureLabel(r.start_date) : ""),
            header: "Ancienneté",
            width: 16,
          },
          {
            key: (r) =>
              r.start_date
                ? seniorTierLabel(seniorTier(r.start_date, r.contract_type))
                : "",
            header: "Niveau",
            width: 12,
          },
          { key: "status", header: "Statut", width: 12 },
        ],
      },
    ]);
  }

  return (
    <Button variant="outline" onClick={exportXlsx}>
      <FileSpreadsheet className="h-4 w-4" /> Export Excel
    </Button>
  );
}

export function EmployeesActions({ departments }: { departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deptId, setDeptId] = useState("none");
  const [contract, setContract] = useState("CDI");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold"><Plus className="h-4 w-4" /> Nouvel employé</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un employé</DialogTitle>
          <DialogDescription>Pour les recrutements hors plateforme.</DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            fd.set("contract_type", contract);
            if (deptId !== "none") fd.set("department_id", deptId);
            startTransition(async () => {
              const r = await createEmployeeAction(fd);
              if (r?.error) toast.error(r.error);
              else {
                toast.success("Employé ajouté.");
                setOpen(false);
                router.refresh();
              }
            });
          }}
          className="space-y-3 px-5 py-3"
        >
          <div>
            <Label htmlFor="full_name">Nom complet *</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div>
            <Label htmlFor="job_title">Poste</Label>
            <Input id="job_title" name="job_title" placeholder="Vendeur, couturier…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contrat</Label>
              <Select value={contract} onValueChange={setContract}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CDI">CDI</SelectItem>
                  <SelectItem value="CDD">CDD</SelectItem>
                  <SelectItem value="Étudiant">Étudiant</SelectItem>
                  <SelectItem value="Intérim">Intérim</SelectItem>
                  <SelectItem value="Freelance">Freelance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="weekly_hours">H/semaine</Label>
              <Input id="weekly_hours" name="weekly_hours" type="number" min={1} max={50} defaultValue={38} />
            </div>
          </div>
          <div>
            <Label>Service</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="start_date">Date de début</Label>
            <Input id="start_date" name="start_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} />
          </div>
          <DialogFooter className="-mx-5 -mb-3 mt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="submit" variant="gold" disabled={pending}>{pending ? "…" : "Ajouter"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
