"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailSendDialog } from "@/components/email-send-dialog";

type Template = {
  slug: string;
  label: string;
  subject: string;
  body_html: string;
  needs_dates: boolean;
  needs_times: boolean;
};

export function SendEmailButton({
  applicationId,
  candidateName,
  templates,
}: {
  applicationId: string;
  candidateName: string;
  templates: Template[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4" /> Envoyer email
      </Button>
      <EmailSendDialog
        open={open}
        onOpenChange={setOpen}
        applicationIds={[applicationId]}
        recipientPreview={candidateName}
        templates={templates}
      />
    </>
  );
}
