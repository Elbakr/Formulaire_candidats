import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DimonaForm } from "./dimona-form";
import { DimonaPrintButton, DeleteDimonaButton } from "./dimona-actions-client";

const ONSS_PORTAL_URL =
  "https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm";

type DimonaRow = {
  id: string;
  declaration_kind: string;
  start_date: string;
  end_date: string | null;
  worker_type: string | null;
  status: string;
  reference_number: string | null;
  declared_at: string | null;
  notes: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  declared_onss: "Déclarée à l'ONSS",
  confirmed: "Confirmée ONSS",
  rejected: "Rejetée",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  declared_onss: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default async function EmployeeDimonaPage(
  props: PageProps<"/planning/employees/[id]/dimona">,
) {
  const { id } = await props.params;
  await requireRole(["admin", "rh"]);
  const supabase = await createClient();

  const [{ data: emp }, { data: contractsRaw }, { data: dimonasRaw }, { data: orgRaw }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, nrn, start_date, end_date, contract_type")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("employee_contracts")
        .select(
          "id, contract_kind, start_date, end_date, status, signed_at, position_title",
        )
        .eq("employee_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("dimona_declarations")
        .select(
          "id, declaration_kind, start_date, end_date, worker_type, status, reference_number, declared_at, notes, created_at",
        )
        .eq("employee_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("org_settings")
        .select("org_name, org_address")
        .eq("id", 1)
        .maybeSingle(),
    ]);
  if (!emp) notFound();

  const employee = emp as {
    id: string;
    full_name: string;
    nrn: string | null;
    start_date: string | null;
    end_date: string | null;
    contract_type: string | null;
  };
  const contracts = (contractsRaw ?? []) as Array<{
    id: string;
    contract_kind: string;
    start_date: string;
    end_date: string | null;
    status: string;
    signed_at: string | null;
    position_title: string;
  }>;
  const dimonas = (dimonasRaw ?? []) as DimonaRow[];
  const org = (orgRaw ?? {}) as { org_name?: string; org_address?: string };

  const latestContract =
    contracts.find((c) => c.status === "signed") ??
    contracts.find((c) => c.status === "ready_to_sign") ??
    contracts[0] ??
    null;
  const contractReady =
    !!latestContract &&
    (latestContract.status === "ready_to_sign" || latestContract.status === "signed");
  const hasDeclared = dimonas.some(
    (d) => d.status === "declared_onss" || d.status === "confirmed",
  );

  // Date par défaut pour le form Dimona
  const defaultStart =
    latestContract?.start_date ??
    employee.start_date ??
    new Date().toISOString().slice(0, 10);
  const defaultEnd = latestContract?.end_date ?? employee.end_date ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/planning/employees/${id}`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour fiche
          </Link>
        </Button>
        <div className="flex gap-2 flex-wrap">
          {latestContract ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/planning/employees/${id}/contract/${latestContract.id}`}
              >
                <FileText className="h-3.5 w-3.5" /> Contrat
              </Link>
            </Button>
          ) : null}
          <DimonaPrintButton />
        </div>
      </div>

      <Card className="print:shadow-none print:border-0">
        <div className="p-4 border-b border-line print:border-b-2 print:border-black">
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="h-5 w-5 text-gold-dark print:text-black" />
            <h1 className="text-xl font-bold">Déclaration Dimona — {employee.full_name}</h1>
          </div>
          <p className="text-sm text-ink-2 mt-1 print:text-black">
            <strong>Pour engager légalement {employee.full_name} en Belgique,
            tu DOIS déclarer Dimona auprès de l&apos;ONSS AVANT la prise de fonction.</strong>{" "}
            CaftanRH conserve la trace ; la déclaration officielle se fait sur le
            portail ONSS.
          </p>
        </div>

        <div className="p-4 space-y-4 print:p-0 print:pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Info label="Employeur">{org.org_name ?? "Caftan Factory SRL"}</Info>
            <Info label="Adresse employeur">
              {org.org_address ?? "Rue de Brabant 230, 1030 Schaerbeek"}
            </Info>
            <Info label="Travailleur">{employee.full_name}</Info>
            <Info label="NRN">
              {employee.nrn ?? <span className="text-ink-3 italic">[À compléter]</span>}
            </Info>
            <Info label="Type contrat">{employee.contract_type ?? "—"}</Info>
            <Info label="Date début prévue">{defaultStart}</Info>
          </div>
        </div>
      </Card>

      <Card className="print:hidden">
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Étapes</h2>
        </div>
        <ol className="divide-y divide-line">
          <Step done={contractReady} text="Préparer les infos employé">
            NRN, date début, type de contrat, fonction, lieu de travail.
            {!contractReady ? (
              <span className="block text-xs text-warn mt-1">
                Prépare d&apos;abord le contrat pour générer ces infos automatiquement.
              </span>
            ) : null}
          </Step>
          <Step
            done={hasDeclared}
            text={
              <>
                Se connecter au portail{" "}
                <a
                  href={ONSS_PORTAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold-dark underline"
                >
                  Dimona ONSS
                </a>{" "}
                ou utiliser l&apos;app mobile Dimona.
              </>
            }
          >
            Authentification via eID, itsme ou token ONSS.
          </Step>
          <Step done={hasDeclared} text="Soumettre la déclaration « DIMONA IN »">
            Encoder NRN, date d&apos;entrée, type travailleur (OTH par défaut pour
            employé permanent), commission paritaire (CP 201).
          </Step>
          <Step done={hasDeclared} text="Récupérer le numéro de référence Dimona">
            L&apos;ONSS retourne un numéro unique (format DIM_xxxxxxxxx). Note-le.
          </Step>
          <Step done={hasDeclared} text="Conserver l&apos;accusé de réception">
            Sauvegarde le PDF/email de confirmation pour audit ONSS.
          </Step>
          <Step done={hasDeclared} text="Saisir le N° référence ci-dessous">
            Pour conserver la trace dans CaftanRH (voir formulaire ci-dessous).
          </Step>
        </ol>
        <div className="p-4 border-t border-line">
          <Button asChild variant="gold" size="lg">
            <a href={ONSS_PORTAL_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Ouvrir le portail Dimona ONSS
            </a>
          </Button>
        </div>
      </Card>

      <Card className="print:hidden">
        <div className="p-4 border-b border-line">
          <h2 className="font-bold text-sm">Enregistrer une déclaration Dimona</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            Une fois la Dimona soumise sur le portail ONSS, saisis ici le numéro de
            référence retourné — pour archivage et audit.
          </p>
        </div>
        <div className="p-4">
          <DimonaForm
            employeeId={id}
            defaultStartDate={defaultStart}
            defaultEndDate={defaultEnd}
            contractId={latestContract?.id ?? null}
          />
        </div>
      </Card>

      <Card className="print:shadow-none print:border print:border-black">
        <div className="p-4 border-b border-line print:border-black">
          <h2 className="font-bold text-sm">
            Déclarations Dimona enregistrées ({dimonas.length})
          </h2>
        </div>
        {dimonas.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3 print:text-black">
            <AlertTriangle className="h-5 w-5 inline-block text-warn mr-1" />
            Aucune déclaration Dimona enregistrée pour cet employé.
          </div>
        ) : (
          <ul className="divide-y divide-line print:divide-black">
            {dimonas.map((d) => (
              <li key={d.id} className="p-4 break-inside-avoid">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{d.declaration_kind}</span>
                  <span
                    className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${STATUS_CLASS[d.status] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                  {d.reference_number ? (
                    <span className="text-xs font-mono">N° {d.reference_number}</span>
                  ) : null}
                </div>
                <div className="text-xs text-ink-3 mt-1 print:text-black">
                  {d.start_date}
                  {d.end_date ? ` → ${d.end_date}` : ""} · type {d.worker_type ?? "—"}
                  {d.declared_at
                    ? ` · déclarée le ${new Date(d.declared_at).toLocaleString("fr-BE")}`
                    : ""}
                </div>
                {d.notes ? (
                  <div className="text-xs text-ink-2 italic mt-1">{d.notes}</div>
                ) : null}
                <div className="mt-1 print:hidden">
                  <DeleteDimonaButton id={d.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Bloc imprimable : signature du RH */}
      <div className="hidden print:block mt-6">
        <p className="text-xs">
          Document interne — preuve de déclaration Dimona conservée par
          l&apos;employeur conformément à l&apos;arrêté royal du 5 novembre 2002.
        </p>
        <div className="grid grid-cols-2 gap-8 mt-8">
          <div>
            <div className="font-bold text-xs uppercase mb-1">Pour l&apos;employeur</div>
            <div className="text-[10px]">{org.org_name ?? "Caftan Factory SRL"}</div>
            <div className="border-b border-black h-6 mt-6" />
            <div className="text-[10px] mt-1">Nom, signature, date</div>
          </div>
          <div>
            <div className="font-bold text-xs uppercase mb-1">Date impression</div>
            <div className="text-[10px]">
              {new Date().toLocaleDateString("fr-BE", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line pb-1 print:border-black">
      <div className="text-[10px] uppercase tracking-wider text-ink-3 print:text-black">
        {label}
      </div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

function Step({
  done,
  text,
  children,
}: {
  done: boolean;
  text: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="p-4 flex gap-3 items-start">
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-5 w-5 text-ink-3 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{text}</div>
        {children ? <div className="text-xs text-ink-3 mt-0.5">{children}</div> : null}
      </div>
    </li>
  );
}
