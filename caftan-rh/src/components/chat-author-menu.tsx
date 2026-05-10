"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, MessageSquare, CalendarDays } from "lucide-react";
import { NameAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViewerProfileId, useViewerRole } from "./user-role-context";
import { createDmAction } from "@/app/chat/actions";
import { lookupEmployeeIdByProfileAction } from "@/lib/employee-lookup-actions";

type Props = {
  authorProfileId: string | null;
  authorName: string;
  className?: string;
};

/**
 * Avatar cliquable utilisé dans les bulles de chat. Ouvre un menu compact :
 * - Envoyer un message (DM direct)
 * - Vue 360° (resolved depuis profile_id)
 * - Planning (admin/rh/manager) — resolved
 *
 * Préserve le rendu compact du chat — pas de chevron à côté du nom.
 */
export function ChatAuthorMenu({ authorProfileId, authorName, className }: Props) {
  const role = useViewerRole();
  const myProfileId = useViewerProfileId();
  const router = useRouter();
  const [employeeId, setEmployeeId] = React.useState<string | null>(null);
  const [resolved, setResolved] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const isManagerOrAbove = role === "admin" || role === "rh" || role === "manager";
  const isSelf = !!myProfileId && authorProfileId === myProfileId;

  // Lookup paresseux : déclenché à l'ouverture du menu.
  async function ensureResolved() {
    if (resolved || !authorProfileId) return;
    const r = await lookupEmployeeIdByProfileAction(authorProfileId);
    setEmployeeId(r.employeeId);
    setResolved(true);
  }

  async function handleSendDm() {
    if (!authorProfileId || isSelf) return;
    setPending(true);
    try {
      const r = await createDmAction(authorProfileId);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (r.roomId) router.push(`/chat/${r.roomId}`);
    } finally {
      setPending(false);
    }
  }

  if (!authorProfileId) {
    return <NameAvatar name={authorName} className={className} />;
  }

  return (
    <DropdownMenu onOpenChange={(o) => { if (o) void ensureResolved(); }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions pour ${authorName}`}
          className="rounded-md focus:outline-none focus:ring-2 focus:ring-gold"
        >
          <NameAvatar name={authorName} className={className} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuLabel className="truncate">{authorName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isSelf ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void handleSendDm();
            }}
            disabled={pending}
            className="cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Envoyer un message
          </DropdownMenuItem>
        ) : null}
        {employeeId ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/360/employee/${employeeId}`} className="cursor-pointer">
                <Eye className="h-3.5 w-3.5" /> Vue 360°
              </Link>
            </DropdownMenuItem>
            {isManagerOrAbove ? (
              <DropdownMenuItem asChild>
                <Link
                  href={`/planning/employees/${employeeId}/calendar?view=week`}
                  className="cursor-pointer"
                >
                  <CalendarDays className="h-3.5 w-3.5" /> Planning
                </Link>
              </DropdownMenuItem>
            ) : null}
          </>
        ) : resolved ? (
          <DropdownMenuItem disabled className="text-ink-3 italic">
            Pas un employé
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
