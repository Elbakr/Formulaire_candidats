// Karim 2026-06-04 : detection doublons employees par NRN.
// Approche conservative : on AFFICHE les doublons, on offre "archiver"
// (status=archived) pas de DELETE. Les employees ont trop de donnees
// liees (contrats, payslips, Dimona, leave) pour un merge auto risque.

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { DuplicateEmployeesTable } from "./duplicate-employees-table";

type Emp = {
  id: string;
  full_name: string;
  email: string | null;
  nrn: string | null;
  phone: string | null;
  birth_date: string | null;
  status: string;
  contract_type: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_hours: number | null;
  profile_id: string | null;
  candidate_id: string | null;
  created_at: string | null;
};

function normalizeNrn(nrn: string | null): string {
  return (nrn ?? "").replace(/\D/g, "");
}

function normalizeName(s: string | null): string {
  return (s ?? "").toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

export default async function EmployeesDuplicatesPage() {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const { data: empsRaw } = await admin
    .from("employees")
    .select("id, full_name, email, nrn, phone, birth_date, status, contract_type, start_date, end_date, weekly_hours, profile_id, candidate_id, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  const emps = (empsRaw ?? []) as Emp[];

  const byNrn = new Map<string, Emp[]>();
  const byNameBirth = new Map<string, Emp[]>();
  const byEmail = new Map<string, Emp[]>();

  for (const e of emps) {
    const nrn = normalizeNrn(e.nrn);
    if (nrn.length >= 11) {
      if (!byNrn.has(nrn)) byNrn.set(nrn, []);
      byNrn.get(nrn)!.push(e);
    }
    if (e.full_name && e.birth_date) {
      const k = `${normalizeName(e.full_name)}|${e.birth_date}`;
      if (!byNameBirth.has(k)) byNameBirth.set(k, []);
      byNameBirth.get(k)!.push(e);
    }
    if (e.email) {
      const k = e.email.toLowerCase().trim();
      if (!byEmail.has(k)) byEmail.set(k, []);
      byEmail.get(k)!.push(e);
    }
  }

  type Group = { criterion: string; key: string; emps: Emp[] };
  const groups: Group[] = [];
  const seen = new Set<string>();
  function add(criterion: string, key: string, list: Emp[]) {
    if (list.length < 2) return;
    const idsKey = list.map((e) => e.id).sort().join(",");
    if (seen.has(idsKey)) return;
    seen.add(idsKey);
    // Sort par data filled
    list.sort((a, b) => {
      const score = (e: Emp) => [e.nrn, e.email, e.phone, e.birth_date, e.start_date, e.profile_id, e.candidate_id].filter(Boolean).length;
      return score(b) - score(a);
    });
    groups.push({ criterion, key, emps: list });
  }
  for (const [k, l] of byNrn) add("NRN identique", k, l);
  for (const [k, l] of byNameBirth) add("Nom + naissance", k, l);
  for (const [k, l] of byEmail) add("Email identique", k, l);

  groups.sort((a, b) => b.emps.length - a.emps.length);
  const totalDups = groups.reduce((s, g) => s + g.emps.length - 1, 0);

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-bold">Doublons employés</h1>
        <p className="text-xs text-ink-3 mt-1">
          {groups.length} groupe(s) detecte(s) · {totalDups} doublon(s) potentiel(s) sur {emps.length} employes.
          Detection : NRN, nom+naissance, email.
        </p>
        <div className="text-[11px] bg-amber-50 border border-amber-200 rounded p-2 mt-2 text-amber-900">
          ⚠ Pour les employés, pas de fusion automatique (trop de FK : contrats, payslips,
          Dimona, congés, formations...). Actions disponibles : <strong>archiver</strong>
          (status=archived, conservation legale) ou <strong>ouvrir</strong> chaque fiche
          pour decider manuellement.
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="border border-emerald-300 bg-emerald-50 rounded p-4 text-sm text-emerald-900">
          ✓ Aucun doublon employé détecté (NRN, nom+naissance, email).
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <DuplicateEmployeesTable key={`${g.criterion}-${g.key}`} criterion={g.criterion} groupKey={g.key} emps={g.emps} />
          ))}
        </div>
      )}
    </div>
  );
}
