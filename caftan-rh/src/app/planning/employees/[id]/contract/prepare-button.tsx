"use client";

import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrepareContractButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="gold" disabled={disabled || pending}>
      <Plus className="h-3.5 w-3.5" />{" "}
      {pending ? "Préparation…" : "Préparer un nouveau contrat"}
    </Button>
  );
}
