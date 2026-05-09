"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { retroAttachInbound } from "@/lib/inbound/process";

export async function attachInboundAction(inboundId: string, applicationId: string) {
  await requireRole(["admin", "rh", "manager"]);
  if (!inboundId || !applicationId) return { error: "Identifiants manquants." };
  try {
    await retroAttachInbound(inboundId, applicationId);
    revalidatePath("/rh/messages/unmatched");
    revalidatePath("/rh/messages");
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
