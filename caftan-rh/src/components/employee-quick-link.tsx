"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarRange,
  Calendar,
  Eye,
  IdCard,
  Printer,
  MessageSquare,
  Clock,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NameAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViewerRole, useViewerProfileId } from "./user-role-context";
import { createDmAction } from "@/app/chat/actions";
import { lookupProfileIdByEmployeeAction } from "@/lib/employee-lookup-actions";
import { startOfWeek, toISODate } from "@/lib/planning";

export type EmployeeQuickLinkProps = {
  employeeId: string;
  fullName: string;
  /** Profile id pré-résolu pour un DM direct (évite un fetch). */
  profileId?: string | null;
  /** Affiche un avatar à gauche du nom. */
  withAvatar?: boolean;
  avatarSize?: "sm" | "md";
  className?: string;
  /** Sous-titre (poste, magasin, etc). */
  subtitle?: React.ReactNode;
  /** "inline" : tout sur une ligne. "block" : avatar à gauche, nom + sous-titre à droite. */
  variant?: "inline" | "block";
  /** Force la route au clic principal sur le nom (sinon : calendrier admin ou 360° selon rôle). */
  primaryHref?: string;
  /** Affiche un suffixe à droite du nom (ex. badge). */
  suffix?: React.ReactNode;
  /** Si true, le composant entier prend toute la largeur. */
  fullWidth?: boolean;
};

function defaultPrimaryHref(role: string, employeeId: string): string {
  if (role === "admin" || role === "rh" || role === "manager") {
    return `/planning/employees/${employeeId}/calendar?view=week`;
  }
  return `/360/employee/${employeeId}`;
}

/**
 * Lien cliquable unifié pour un employé. Affiche un nom (et optionnellement
 * un avatar / sous-titre), et propose un menu d'actions adapté au rôle viewer.
 *
 * - Clic sur le nom : route principale (calendrier admin pour managers+,
 *   360° sinon).
 * - Clic sur le chevron : ouvre un menu contextuel avec actions filtrées
 *   par rôle.
 *
 * Mobile-friendly : chevron ≥ 40×40 hit area.
 */
export function EmployeeQuickLink({
  employeeId,
  fullName,
  profileId: initialProfileId,
  withAvatar = false,
  avatarSize = "sm",
  className,
  subtitle,
  variant = "inline",
  primaryHref,
  suffix,
  fullWidth = false,
}: EmployeeQuickLinkProps) {
  const role = useViewerRole();
  const myProfileId = useViewerProfileId();
  const router = useRouter();
  const [resolvingDm, setResolvingDm] = React.useState(false);
  const [resolvedProfileId, setResolvedProfileId] = React.useState<string | null>(
    initialProfileId ?? null,
  );

  const isAdminOrHR = role === "admin" || role === "rh";
  const isManagerOrAbove = isAdminOrHR || role === "manager";

  const href = primaryHref ?? defaultPrimaryHref(role, employeeId);

  const mondayISO = React.useMemo(() => toISODate(startOfWeek(new Date())), []);

  async function handleSendMessage() {
    if (resolvingDm) return;
    setResolvingDm(true);
    try {
      let pid = resolvedProfileId;
      if (!pid) {
        const r = await lookupProfileIdByEmployeeAction(employeeId);
        if (r.error) {
          toast.error(r.error);
          return;
        }
        pid = r.profileId;
        setResolvedProfileId(pid);
      }
      if (!pid) {
        toast.error("Cet employé n'a pas de compte messagerie.");
        return;
      }
      if (myProfileId && pid === myProfileId) {
        toast.error("Tu ne peux pas t'envoyer un message à toi-même.");
        return;
      }
      const r = await createDmAction(pid);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (r.roomId) router.push(`/chat/${r.roomId}`);
    } finally {
      setResolvingDm(false);
    }
  }

  const avatarCls =
    avatarSize === "md" ? "h-8 w-8 text-[10px]" : "h-7 w-7 text-[10px]";

  // Bloc nom + (avatar) — c'est ce qui est <Link>.
  const nameContent =
    variant === "block" ? (
      <>
        {withAvatar ? <NameAvatar name={fullName} className={avatarCls} /> : null}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{fullName}</div>
          {subtitle ? (
            <div className="text-xs text-ink-3 truncate">{subtitle}</div>
          ) : null}
        </div>
      </>
    ) : (
      <>
        {withAvatar ? <NameAvatar name={fullName} className={avatarCls} /> : null}
        <span className="font-bold truncate">{fullName}</span>
        {subtitle ? (
          <span className="text-xs text-ink-3 truncate">· {subtitle}</span>
        ) : null}
      </>
    );

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        fullWidth ? "w-full" : "",
        className,
      )}
    >
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-2 min-w-0 hover:text-gold-dark transition-colors",
          fullWidth ? "flex-1" : "",
        )}
      >
        {nameContent}
      </Link>
      {suffix}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions pour ${fullName}`}
            className={cn(
              "shrink-0 inline-flex items-center justify-center rounded-md border border-line text-ink-3",
              "hover:border-gold hover:text-gold-dark transition-colors",
              // Mobile : 40×40 hit area / desktop : compact 24×24.
              "h-10 w-10 sm:h-6 sm:w-6",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuLabel className="truncate">{fullName}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isManagerOrAbove ? (
            <>
              <DropdownMenuItem asChild>
                <Link
                  href={`/planning/employees/${employeeId}/calendar?view=week`}
                  className="cursor-pointer"
                >
                  <CalendarDays className="h-3.5 w-3.5" /> Planning (semaine)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/planning/employees/${employeeId}/calendar?view=month`}
                  className="cursor-pointer"
                >
                  <CalendarRange className="h-3.5 w-3.5" /> Planning (mois)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/planning/calendar?week=${mondayISO}#emp-${employeeId}`}
                  className="cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" /> Modifier shifts (sem)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          {isAdminOrHR ? (
            <DropdownMenuItem asChild>
              <Link
                href={`/planning/employees/${employeeId}`}
                className="cursor-pointer"
              >
                <IdCard className="h-3.5 w-3.5" /> Fiche admin
              </Link>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem asChild>
            <Link href={`/360/employee/${employeeId}`} className="cursor-pointer">
              <Eye className="h-3.5 w-3.5" /> Vue 360°
            </Link>
          </DropdownMenuItem>

          {isAdminOrHR ? (
            <>
              <DropdownMenuItem asChild>
                <Link
                  href={`/planning/employees/${employeeId}/print?weeks=4`}
                  target="_blank"
                  className="cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimer planning
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/admin/presence?employee=${employeeId}`}
                  className="cursor-pointer"
                >
                  <Clock className="h-3.5 w-3.5" /> Pointage récent
                </Link>
              </DropdownMenuItem>
            </>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
            disabled={resolvingDm}
            className="cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Envoyer un message
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/**
 * Variante "block" — avatar + nom multi-lignes, full width. Pratique pour
 * remplacer une ligne complète dans une liste.
 */
export function EmployeeQuickLinkBlock(
  props: Omit<EmployeeQuickLinkProps, "variant" | "withAvatar" | "fullWidth">,
) {
  return (
    <EmployeeQuickLink
      {...props}
      variant="block"
      withAvatar
      fullWidth
    />
  );
}
