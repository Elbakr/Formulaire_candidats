"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "./actions";
import { toast } from "sonner";
import { t, type Locale } from "@/lib/i18n";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
};

export function ProfileForm({
  profile,
  locale = "fr",
}: {
  profile: Profile;
  locale?: Locale;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await updateProfileAction(fd);
          if (r?.error) toast.error(r.error);
          else toast.success(t("profile.saved_msg", locale));
        })
      }
      className="p-5 space-y-3 max-w-lg"
    >
      <div>
        <Label htmlFor="full_name">{t("profile.full_name", locale)}</Label>
        <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} required />
      </div>
      <div>
        <Label htmlFor="phone">{t("profile.phone", locale)}</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
      </div>
      <div>
        <Label>{t("profile.email", locale)}</Label>
        <Input value={profile.email} disabled />
      </div>
      <Button type="submit" variant="gold" disabled={pending}>{pending ? "…" : t("common.save", locale)}</Button>
    </form>
  );
}
