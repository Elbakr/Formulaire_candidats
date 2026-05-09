import { requireProfile } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";

export default async function MyProfilePage() {
  const { profile } = await requireProfile();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mon profil</h1>
        <p className="text-sm text-ink-2">Informations personnelles utilisées dans tes candidatures.</p>
      </div>
      <Card>
        <ProfileForm profile={profile} />
      </Card>
    </div>
  );
}
