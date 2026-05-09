"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function markReadAction(id: string) {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/me/notifications");
  return { ok: true };
}

export async function markAllReadAction() {
  const { user } = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) return { error: error.message };
  revalidatePath("/me/notifications");
  return { ok: true };
}
