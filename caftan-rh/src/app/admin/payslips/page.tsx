// Karim 2026-05-29 : page admin /admin/payslips
// - Liste batches + payslips classes par employee + periode
// - Upload PDF groupe via dropzone
// - Pour chaque payslip : QR EPC, marquer paye, envoyer au travailleur

import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle, CheckCircle2, Clock, Calendar } from "lucide-react";
import { PayslipsTable, type PayslipRow } from "./payslips-table";
import { UploadDropzone } from "./upload-dropzone";

export const dynamic = "force-dynamic";

export default async function AdminPayslipsPage() {
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
        payment_status, paid_at, paid_amount, created_at,
        employee:employees!inner(id, full_name, email, iban, preferred_language)
      `)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
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

  const rows = (payslips ?? []) as unknown as PayslipRow[];
  const totalPending = rows.filter((r) => r.payment_status === "pending").length;
  const totalScheduled = rows.filter((r) => r.payment_status === "scheduled").length;
  const totalPaid = rows.filter((r) => r.payment_status === "paid").length;
  const totalAmount = rows
    .filter((r) => r.payment_status === "pending" || r.payment_status === "scheduled")
    .reduce((sum, r) => sum + Number(r.amount_to_pay ?? 0), 0);

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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> En attente paiement
          </div>
          <div className="text-2xl font-bold mt-1">{totalPending}</div>
          <div className="text-xs text-muted-foreground">
            {totalAmount.toFixed(2)} € total
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Différées (double fiche)
          </div>
          <div className="text-2xl font-bold mt-1">{totalScheduled}</div>
          <div className="text-xs text-muted-foreground">notif J+6 min</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Payées
          </div>
          <div className="text-2xl font-bold mt-1">{totalPaid}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total fiches</div>
          <div className="text-2xl font-bold mt-1">{rows.length}</div>
        </Card>
      </div>

      <UploadDropzone />

      {batches && batches.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Derniers imports</h2>
          <div className="space-y-2">
            {batches.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={b.status === "completed" ? "default" : b.status === "failed" ? "destructive" : "secondary"}>
                    {b.status}
                  </Badge>
                  <span className="font-mono text-xs">{b.source_filename ?? "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {b.payslips_count ?? 0} fiches · {new Date(b.created_at).toLocaleString("fr-BE")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <PayslipsTable rows={rows} />
    </div>
  );
}
