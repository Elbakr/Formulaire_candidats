"use client";

// Karim 2026-05-28 : panneau "Devraient etre presents" - shifts today sans IN.
// 1 clic pour marquer un employee present (insert IN manuel) si il est la
// physiquement mais son pointage Tuya n est pas remonte.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { managerOverrideClockAction } from "./actions";

type Expected = {
  employee_id: string;
  full_name: string;
  site_code: string | null;
  site_id: string | null;
  start_time: string;
  end_time: string;
};

export function ExpectedPresentPanel({ expected }: { expected: Expected[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function handleMarkPresent(emp: Expected) {
    if (confirmingId !== emp.employee_id) {
      setConfirmingId(emp.employee_id);
      // Auto-reset apres 4s si pas confirme
      setTimeout(() => setConfirmingId((cur) => cur === emp.employee_id ? null : cur), 4000);
      return;
    }
    startTransition(async () => {
      const res = await managerOverrideClockAction({
        employeeId: emp.employee_id,
        action: "in",
        timestamp: new Date().toISOString(),
        reason: `Marquage manuel present (shift ${emp.start_time.slice(0, 5)}-${emp.end_time.slice(0, 5)})`,
        siteId: emp.site_id,
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success(`${emp.full_name} marquée présente.`);
      setConfirmingId(null);
      router.refresh();
    });
  }

  if (expected.length === 0) return null;

  return (
    <Card>
      <div className="px-3 py-2 border-b border-line flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <h2 className="font-bold text-sm">Devraient être présent·e·s (shifts non pointés)</h2>
        <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-amber-700">
          {expected.length}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {expected.map((e) => {
          const isConfirming = confirmingId === e.employee_id;
          return (
            <li key={e.employee_id} className="p-2 flex items-center gap-2 text-sm hover:bg-surface-2/40">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/planning/employees/${e.employee_id}/prestations?view=week`}
                  className="font-bold text-blue-700 hover:underline truncate block"
                  title="Voir prestations"
                >
                  {e.full_name}
                </Link>
                <div className="text-[11px] text-ink-3 tabular-nums">
                  Shift {e.start_time.slice(0, 5)}–{e.end_time.slice(0, 5)}
                  {e.site_code ? ` · site ${e.site_code}` : ""}
                </div>
              </div>
              <Button
                variant={isConfirming ? "default" : "outline"}
                size="sm"
                onClick={() => handleMarkPresent(e)}
                disabled={pending}
                className={isConfirming ? "bg-success hover:bg-success/90 text-white" : ""}
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1">
                  {isConfirming ? "Confirmer" : "Marquer présente"}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="px-3 py-1.5 text-[10px] text-ink-3 italic border-t border-line bg-surface-2/30">
        Insère un clock-IN manuel maintenant (source: manual_admin). Utile si l&apos;empreinte n&apos;est pas remontée Tuya.
      </div>
    </Card>
  );
}
