import { Card } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export default function MyMessagesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-sm text-ink-2">Échanges avec l'équipe RH concernant tes candidatures.</p>
      </div>
      <Card>
        <div className="p-10 text-center">
          <MessageSquare className="h-10 w-10 text-ink-3 mx-auto mb-3" />
          <p className="text-sm text-ink-2">Aucun message.</p>
        </div>
      </Card>
    </div>
  );
}
