"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSettingsAction } from "./actions";
import { toast } from "sonner";

type Settings = {
  org_name: string;
  email_signature: string | null;
  timezone: string;
  default_language: string;
  logo_url: string | null;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveSettingsAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Paramètres enregistrés.");
        })
      }
      className="p-5 space-y-3 max-w-xl"
    >
      <div>
        <Label htmlFor="org_name">Nom de l'organisation</Label>
        <Input id="org_name" name="org_name" defaultValue={initial.org_name} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="timezone">Fuseau horaire</Label>
          <Input id="timezone" name="timezone" defaultValue={initial.timezone} />
        </div>
        <div>
          <Label htmlFor="default_language">Langue par défaut</Label>
          <Input id="default_language" name="default_language" defaultValue={initial.default_language} />
        </div>
      </div>
      <div>
        <Label htmlFor="logo_url">URL du logo</Label>
        <Input id="logo_url" name="logo_url" type="url" defaultValue={initial.logo_url ?? ""} placeholder="https://..." />
      </div>
      <div>
        <Label htmlFor="email_signature">Signature email</Label>
        <Textarea
          id="email_signature"
          name="email_signature"
          rows={4}
          defaultValue={initial.email_signature ?? ""}
          placeholder="-- L'équipe CaftanRH ..."
        />
      </div>
      <Button type="submit" variant="gold" disabled={pending}>
        {pending ? "…" : "Enregistrer"}
      </Button>
    </form>
  );
}
