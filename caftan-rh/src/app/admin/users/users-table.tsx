"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { NameAvatar } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/config";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { updateUserRoleAction, updateUserDepartmentAction, updateUserPermissionsAction } from "./actions";
import { toast } from "sonner";
import type { AppRole } from "@/types/database.types";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  department_id: string | null;
  permissions: string[] | null;
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

  function togglePermission(u: UserRow, key: string, checked: boolean) {
    const current = u.permissions ?? [];
    const next = checked ? Array.from(new Set([...current, key])) : current.filter((p) => p !== key);
    startTransition(async () => {
      const r = await updateUserPermissionsAction(u.id, next);
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Permissions mises à jour.");
        router.refresh();
      }
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

          {/* Karim 2026-07-08 : permissions par utilisateur. L'admin a tout
              implicitement (cases cochées + verrouillées). Sinon l'admin coche
              par user pour octroyer le droit (ex. fiches de paie). */}
          <div className="flex items-center gap-3 basis-full sm:basis-auto flex-wrap">
            {PERMISSION_KEYS.map((perm) => {
              const isAdmin = u.role === "admin";
              const checked = isAdmin || (u.permissions ?? []).includes(perm.key);
              return (
                <label
                  key={perm.key}
                  className={`flex items-center gap-1.5 text-xs ${isAdmin ? "text-ink-3" : "text-ink-2 cursor-pointer"}`}
                  title={isAdmin ? "L'admin a toutes les permissions" : undefined}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line accent-gold-dark"
                    checked={checked}
                    disabled={pending || isAdmin}
                    onChange={(e) => togglePermission(u, perm.key, e.target.checked)}
                  />
                  {perm.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
