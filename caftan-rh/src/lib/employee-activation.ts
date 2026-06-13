// Karim 2026-06-13 (Phase 2 cycle de vie) : activation du compte EMPLOYÉ à la
// signature du contrat (MASTER_SPEC §4 : « Activation automatique du compte
// employé à la signature : accès immédiat rôle Employé »).
//
// Avant : un embauché gardait role='candidate' (le rôle 'employee' n'existait
// pas). Maintenant, à la signature, on promeut son profil candidate -> employee
// pour distinguer proprement candidat et travailleur (routage /candidat vs /me,
// libellés, futures règles). On ne touche JAMAIS un compte admin/rh/manager ni
// un compte déjà 'employee' (jamais de rétrogradation).

import "server-only";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export async function activateEmployeeAccount(
  admin: Admin,
  employeeId: string,
): Promise<{ activated: boolean }> {
  try {
    const { data: emp } = await admin
      .from("employees")
      .select("profile_id")
      .eq("id", employeeId)
      .maybeSingle();
    const profileId = (emp as { profile_id?: string | null } | null)?.profile_id;
    if (!profileId) return { activated: false };

    const { data: prof } = await admin
      .from("profiles")
      .select("role")
      .eq("id", profileId)
      .maybeSingle();
    const role = (prof as { role?: string } | null)?.role;
    // On ne promeut QUE depuis 'candidate' (jamais staff, jamais re-promotion).
    if (role !== "candidate") return { activated: false };

    const { error } = await admin
      .from("profiles")
      .update({ role: "employee" })
      .eq("id", profileId);
    if (error) return { activated: false };
    return { activated: true };
  } catch {
    return { activated: false };
  }
}
