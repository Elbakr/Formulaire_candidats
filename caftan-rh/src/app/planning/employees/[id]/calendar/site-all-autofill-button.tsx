"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { autoFillSiteAllEmployeesContractualAction } from "@/app/planning/employees/[id]/auto-fill-actions";

export function SiteAllEmployeesAutoFillButton({
  siteId,
  siteCode,
  weekISO,
}: {
  siteId: string;
  siteCode: string;
  weekISO: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function exec() {
    if (
      !window.confirm(
        `Boucher contractuel pour TOUS les employés du site ${siteCode} (semaine ${weekISO}) ? Lance le solver pour chaque membre en parallèle.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await autoFillSiteAllEmployeesContractualAction({ siteId, weekISO });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      const errs = r.per_employee.filter((p) => p.error);
      const success = r.per_employee.filter((p) => !p.error);
      const msg = `${success.length} employé(s) traités · ${r.total_created} shift(s) créés · ${r.total_reclassified} OT reclassés · ${r.total_ot_pending} OT en attente.`;
      if (errs.length > 0) {
        toast.warning(
          `${msg} ⚠ ${errs.length} échec(s) : ${errs.map((e) => e.full_name).slice(0, 3).join(", ")}${errs.length > 3 ? "…" : ""}`,
          { duration: 10000 },
        );
      } else {
        toast.success(msg, { duration: 7000 });
      }
      router.refresh();
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={exec}
      disabled={pending}
      title={`Boucher le contractuel pour tous les employés du site ${siteCode}`}
      className="border-gold/40 hover:bg-gold-light"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
      <Users className="h-3.5 w-3.5" />
      Boucher tout le site
    </Button>
  );
}
