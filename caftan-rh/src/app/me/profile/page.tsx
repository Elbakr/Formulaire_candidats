import { Bell } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { PushEnableButton } from "@/components/push-enable-button";
import { getPublicVapidKey } from "@/lib/push-notify";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";

export default async function MyProfilePage() {
  const { profile } = await requireProfile();
  const publicVapid = getPublicVapidKey();
  const locale = await getLocale();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("profile.title", locale)}</h1>
        <p className="text-sm text-ink-2">{t("profile.subtitle", locale)}</p>
      </div>
      {publicVapid ? (
        <Card>
          <div className="p-4 flex items-center gap-3 flex-wrap">
            <div className="h-9 w-9 rounded-md bg-gold-light text-gold-dark flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-bold">{t("profile.push.title", locale)}</div>
              <div className="text-xs text-ink-2">{t("profile.push.body", locale)}</div>
            </div>
            <PushEnableButton publicKey={publicVapid} />
          </div>
        </Card>
      ) : null}
      <Card>
        <ProfileForm profile={profile} locale={locale} />
      </Card>
    </div>
  );
}
