"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "./actions";
import { toast } from "sonner";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
};

export function ProfileForm({ profile }: { profile: Profile }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await updateProfileAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success("Profil mis à jour.");
        })
      }
      className="p-5 space-y-3 max-w-lg"
    >
      <div>
        <Label htmlFor="full_name">Nom complet</Label>
        <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} required />
      </div>
      <div>
        <Label htmlFor="phone">Téléphone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
      </div>
      <div>
        <Label>Email</Label>
        <Input value={profile.email} disabled />
      </div>
      <Button type="submit" variant="gold" disabled={pending}>{pending ? "…" : "Enregistrer"}</Button>
    </form>
  );
}
