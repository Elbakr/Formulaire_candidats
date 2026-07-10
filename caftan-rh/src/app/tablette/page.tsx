// Karim 2026-07-09 (Phase 3) : page « Tablette planning ».
// Karim 2026-07-10 : VERROUILLAGE. Le chemin devinable /tablette est désormais
// réservé à l'admin connecté (PREVIEW). L'accès magasin se fait EXCLUSIVEMENT
// via le chemin obscur /t/<jeton> (jeton d'appareil configuré dans
// /admin/settings). Visiteur externe sans session admin -> 404.

import { notFound } from "next/navigation";
import { isAdminSession } from "@/lib/auth";
import { TabletteClient } from "./tablette-client";

export const dynamic = "force-dynamic";

export default async function TablettePage() {
  const admin = await isAdminSession();
  if (!admin) notFound();
  return <TabletteClient />;
}
