import { listarOpcoes, listarTarefas } from "@/modulos/tarefas/dados";
import { agoraEmSaoPaulo, hojeEmSaoPaulo } from "@/modulos/tarefas/regras";
import { connection } from "next/server";
import { Suspense } from "react";
import { Kanban } from "./_componentes/kanban";

// Tarefas da operação em kanban (A fazer, Fazendo, Travado, Feito). Qualquer usuário logado usa;
// o plantonista vê só as dele (RLS).
export default function TarefasPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] leading-tight">Tarefas</h1>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <ConteudoTarefas />
      </Suspense>
    </div>
  );
}

async function ConteudoTarefas() {
  await connection();
  const [tarefas, opcoes] = await Promise.all([listarTarefas(), listarOpcoes()]);
  const agora = new Date();
  return <Kanban itens={tarefas} opcoes={opcoes} agora={agoraEmSaoPaulo(agora)} hoje={hojeEmSaoPaulo(agora)} />;
}
