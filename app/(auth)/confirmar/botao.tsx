"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";

// Desliga no envio: o token vale uma vez só, e um segundo clique daria erro.
export function BotaoContinuar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Entrando..." : "Continuar"}
    </Button>
  );
}
