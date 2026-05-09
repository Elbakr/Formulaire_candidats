"use client";

import { useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDepartmentAction, deleteDepartmentAction } from "./actions";
import { toast } from "sonner";

type Dept = { id: string; name: string };

export function DepartmentsList({ initialDepartments }: { initialDepartments: Dept[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            const r = await addDepartmentAction(fd);
            if (r?.error) toast.error(r.error);
            else {
              toast.success("Service ajouté.");
              formRef.current?.reset();
              router.refresh();
            }
          })
        }
        className="p-3 border-b border-line flex gap-2"
      >
        <Input name="name" placeholder="Nom du service" required minLength={2} className="flex-1" />
        <Button type="submit" variant="gold" disabled={pending}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
      </form>

      {initialDepartments.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-3">Aucun service.</div>
      ) : (
        <div className="divide-y divide-line">
          {initialDepartments.map((d) => (
            <div key={d.id} className="p-3 flex items-center gap-3">
              <span className="flex-1 font-semibold text-sm">{d.name}</span>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Supprimer le service "${d.name}" ?`)) return;
                  startTransition(async () => {
                    const r = await deleteDepartmentAction(d.id);
                    if (r?.error) toast.error(r.error);
                    else router.refresh();
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
