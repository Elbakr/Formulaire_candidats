// Karim 2026-05-29 : page admin /admin/payslips
// - Liste batches + payslips classes par employee + periode
// - Upload PDF groupe via dropzone
// - Pour chaque payslip : QR EPC, marquer paye, envoyer au travailleur

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, CheckCircle2, Clock, Calendar, Users, Euro, Hourglass } from "lucide-react";
import { type PayslipRow } from "./payslips-table";
import { UploadDropzone } from "./upload-dropzone";
import { BatchRow } from "./batch-row";
import { PayslipsView } from "./payslips-view";
import { OffboardingButton } from "./offboarding-button";

export const dynamic = "force-dynamic";

export default async function AdminPayslipsPage(props: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole(["admin", "rh"]);
  const admin = createAdminClient();

  const [{ data: payslips }, { data: batches }, { data: bankAccounts }] = await Promise.all([
    admin
      .from("payslips")
      .select(`
        id, employee_id, employer_org_key, period_year, period_month, period_label,
        gross_amount, net_amount, advance_deducted, amount_to_pay,
        pdf_storage_path, pdf_filename, qr_png_data_url, qr_epc_payload,
        is_secondary, scheduled_payment_date, paired_with_payslip_id,
        payment_status, paid_at, paid_amount, created_at, hrconsult_doc_ref,
        employee:employees(id, full_name, email, iban, preferred_language)
      `)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .order("employee_id", { ascending: true, nullsFirst: true })
      .order("is_secondary", { ascending: true })
      .limit(500),
    admin
      .from("payslip_batches")
      .select("id, employer_org_key, source, source_filename, payslips_count, status, error_message, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("employer_bank_accounts")
      .select("employer_org_key, holder_name, iban, bic, bank_name"),
  ]);

  const allRowsRaw = (payslips ?? []) as unknown as PayslipRow[];

  // Karim 2026-05-31 : enrichit chaque payslip avec city du site primaire de l employee.
  // Pour les sites Schaerbeek/Molenbeek -> Bruxelles, Anvers -> Anvers.
  const empIds = Array.from(new Set(allRowsRaw.map((r) => r.employee_id).filter((x): x is string => !!x)));
  const cityByEmployee = new Map<string, string>();
  if (empIds.length > 0) {
    const { data: assigns } = await admin
      .from("site_assignments")
      .select("employee_id, is_primary, site:sites(city)")
      .in("employee_id", empIds)
      .eq("is_primary", true);
    for (const a of (assigns ?? []) as Array<{ employee_id: string; site: { city: string | null } | null }>) {
      if (a.site?.city) {
        const c = a.site.city.toLowerCase();
        const normalized = c.includes("anver") ? "Anvers" : "Bruxelles";
        cityByEmployee.set(a.employee_id, normalized);
      }
    }
  }
  const allRows: PayslipRow[] = allRowsRaw.map((r) => ({
    ...r,
    employee_city: r.employee_id ? cityByEmployee.get(r.employee_id) ?? null : null,
  }));
  // Karim 2026-05-30 : init filter via query param ?filter=unpaid|paid|all
  // Le state filtre est ensuite gere CLIENT-SIDE (PayslipsView) pour
  // changement instantané sans refresh.
  const filterParam = ((await props?.searchParams)?.filter ?? "all") as "all" | "unpaid" | "paid";

  const totalPending = allRows.filter((r) => r.payment_status === "pending").length;
  const totalScheduled = allRows.filter((r) => r.payment_status === "scheduled").length;
  const totalPaid = allRows.filter((r) => r.payment_status === "paid").length;
  // Karim 2026-05-30 : fiches "à venir" (scheduled avec date future)
  const todayMs = Date.now();
  const upcomingFiches = allRows.filter(
    (r) => r.payment_status === "scheduled" && r.scheduled_payment_date && new Date(r.scheduled_payment_date).getTime() > todayMs,
  );
  const nextUpcoming = upcomingFiches
    .map((r) => ({ ...r, daysAway: Math.ceil((new Date(r.scheduled_payment_date!).getTime() - todayMs) / 86_400_000) }))
    .sort((a, b) => a.daysAway - b.daysAway);
  const nextUpcomingDays = nextUpcoming[0]?.daysAway ?? null;
  // Montant restant a payer (pending + scheduled)
  const amountToPay = allRows
    .filter((r) => r.payment_status === "pending" || r.payment_status === "scheduled")
    .reduce((sum, r) => sum + Number(r.amount_to_pay ?? 0), 0);
  // Montant deja paye (toutes fiches payees, sum paid_amount ou amount_to_pay)
  const amountPaid = allRows
    .filter((r) => r.payment_status === "paid")
    .reduce((sum, r) => sum + Number(r.paid_amount ?? r.amount_to_pay ?? 0), 0);
  // Nombre de personnes distinctes payées vs restant
  const paidEmployees = new Set(allRows.filter((r) => r.payment_status === "paid" && r.employee_id).map((r) => r.employee_id));
  const unpaidEmployees = new Set(
    allRows
      .filter((r) => (r.payment_status === "pending" || r.payment_status === "scheduled") && r.employee_id)
      .map((r) => r.employee_id),
  );

  const amdBank = bankAccounts?.find((b) => b.employer_org_key === "amd_megastore");
  const ibanReady = amdBank && !amdBank.iban.includes("BE00 0000");

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7" />
            Fiches de paie
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload du PDF groupe HR Consult, split automatique par employé, QR EPC SEPA pour paiement BNP.
          </p>
        </div>
      </div>

      {!ibanReady && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            L IBAN AMD Megastore n est pas configuré. Les QR EPC ne seront pas générés tant que ce
            n est pas fait. Va dans la page admin pour le saisir.
          </div>
        </div>
      )}

      {upcomingFiches.length > 0 && (
        <Card className="border-purple-300 bg-purple-50 p-4 flex items-center gap-3">
          <Hourglass className="w-6 h-6 text-purple-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-purple-900">
              {upcomingFiches.length} fiche{upcomingFiches.length > 1 ? "s" : ""} de paie à venir
              {nextUpcomingDays !== null && (
                <span className="ml-2 text-purple-700">
                  (la prochaine dans {nextUpcomingDays} jour{nextUpcomingDays > 1 ? "s" : ""})
                </span>
              )}
            </div>
            <div className="text-xs text-purple-800 mt-1 space-y-0.5">
              {nextUpcoming.slice(0, 3).map((r) => (
                <div key={r.id}>
                  • {r.employee?.full_name ?? "Non associée"} —{" "}
                  {Number(r.amount_to_pay).toFixed(2)} € — disponible le{" "}
                  <strong>{r.scheduled_payment_date}</strong> (dans {r.daysAway} j)
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Euro className="w-3.5 h-3.5 text-amber-600" /> Reste à payer
          </div>
          <div className="text-2xl font-bold mt-1 text-amber-700">{amountToPay.toFixed(2)} €</div>
          <div className="text-xs text-muted-foreground">
            {totalPending + totalScheduled} fiches · {unpaidEmployees.size} personne{unpaidEmployees.size > 1 ? "s" : ""}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Déjà payé
          </div>
          <div className="text-2xl font-bold mt-1 text-green-700">{amountPaid.toFixed(2)} €</div>
          <div className="text-xs text-muted-foreground">
            {totalPaid} fiche{totalPaid > 1 ? "s" : ""} · {paidEmployees.size} personne{paidEmployees.size > 1 ? "s" : ""}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> En attente
          </div>
          <div className="text-2xl font-bold mt-1">{totalPending}</div>
          {totalScheduled > 0 && (
            <div className="text-xs text-amber-700 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> +{totalScheduled} différées (J+6)
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Total fiches
          </div>
          <div className="text-2xl font-bold mt-1">{allRows.length}</div>
          <div className="text-xs text-muted-foreground">{paidEmployees.size + unpaidEmployees.size} employees</div>
        </Card>
      </div>

      {/* Karim 2026-06-02 : actions globales (upload + envoi départ) */}
      <div className="flex flex-wrap items-center gap-2">
        <OffboardingButton />
      </div>

      {/* Karim 2026-05-30 : filtres CLIENT-SIDE instantanés (statut + employeur) */}
      <PayslipsView allRows={allRows} initialStatusFilter={filterParam} />

      <UploadDropzone />

      {batches && batches.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Derniers imports</h2>
          <div className="space-y-2">
            {batches.slice(0, 5).map((b) => (
              <BatchRow key={b.id} batch={b} />
            ))}
          </div>
        </Card>
      )}

    </div>
  );
}
