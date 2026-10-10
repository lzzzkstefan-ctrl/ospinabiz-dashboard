"use client";

// Formulários da Escala e check-in.

import { Aviso, Campo, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NOME_DIA_CURTO } from "@/modulos/escala/regras";
import { useActionState } from "react";
import { comecarTurno, corrigirTurno, criarPadrao, criarPessoa, decidirPlantao, encerrarTurno, pedirPlantao } from "../acoes";

type PessoaOpcao = { id: number; nome: string };

function Enviar({ pendente, texto, variante }: { pendente: boolean; texto: string; variante?: "outline" }) {
  return (
    <Button type="submit" disabled={pendente} variant={variante}>
      {pendente ? "Salvando…" : texto}
    </Button>
  );
}

function SelectTipo({ padrao = "normal" }: { padrao?: string }) {
  return (
    <select name="tipo" defaultValue={padrao} className={classeSelect}>
      <option value="normal" className={classeOpcao}>
        Normal
      </option>
      <option value="raspagem" className={classeOpcao}>
        Raspagem (limpar a fila)
      </option>
    </select>
  );
}

/** Começar turno (escolhe o tipo) ou encerrar o turno aberto. */
export function BotaoTurno({ aberto }: { aberto: boolean }) {
  const [estadoA, acaoA, pendenteA] = useActionState<EstadoForm, FormData>(comecarTurno, {});
  const [estadoB, acaoB, pendenteB] = useActionState<EstadoForm, FormData>(encerrarTurno, {});
  if (aberto) {
    return (
      <form action={acaoB} className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendenteB} className="h-11 px-6 text-[15px]">
          {pendenteB ? "Encerrando…" : "Encerrar turno"}
        </Button>
        <Aviso estado={estadoB} />
      </form>
    );
  }
  return (
    <form action={acaoA} className="flex flex-wrap items-end gap-3">
      <Campo rotulo="Tipo de turno" className="w-56">
        <SelectTipo />
      </Campo>
      <Button type="submit" disabled={pendenteA} className="h-11 px-6 text-[15px]">
        {pendenteA ? "Começando…" : "Começar turno"}
      </Button>
      <Aviso estado={estadoA} />
    </form>
  );
}

/** "Vou ficar": a pessoa marca o próprio plantão; o admin pode marcar para qualquer um (e já confirmar). */
export function FormPlantao({ dia, hoje, operacao, admin, pessoas }: { dia: string; hoje: string; operacao: { inicio: string; fim: string }; admin: boolean; pessoas: PessoaOpcao[] }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(pedirPlantao, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Dia">
          <Input name="dia" type="date" defaultValue={dia} min={admin ? undefined : hoje} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Tipo">
          <SelectTipo />
        </Campo>
        <Campo rotulo="Começa">
          <Input name="inicio" type="time" defaultValue={operacao.inicio} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Termina">
          <Input name="fim" type="time" defaultValue={operacao.fim} className="[color-scheme:dark]" />
        </Campo>
        {admin && (
          <Campo rotulo="Quem">
            <select name="equipe_id" defaultValue="" className={classeSelect}>
              <option value="" className={classeOpcao}>
                eu mesmo
              </option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id} className={classeOpcao}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {admin && (
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-dim">
            <input type="checkbox" name="confirmar" value="sim" defaultChecked className="accent-[var(--accent)]" /> já confirmar
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Enviar pendente={pendente} texto={admin ? "Marcar plantão" : "Pedir plantão"} />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

/** Admin: confirmar ou recusar um pedido. */
export function FormDecidir({ id }: { id: number }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(decidirPlantao, {});
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" name="situacao" value="confirmado" disabled={pendente} className="h-8 px-3 text-[12.5px]">
        Confirmar
      </Button>
      <Input name="motivo" placeholder="motivo (para recusar)" maxLength={300} className="h-8 w-48 text-[12.5px]" />
      <Button type="submit" name="situacao" value="recusado" disabled={pendente} variant="outline" className="h-8 px-3 text-[12.5px]">
        Recusar
      </Button>
      <Aviso estado={estado} />
    </form>
  );
}

/** Admin: corrigir o horário de um turno (com motivo). */
export function FormCorrigir({ id, dia, inicio, fim }: { id: number; dia: string; inicio: string; fim: string | null }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(corrigirTurno, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dia" value={dia} />
      <div className="grid gap-3 sm:grid-cols-[120px_120px_1fr]">
        <Campo rotulo="Começou">
          <Input name="inicio" type="time" defaultValue={inicio} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Terminou">
          <Input name="fim" type="time" defaultValue={fim ?? ""} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Motivo (obrigatório)">
          <Input name="motivo" maxLength={300} placeholder="Ex.: esqueceu de apertar ao chegar" />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Enviar pendente={pendente} texto="Corrigir turno" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

/** Admin: quem cobre quais dias da semana (escala padrão). */
export function FormPadrao({ pessoas, operacao, hoje }: { pessoas: PessoaOpcao[]; operacao: { inicio: string; fim: string }; hoje: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarPadrao, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1.5 text-[13px] text-ink-dim">Dias da semana</legend>
        {NOME_DIA_CURTO.map((nome, i) => (
          <label key={nome} className="flex items-center gap-1.5 rounded-full border border-line-soft px-3 py-1 text-[13px] text-ink">
            <input type="checkbox" name="dia_semana" value={i} className="accent-[var(--accent)]" /> {nome}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-5">
        <Campo rotulo="Quem">
          <select name="equipe_id" defaultValue="" className={classeSelect}>
            <option value="" className={classeOpcao}>
              escolha
            </option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id} className={classeOpcao}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Começa">
          <Input name="inicio" type="time" defaultValue={operacao.inicio} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Termina">
          <Input name="fim" type="time" defaultValue={operacao.fim} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Tipo">
          <SelectTipo />
        </Campo>
        <Campo rotulo="Vale a partir de">
          <Input name="desde" type="date" defaultValue={hoje} className="[color-scheme:dark]" />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Enviar pendente={pendente} texto="Adicionar à escala" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormPessoa() {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarPessoa, {});
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <Campo rotulo="Nome">
        <Input name="nome" maxLength={60} placeholder="Ex.: Lucas (irmão)" className="w-64" />
      </Campo>
      <Enviar pendente={pendente} texto="Adicionar pessoa" />
      <Aviso estado={estado} />
    </form>
  );
}
