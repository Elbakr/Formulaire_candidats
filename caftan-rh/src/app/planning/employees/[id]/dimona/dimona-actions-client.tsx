"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteDimonaDeclarationAction } from "../contract-actions";

export function DimonaPrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      title="Imprimer cette page (récap Dimona)"
    >
      <Printer className="h-3.5 w-3.5" /> Imprimer la fiche Dimona
    </Button>
  );
}

export function DeleteDimonaButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function go() {
    if (!confirm("Supprimer cette trace de déclaration Dimona ?")) return;
    startTransition(async () => {
      const r = await deleteDimonaDeclarationAction(id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Déclaration supprimée.");
      router.refresh();
    });
  }
  return (
    <button
      onClick={go}
      disabled={pending}
      className="text-xs text-danger hover:underline inline-flex items-center gap-1"
    >
      <Trash2 className="h-3 w-3" /> Supprimer
    </button>
  );
}
