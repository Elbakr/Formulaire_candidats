import type { ContractEditable } from "./contract-form";

export type ContractFullData = {
  contract: ContractEditable & {
    status: "draft" | "ready_to_sign" | "signed" | "archived";
    signed_at: string | null;
    prepared_at: string | null;
  };
  org: {
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
  };
};

const PLACEHOLDER = "[À compléter manuellement]";

function v(s: string | null | undefined): string {
  if (s == null) return PLACEHOLDER;
  const t = String(s).trim();
  return t.length === 0 ? PLACEHOLDER : t;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return PLACEHOLDER;
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return PLACEHOLDER;
    return d.toLocaleDateString("fr-BE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return PLACEHOLDER;
  }
}

function fmtMoney(n: number | null | undefined, suffix = " €"): string {
  if (n == null || !Number.isFinite(n)) return PLACEHOLDER;
  return `${Number(n).toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
}

export function ContractDocument({ data }: { data: ContractFullData }) {
  const c = data.contract;
  const org = data.org;
  const fullAddress = [c.address, c.postal_code, c.city]
    .filter((p) => p && String(p).trim())
    .join(", ");
  const trialLabel = c.trial_period_weeks
    ? `${c.trial_period_weeks} semaine${c.trial_period_weeks > 1 ? "s" : ""}`
    : PLACEHOLDER;

  return (
    <article
      className="contract-doc text-black bg-white max-w-[210mm] mx-auto"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <style>{`
        @media print {
          .contract-doc { font-size: 11pt; line-height: 1.45; }
          .contract-doc h1 { font-size: 18pt; }
          .contract-doc h2 { font-size: 12pt; }
          .contract-doc article { color: #000 !important; background: #fff !important; }
        }
        .contract-doc h1 { letter-spacing: 0.04em; }
        .contract-doc h2 { letter-spacing: 0.02em; }
        .contract-doc .signature-line {
          border-bottom: 1px solid #000;
          height: 1.5rem;
          margin-top: 1.5rem;
        }
      `}</style>

      <header className="text-center mb-6">
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-700">
          {org.name}
        </div>
        <div className="text-[10px] text-gray-700">{org.address}</div>
        <h1 className="text-[20pt] font-bold uppercase tracking-wider mt-4 mb-1">
          Contrat de travail {c.contract_kind}
        </h1>
        <div className="text-[10px] text-gray-700">
          (Loi du 3 juillet 1978 relative aux contrats de travail)
        </div>
      </header>

      <section className="mb-5">
        <h2 className="text-[12pt] font-bold uppercase mb-2">Entre les soussignés</h2>
        <p className="mb-2">
          <strong>{org.name}</strong>, dont le siège social est établi à{" "}
          <strong>{org.address}</strong>
          {org.phone ? ` (tél. ${org.phone})` : ""}
          {org.email ? ` (email ${org.email})` : ""}, ci-après dénommée
          <strong> « l&apos;Employeur »</strong>,
        </p>
        <p className="text-center my-2 text-gray-700">d&apos;une part,</p>
        <p>
          <strong>et</strong>
        </p>
        <p className="my-2">
          <strong>{v(c.full_name)}</strong>, né(e) le <strong>{fmtDate(c.birth_date)}</strong>{" "}
          à <strong>{v(c.birth_place)}</strong>, numéro national{" "}
          <strong>{v(c.nrn)}</strong>, domicilié(e) {fullAddress.length > 0 ? `à ` : ""}
          <strong>{fullAddress.length > 0 ? fullAddress : PLACEHOLDER}</strong>,
          ci-après dénommé(e) <strong>« le Travailleur »</strong>,
        </p>
        <p className="text-center my-2 text-gray-700">d&apos;autre part,</p>
        <p className="italic mt-2">Il a été convenu ce qui suit :</p>
      </section>

      <Article num={1} title="Engagement">
        <p>
          L&apos;Employeur engage le Travailleur, qui accepte, en qualité de{" "}
          <strong>{v(c.position_title)}</strong>, à compter du{" "}
          <strong>{fmtDate(c.start_date)}</strong>
          {c.contract_kind === "CDI"
            ? ", pour une durée indéterminée."
            : c.end_date
              ? ` et jusqu'au ${fmtDate(c.end_date)}, dans le cadre d'un contrat à durée déterminée.`
              : ", dans le cadre d&apos;un contrat à durée déterminée."}
        </p>
        <p>
          Le lieu habituel de prestation est : <strong>{v(c.workplace)}</strong>
          {c.workplace_address ? ` (${c.workplace_address})` : ""}. L&apos;Employeur se
          réserve le droit d&apos;affecter le Travailleur, en fonction des besoins du
          service, dans l&apos;une de ses autres boutiques sur la région de Bruxelles ou
          d&apos;Anvers.
        </p>
      </Article>

      <Article num={2} title="Période d'essai">
        <p>
          Conformément aux dispositions légales applicables et à l&apos;usage en vigueur
          dans la commission paritaire compétente, les parties conviennent d&apos;une
          période d&apos;essai de <strong>{trialLabel}</strong>. Pendant cette période,
          chaque partie peut mettre fin au contrat moyennant les délais de préavis
          réduits prévus par la loi.
        </p>
      </Article>

      <Article num={3} title="Horaire de travail">
        <p>
          La durée hebdomadaire de travail est fixée à{" "}
          <strong>{c.weekly_hours} heures</strong>
          {c.monthly_hours ? ` (soit environ ${c.monthly_hours} heures par mois)` : ""}.
          Les horaires sont variables selon le planning communiqué par l&apos;Employeur,
          dans le respect du règlement de travail et de la loi du 16 mars 1971 sur
          le travail. Le jour de repos hebdomadaire est en principe le{" "}
          <strong>{v(c.weekly_rest_day)}</strong>.
        </p>
      </Article>

      <Article num={4} title="Rémunération">
        <p>
          La rémunération brute mensuelle est fixée à{" "}
          <strong>{fmtMoney(c.gross_monthly_salary)}</strong>
          {c.gross_hourly_rate
            ? ` (taux horaire de référence : ${fmtMoney(c.gross_hourly_rate, " €/h")})`
            : ""}
          . Elle est payable à terme échu, par virement bancaire, conformément à la
          loi du 12 avril 1965 sur la protection de la rémunération.
        </p>
        {c.meal_voucher_eur_per_day && Number(c.meal_voucher_eur_per_day) > 0 ? (
          <p>
            Le Travailleur bénéficie de chèques-repas d&apos;une valeur de{" "}
            <strong>{fmtMoney(c.meal_voucher_eur_per_day, " €")}</strong> par
            jour effectivement presté, dans les conditions prévues par la
            législation fiscale et sociale en vigueur.
          </p>
        ) : null}
        {c.transport_allowance ? (
          <p>
            Indemnité de transport : <strong>{c.transport_allowance}</strong>.
          </p>
        ) : null}
      </Article>

      <Article num={5} title="Vacances annuelles">
        <p>
          Le Travailleur bénéficie de{" "}
          <strong>
            {c.paid_holidays_days ?? 20} jours
          </strong>{" "}
          de vacances annuelles légales par année complète de prestation, dans les
          conditions prévues par les lois coordonnées du 28 juin 1971. Les périodes
          de vacances sont fixées de commun accord, en tenant compte des besoins
          de service (haute saison, soldes, ramadan, fin d&apos;année).
        </p>
      </Article>

      <Article num={6} title="Commission paritaire">
        <p>
          La commission paritaire compétente est la{" "}
          <strong>{v(c.joint_committee)}</strong>. Les conventions collectives de
          travail conclues au sein de cette commission sont applicables au présent
          contrat.
        </p>
      </Article>

      <Article num={7} title="Préavis et résiliation">
        <p>
          Toute rupture du contrat est régie par les dispositions de la loi du 3
          juillet 1978 relative aux contrats de travail, en particulier les articles
          37 et suivants. Les délais de préavis sont calculés conformément à la
          loi en vigueur au moment de la notification.
        </p>
      </Article>

      <Article num={8} title="Règlement de travail">
        <p>
          Le Travailleur déclare avoir reçu un exemplaire du règlement de travail
          de l&apos;Employeur et s&apos;engage à le respecter. Une copie est également
          affichée dans chaque boutique.
        </p>
      </Article>

      <Article num={9} title="Confidentialité et concurrence">
        <p>
          Le Travailleur s&apos;engage, tant pendant l&apos;exécution du contrat
          qu&apos;après sa cessation, à ne pas divulguer à des tiers les
          informations confidentielles dont il aurait eu connaissance dans
          l&apos;exercice de ses fonctions (clientèle, fournisseurs, marges, fichier
          stock, formules de fabrication, méthodes de vente).
        </p>
      </Article>

      <Article num={10} title="Dispositions diverses">
        <p>
          Le Travailleur communique sans délai à l&apos;Employeur toute modification
          de ses coordonnées (adresse, téléphone, situation familiale, compte
          bancaire). Pour tout ce qui n&apos;est pas expressément prévu au présent
          contrat, les parties s&apos;en réfèrent à la législation belge applicable
          aux contrats de travail.
        </p>
        {c.notes && c.notes.trim().length > 0 ? (
          <p className="mt-2 italic">{c.notes}</p>
        ) : null}
      </Article>

      <section className="mt-8">
        <p className="text-sm">
          Fait en deux exemplaires originaux, dont un pour chaque partie, à
          ____________________________________ le ____________________________________ .
        </p>
        <p className="text-[10px] text-gray-700 italic mt-1">
          Chaque page doit être paraphée par les deux parties.
        </p>

        <div className="grid grid-cols-2 gap-8 mt-8">
          <div>
            <div className="font-bold text-sm uppercase tracking-wider mb-1">
              Pour l&apos;Employeur
            </div>
            <div className="text-xs text-gray-700 mb-1">{org.name}</div>
            <div className="signature-line" />
            <div className="text-[10px] text-gray-700 mt-1">
              (Nom, prénom, qualité et signature, précédés de la mention « Lu et approuvé »)
            </div>
          </div>
          <div>
            <div className="font-bold text-sm uppercase tracking-wider mb-1">
              Le Travailleur
            </div>
            <div className="text-xs text-gray-700 mb-1">{v(c.full_name)}</div>
            <div className="signature-line" />
            <div className="text-[10px] text-gray-700 mt-1">
              (Signature précédée de la mention manuscrite « Lu et approuvé »)
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-8 text-[9px] text-gray-500 text-center">
        Document généré automatiquement par CaftanRH
        {c.prepared_at
          ? ` le ${new Date(c.prepared_at).toLocaleDateString("fr-BE")}`
          : ""}
        . V1 — vérifie les mentions légales propres à ta situation avant signature.
      </footer>
    </article>
  );
}

function Article({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h2 className="text-[12pt] font-bold uppercase mb-1">
        Article {num} — {title}
      </h2>
      <div className="space-y-2 text-justify">{children}</div>
    </section>
  );
}
