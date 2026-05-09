"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { NameAvatar } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/config";
import { updateUserRoleAction, updateUserDepartmentAction } from "./actions";
import { toast } from "sonner";
import type { AppRole } from "@/types/database.types";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  department_id: string | null;
  department: { id: string; name: string } | null;
};

export function UsersTable({ users, departments }: { users: UserRow[]; departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setRole(userId: string, role: AppRole) {
    startTransition(async () => {
      const r = await updateUserRoleAction(userId, role);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Rôle mis à jour.");
        router.refresh();
      }
    });
  }

  function setDept(userId: string, deptId: string | null) {
    startTransition(async () => {
      const r = await updateUserDepartmentAction(userId, deptId);
      if (r?.error) toast.error(r.error);
      else router.refresh();
    });
  }

  if (users.length === 0) {
    return <div className="p-8 text-center text-sm text-ink-3">Aucun utilisateur.</div>;
  }

  return (
    <div className="divide-y divide-line">
      {users.map((u) => (
        <div key={u.id} className="p-3 flex items-center gap-3 flex-wrap">
          <NameAvatar name={u.full_name ?? u.email} />
          <div className="flex-1 min-w-[180px]">
            <div className="font-bold text-sm">{u.full_name ?? "—"}</div>
            <div className="text-xs text-ink-3">{u.email}</div>
          </div>
          <Select value={u.role} onValueChange={(v) => setRole(u.id, v as AppRole)} disabled={pending}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([k, lbl]) => (
                <SelectItem key={k} value={k}>{lbl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={u.department_id ?? "none"}
            onValueChange={(v) => setDept(u.id, v === "none" ? null : v)}
            disabled={pending}
          >
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Aucun service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun service</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
