"use client";

import * as React from "react";

export type ViewerRole = "admin" | "rh" | "manager" | "candidate" | "employee" | string;

type ViewerContextValue = {
  role: ViewerRole;
  profileId: string | null;
};

const Ctx = React.createContext<ViewerContextValue>({ role: "candidate", profileId: null });

export function ViewerRoleProvider({
  role,
  profileId,
  children,
}: {
  role: ViewerRole;
  profileId: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo<ViewerContextValue>(
    () => ({ role, profileId }),
    [role, profileId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Retourne le rôle du viewer connecté. Si appelé hors provider,
 * retourne "candidate" par défaut (mode dégradé safe : aucun lien admin).
 */
export function useViewerRole(): ViewerRole {
  return React.useContext(Ctx).role;
}

/** Retourne le profile_id du viewer (utile pour éviter les "DM avec moi-même"). */
export function useViewerProfileId(): string | null {
  return React.useContext(Ctx).profileId;
}

export function useIsManagerOrAbove(): boolean {
  const r = useViewerRole();
  return r === "admin" || r === "rh" || r === "manager";
}

export function useIsHRorAbove(): boolean {
  const r = useViewerRole();
  return r === "admin" || r === "rh";
}
