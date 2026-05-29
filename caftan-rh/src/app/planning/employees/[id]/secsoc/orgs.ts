// Karim 2026-05-29 : extracted from actions.ts car les fichiers "use server"
// ne peuvent pas exporter des fonctions sync (Next.js 16 strict).

export type SecsocOrg = "amd_megastore" | "caftan_factory";

export type OrgInfo = {
  name: string;
  bce: string | null;
  address: string;
  cp: string;
};

export const ORGS: Record<SecsocOrg, OrgInfo> = {
  amd_megastore: {
    name: "AMD Megastore SRL",
    bce: "0660.936.422",
    address: "Schaerbeek",
    cp: "201",
  },
  caftan_factory: {
    name: "Caftan Factory",
    bce: null,
    address: "Bruxelles",
    cp: "201",
  },
};

export function getSecsocOrgs(): Array<{ key: SecsocOrg; name: string }> {
  return (Object.keys(ORGS) as SecsocOrg[]).map((k) => ({
    key: k,
    name: ORGS[k].name,
  }));
}
