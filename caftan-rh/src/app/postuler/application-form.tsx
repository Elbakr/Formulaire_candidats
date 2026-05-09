"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { COUNTRIES } from "@/lib/config";
import { submitPublicApplication } from "./actions";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function ApplicationForm({ jobId }: { jobId: string | null }) {
  const [pending, startTransition] = useTransition();
  const [country, setCountry] = useState("BE");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="text-center py-10">
        <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
        <h3 className="text-lg font-bold">Merci !</h3>
        <p className="text-sm text-ink-2 mt-2 max-w-sm mx-auto">
          Ta candidature est bien reçue. Nous reviendrons vers toi par email rapidement.
        </p>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        if (jobId) fd.set("job_id", jobId);
        fd.set("country", country);
        startTransition(async () => {
          const res = await submitPublicApplication(fd);
          if (res?.error) toast.error(res.error);
          else {
            toast.success("Candidature envoyée.");
            setDone(true);
          }
        });
      }}
      className="space-y-3"
    >
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="full_name">Nom complet *</Label>
          <Input id="full_name" name="full_name" required minLength={2} />
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" name="phone" type="tel" />
        </div>
        <div>
          <Label htmlFor="birth_date">Date de naissance</Label>
          <Input id="birth_date" name="birth_date" type="date" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="address">Adresse</Label>
          <Input id="address" name="address" />
        </div>
        <div>
          <Label htmlFor="postal_code">Code postal</Label>
          <Input id="postal_code" name="postal_code" />
        </div>
        <div>
          <Label htmlFor="city">Ville</Label>
          <Input id="city" name="city" />
        </div>
        <div>
          <Label>Pays</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="nrn">NRN <span className="text-ink-3 normal-case">(BE, optionnel)</span></Label>
          <Input id="nrn" name="nrn" placeholder="XX.XX.XX-XXX.XX" />
        </div>
      </div>

      <div>
        <Label htmlFor="motivation">Motivation</Label>
        <Textarea id="motivation" name="motivation" rows={5} placeholder="Pourquoi ce poste ? Qu'est-ce qui te motive ?" />
      </div>

      <div>
        <Label htmlFor="cv">CV (PDF, max 5 Mo)</Label>
        <Input id="cv" name="cv" type="file" accept="application/pdf,.pdf,.doc,.docx" />
      </div>

      <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
        {pending ? "Envoi…" : "Envoyer ma candidature"}
      </Button>

      <p className="text-[11px] text-ink-3 text-center">
        En envoyant ce formulaire, tu acceptes le traitement de tes données pour le processus de recrutement.
      </p>
    </form>
  );
}
