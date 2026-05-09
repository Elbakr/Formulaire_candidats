"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { saveCandidateAdminAction } from "../actions-admin";
import { toast } from "sonner";

type Candidate = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nationality: string | null;
  nrn: string | null;
  cin_number: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  iban: string | null;
  bic: string | null;
  bank_holder: string | null;
  transport_type: string | null;
  transport_subscription: string | null;
  transport_price: string | null;
  distance_km: number | null;
  langs: Record<string, string> | null;
  wanted_contract_type: string | null;
  work_time_pref: string | null;
  available_from: string | null;
  planned_unavailability: string | null;
};

const LANG_LIST = ["Français", "Arabe", "Néerlandais", "Anglais"];
const LANG_LEVELS = ["", "Débutant", "Intermédiaire", "Courant", "Maternelle"];

export function CandidateAdminForm({ candidate }: { candidate: Candidate }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveCandidateAdminAction(candidate.id, fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Dossier mis à jour.");
        })
      }
      className="space-y-5"
    >
      <Section title="🪪 Identification">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Nom complet" name="full_name" defaultValue={candidate.full_name} />
          <Field label="Email" name="email" defaultValue={candidate.email} type="email" />
          <Field label="Téléphone" name="phone" defaultValue={candidate.phone ?? ""} type="tel" />
          <Field label="Date de naissance" name="birth_date" defaultValue={candidate.birth_date ?? ""} type="date" />
          <Field label="Lieu de naissance" name="birth_place" defaultValue={candidate.birth_place ?? ""} />
          <Field label="Nationalité" name="nationality" defaultValue={candidate.nationality ?? ""} />
          <Field label="N° de registre national (11 chiffres)" name="nrn" defaultValue={candidate.nrn ?? ""} placeholder="XX.XX.XX-XXX.XX" />
          <Field label="N° carte d'identité" name="cin_number" defaultValue={candidate.cin_number ?? ""} />
          <Field label="Adresse" name="address" defaultValue={candidate.address ?? ""} />
          <Field label="Code postal" name="postal_code" defaultValue={candidate.postal_code ?? ""} />
          <Field label="Ville" name="city" defaultValue={candidate.city ?? ""} />
          <Field label="Pays" name="country" defaultValue={candidate.country ?? "BE"} />
        </div>
      </Section>

      <Section title="💳 Coordonnées bancaires">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="IBAN" name="iban" defaultValue={candidate.iban ?? ""} placeholder="BE00 0000 0000 0000" />
          <Field label="BIC/SWIFT" name="bic" defaultValue={candidate.bic ?? ""} />
          <Field label="Titulaire du compte" name="bank_holder" defaultValue={candidate.bank_holder ?? ""} />
        </div>
      </Section>

      <Section title="🚇 Transport domicile-travail">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Type" name="transport_type" defaultValue={candidate.transport_type ?? ""} placeholder="STIB / SNCB / Voiture / Vélo / À pied" />
          <Field label="Abonnement" name="transport_subscription" defaultValue={candidate.transport_subscription ?? ""} placeholder="STIB Tout Bruxelles…" />
          <Field label="Prix" name="transport_price" defaultValue={candidate.transport_price ?? ""} placeholder="ex. 52€/mois" />
          <Field label="Distance (km)" name="distance_km" defaultValue={candidate.distance_km != null ? String(candidate.distance_km) : ""} type="number" />
        </div>
      </Section>

      <Section title="📅 Disponibilités & contrat">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Contrat souhaité" name="wanted_contract_type" defaultValue={candidate.wanted_contract_type ?? ""} placeholder="CDI / CDD / Étudiant / Flexi / Intérim" />
          <Field label="Temps de travail" name="work_time_pref" defaultValue={candidate.work_time_pref ?? ""} placeholder="Temps plein / partiel / les deux" />
          <Field label="Disponible à partir du" name="available_from" defaultValue={candidate.available_from ?? ""} type="date" />
          <div className="md:col-span-2">
            <Label htmlFor="planned_unavailability">Indisponibilités prévues</Label>
            <Textarea id="planned_unavailability" name="planned_unavailability" rows={2} defaultValue={candidate.planned_unavailability ?? ""} placeholder="ex. vacances 15-30 août, examens juin…" />
          </div>
        </div>
      </Section>

      <Section title="🗣 Langues parlées">
        <div className="grid md:grid-cols-2 gap-3">
          {LANG_LIST.map((lang) => {
            const cur = candidate.langs?.[lang] ?? "";
            return (
              <div key={lang}>
                <Label>{lang}</Label>
                <Select name={`lang_${lang}`} defaultValue={cur}>
                  <SelectTrigger><SelectValue placeholder="Niveau" /></SelectTrigger>
                  <SelectContent>
                    {LANG_LEVELS.map((lv) => <SelectItem key={lv || "none"} value={lv || "none"}>{lv || "—"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="flex justify-end pt-3 border-t border-line">
        <Button type="submit" variant="gold" size="lg" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le dossier"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="p-3 border-b border-line text-[11px] font-bold uppercase tracking-wider text-ink-2">{title}</div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

function Field({
  label, name, defaultValue = "", type = "text", placeholder,
}: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} type={type} placeholder={placeholder} />
    </div>
  );
}
