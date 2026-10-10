// Peças visuais dos Webinários usadas pelas duas páginas (lista e detalhe).

import type { CorEtiqueta } from "@/components/ui/etiqueta";
import { cn } from "@/lib/utils";
import type { TarefaChecklist } from "@/modulos/webinarios/dados";
import type { StatusWebinario } from "@/modulos/webinarios/regras";
import Link from "next/link";

export const COR_STATUS: Record<StatusWebinario, CorEtiqueta> = { planejando: "cinza", gravando: "azul", no_ar: "verde", pausado: "laranja" };
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function Checklist({ tarefas }: { tarefas: TarefaChecklist[] }) {
  if (!tarefas.length) return <p className="m-0 text-[13px] italic text-ink-faint">Checklist ainda não criado.</p>;
  const feitas = tarefas.filter((t) => t.status === "concluida").length;
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-ink">
        Checklist · {feitas}/{tarefas.length}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
        {tarefas.map((t) => (
          <li key={t.id} className={cn("flex flex-wrap gap-x-2", t.status === "concluida" ? "text-ink-faint line-through" : "text-ink")}>
            <span>{t.status === "concluida" ? "✓" : "○"}</span>
            <span className="flex-1">{t.titulo}</span>
            <span className="text-[12px] text-ink-faint no-underline">
              {[t.responsavel, t.prazo && dataBR(t.prazo)].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/tarefas" className="mt-2 inline-block text-[12px] text-ink-dim underline-offset-4 hover:underline">
        Abrir na aba Tarefas
      </Link>
    </div>
  );
}
