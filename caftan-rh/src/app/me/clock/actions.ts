"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export async function clockAction(args: {
  employeeId: string;
  kind: "in" | "out";
  shiftId: string | null;
}) {
  const { user } = await requireProfile();
  const supabase = await createClient();

  // Verify the employee belongs to the user
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("id", args.employeeId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!emp) return { error: "Employé non identifié." };

  const { error } = await supabase.from("clock_entries").insert({
    employee_id: args.employeeId,
    shift_id: args.shiftId,
    kind: args.kind,
    source: "web",
  });
  if (error) return { error: error.message };

  // Si clock-out et shift today → marquer le shift comme 'done'
  if (args.kind === "out" && args.shiftId) {
    await supabase.from("shifts").update({ status: "done" }).eq("id", args.shiftId);
  }

  revalidatePath("/me/clock");
  revalidatePath("/me/planning");
  return { ok: true };
}
