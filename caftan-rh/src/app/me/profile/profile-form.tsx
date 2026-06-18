"use client";

import { useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction, autosaveProfileAction } from "./actions";
import { toast } from "sonner";
import { t, type Locale } from "@/lib/i18n";
import { useFieldAutosave } from "@/hooks/use-field-autosave";

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

  // Karim 2026-06-18 : auto-save instantané (sans soumettre). Bouton conservé.
  const save = useCallback(
    (key: string, value: string) => autosaveProfileAction({ [key]: value }),
    [],
  );
  const { autosave, savingKey, savedKeys } = useFieldAutosave(save);

  function status(key: string) {
    if (savingKey === key) return <span className="text-[10px] text-ink-3 ml-auto">enregistrement…</span>;
    if (savedKeys.has(key)) return <span className="text-[10px] font-semibold text-success ml-auto">enregistré ✓</span>;
    return null;
  }

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
        <Label htmlFor="full_name" className="flex items-center gap-1">
          {t("profile.full_name", locale)} {status("full_name")}
        </Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={profile.full_name ?? ""}
          onBlur={(e) => void autosave("full_name", e.currentTarget.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="phone" className="flex items-center gap-1">
          {t("profile.phone", locale)} {status("phone")}
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ""}
          onBlur={(e) => void autosave("phone", e.currentTarget.value)}
        />
      </div>
      <div>
        <Label>{t("profile.email", locale)}</Label>
        <Input value={profile.email} disabled />
      </div>
      <Button type="submit" variant="gold" disabled={pending}>{pending ? "…" : t("common.save", locale)}</Button>
    </form>
  );
}
