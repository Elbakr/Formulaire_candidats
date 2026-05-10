"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "./share-dialog";

/**
 * Bouton "Partager" qui ouvre le ShareDialog. Wrapper client à utiliser dans
 * une page server (page.tsx) sans avoir à promouvoir toute la page client.
 */
export function ShareButton({
  employeeId,
  employeeName,
  weekISO,
  isSelf = false,
  selfEmail,
}: {
  employeeId: string;
  employeeName: string;
  weekISO: string;
  isSelf?: boolean;
  selfEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="h-3.5 w-3.5" /> Partager
      </Button>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        employeeId={employeeId}
        employeeName={employeeName}
        weekISO={weekISO}
        isSelf={isSelf}
        selfEmail={selfEmail}
      />
    </>
  );
}
