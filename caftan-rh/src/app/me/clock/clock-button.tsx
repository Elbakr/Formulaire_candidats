"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clockAction } from "./actions";
import { toast } from "sonner";

export function ClockButton({
  employeeId,
  isClockedIn,
  todayShiftId,
}: {
  employeeId: string;
  isClockedIn: boolean;
  todayShiftId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={isClockedIn ? "danger" : "success"}
      size="lg"
      disabled={pending}
      className="text-base h-14 px-8"
      onClick={() => {
        startTransition(async () => {
          const r = await clockAction({
            employeeId,
            kind: isClockedIn ? "out" : "in",
            shiftId: todayShiftId,
          });
          if (r?.error) toast.error(r.error);
          else {
            toast.success(isClockedIn ? "Sortie enregistrée." : "Arrivée enregistrée.");
            router.refresh();
          }
        });
      }}
    >
      {isClockedIn ? <><LogOut className="h-5 w-5" /> Pointer le départ</> : <><LogIn className="h-5 w-5" /> Pointer l'arrivée</>}
    </Button>
  );
}
