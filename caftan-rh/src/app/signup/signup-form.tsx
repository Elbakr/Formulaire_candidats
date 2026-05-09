"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { signupAction } from "../login/actions";
import { toast } from "sonner";

export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <h3 className="font-bold mb-2">Compte créé.</h3>
          <p className="text-sm text-ink-2">
            Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form
          action={(fd) => {
            startTransition(async () => {
              const res = await signupAction(fd);
              if (res?.error) toast.error(res.error);
              else if (res?.ok) {
                toast.success("Compte créé. Vérifie ton email.");
                setDone(true);
              }
            });
          }}
          className="space-y-3"
        >
          <div>
            <Label htmlFor="full_name">Nom complet</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <Label htmlFor="password">Mot de passe (8+ caractères)</Label>
            <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={pending}>
            {pending ? "Création…" : "Créer le compte"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
