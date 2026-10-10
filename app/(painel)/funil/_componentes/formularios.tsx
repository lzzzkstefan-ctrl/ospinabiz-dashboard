"use client";

// Formulários da configuração do Funil (só admin).

import { Aviso, Campo, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionState } from "react";
import { criarMudanca, criarNumeroInterno, salvarConfigFunil } from "../acoes";

export function FormConfigFunil({ horas, inicio, fim }: { horas: number; inicio: string; fim: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarConfigFunil, {});
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <Campo rotulo="Esperando há mais de (horas)">
        <Input name="horas_espera" inputMode="decimal" defaultValue={String(horas).replace(".", ",")} className="w-28 tabular-nums" />
      </Campo>
      <Campo rotulo="Atendimento começa">
        <Input name="inicio" type="time" defaultValue={inicio} className="w-32 [color-scheme:dark]" />
      </Campo>
      <Campo rotulo="Atendimento termina">
        <Input name="fim" type="time" defaultValue={fim} className="w-32 [color-scheme:dark]" />
      </Campo>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar"}
      </Button>
      <Aviso estado={estado} />
    </form>
  );
}

export function FormMudanca({ hoje, etapas }: { hoje: string; etapas: { id: number; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarMudanca, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[160px_220px_1fr]">
        <Campo rotulo="Dia">
          <Input name="dia" type="date" defaultValue={hoje} max={hoje} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Etapa (opcional)">
          <select name="etapa_id" defaultValue="" className={classeSelect}>
            <option value="" className={classeOpcao}>
              O funil todo
            </option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id} className={classeOpcao}>
                {e.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="O que mudou">
          <Input name="descricao" maxLength={300} placeholder="Ex.: trocamos o áudio da Parte 2" />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Registrar mudança"}
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormNumeroInterno() {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarNumeroInterno, {});
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <Campo rotulo="Nome">
        <Input name="nome" maxLength={80} placeholder="Ex.: Celular de teste do Davi" className="w-64" />
      </Campo>
      <Campo rotulo="Telefone">
        <Input name="telefone" inputMode="tel" maxLength={25} placeholder="+55 11 91234-5678" className="w-52 tabular-nums" autoComplete="off" />
      </Campo>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Cadastrar número"}
      </Button>
      <Aviso estado={estado} />
    </form>
  );
}
