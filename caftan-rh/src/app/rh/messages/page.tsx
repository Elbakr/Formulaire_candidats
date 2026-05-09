import { Card } from "@/components/ui/card";
import { Mail } from "lucide-react";

export default function RhMessagesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Messagerie</h1>
        <p className="text-sm text-ink-2">Échanges email avec les candidats.</p>
      </div>
      <Card>
        <div className="p-10 text-center">
          <Mail className="h-10 w-10 text-ink-3 mx-auto mb-3" />
          <p className="text-sm text-ink-2">Module en développement.</p>
          <p className="text-xs text-ink-3 mt-2 max-w-md mx-auto">
            Les emails envoyés depuis les fiches candidat (convocation, refus, embauche) sont déjà
            opérationnels via Resend. Une vue agrégée arrive bientôt.
          </p>
        </div>
      </Card>
    </div>
  );
}
