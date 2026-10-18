"use client";

// Seção "Compromissos previstos" do Check-in (18/10/2026): quem já sabe que vai se ausentar ou
// atrasar cadastra aqui e a equipe recebe o aviso. Lista de hoje em diante, agrupada por dia; os que
// já passaram ficam em "Ver anteriores". Editar/cancelar: quem cadastrou ou o admin (o banco confere).

import { Aviso, Campo, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { rotuloDoDia, textoCurtoCompromisso, TIPOS_COMPROMISSO, type Compromisso, type TipoCompromisso } from "@/modulos/escala/regras";
import { useActionState, useEffect, useState } from "react";
import { cancelarCompromisso, salvarCompromisso } from "../acoes";
import { corDaPessoa } from "./cores";

type PessoaOpcao = { id: number; nome: string };
const nomeDoTipo = (t: TipoCompromisso) => TIPOS_COMPROMISSO.find((x) => x.id === t)?.nome ?? t;

export function CompromissosPrevistos({
  proximos,
  anteriores,
  pessoas,
  eu,
  usuarioId,
  admin,
  hoje,
}: {
  proximos: Compromisso[];
  anteriores: Compromisso[];
  pessoas: PessoaOpcao[];
  /** pessoa da equipe ligada ao login (null = sem pessoa: não cadastra) */
  eu: number | null;
  usuarioId: string;
  admin: boolean;
  hoje: string;
}) {
  const [aberto, setAberto] = useState<"novo" | number | null>(null);
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.nome]));
  const podeMexer = (c: Compromisso) => admin || c.criado_por === usuarioId;
  const podeCadastrar = admin || eu !== null;
  const editando = typeof aberto === "number" ? proximos.find((c) => c.id === aberto) : undefined;

  return (
    <section id="compromissos" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-line-soft pb-2.5">
        <h2 className="text-[19px]">Compromissos previstos</h2>
        {podeCadastrar && (
          <button
            type="button"
            onClick={() => setAberto(aberto === "novo" ? null : "novo")}
            className="ml-auto rounded-full border border-line px-3.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-bg-raised-2 hover:text-white"
          >
            {aberto === "novo" ? "Fechar" : "+ Adicionar compromisso"}
          </button>
        )}
      </div>
      <p className="-mt-1 m-0 text-[12.5px] text-ink-dim">
        Vai chegar mais tarde, sair mais cedo ou ficar fora? Avise aqui: a equipe recebe a notificação, e o período avisado não conta como atraso nem como &quot;não entrou&quot;.
      </p>

      {aberto !== null && (aberto === "novo" || editando) && (
        <div className="rounded-2xl border border-line-soft bg-bg-raised p-4">
          <FormCompromisso key={String(aberto)} compromisso={editando} pessoas={pessoas} eu={eu} admin={admin} hoje={hoje} onFechar={() => setAberto(null)} />
        </div>
      )}

      {proximos.length === 0 ? (
        <p className="m-0 text-[13px] italic text-ink-faint">Nenhum compromisso previsto</p>
      ) : (
        <Agrupados lista={proximos} hoje={hoje} nomeDe={nomeDe} acoes={(c) => (podeMexer(c) ? <Acoes c={c} editando={aberto === c.id} onEditar={() => setAberto(aberto === c.id ? null : c.id)} /> : null)} />
      )}

      {anteriores.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[12.5px] text-ink-dim underline-offset-4 hover:text-white hover:underline">
            Ver anteriores ({anteriores.length})
          </summary>
          <div className="mt-3 opacity-80">
            <Agrupados lista={anteriores} hoje={hoje} nomeDe={nomeDe} />
          </div>
        </details>
      )}
    </section>
  );
}

function Agrupados({ lista, hoje, nomeDe, acoes }: { lista: Compromisso[]; hoje: string; nomeDe: Map<number, string>; acoes?: (c: Compromisso) => React.ReactNode }) {
  const dias = [...new Set(lista.map((c) => c.data))];
  return (
    <div className="flex flex-col gap-3">
      {dias.map((dia) => (
        <div key={dia} className="flex flex-col gap-1.5">
          <span className={cn("text-[12.5px] font-semibold", dia === hoje ? "text-accent" : "text-white")}>{rotuloDoDia(dia, hoje)}</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {lista
              .filter((c) => c.data === dia)
              .map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line-soft px-3 py-2 text-[13px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(var(${corDaPessoa(c.pessoa)}))` }} aria-hidden />
                  <span className="font-semibold text-white">{nomeDe.get(c.pessoa) ?? "?"}</span>
                  <span className="tabular-nums text-[rgb(var(--tag-amarelo))]">📅 {textoCurtoCompromisso(c)}</span>
                  <span className="text-ink-dim">· {nomeDoTipo(c.tipo)}</span>
                  {c.motivo && <span className="text-ink-dim">· {c.motivo}</span>}
                  {acoes?.(c)}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Acoes({ c, editando, onEditar }: { c: Compromisso; editando: boolean; onEditar: () => void }) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <button type="button" onClick={onEditar} className="text-[12px] text-ink-dim underline-offset-4 hover:text-white hover:underline">
        {editando ? "fechar" : "editar"}
      </button>
      <form
        action={cancelarCompromisso}
        onSubmit={(e) => {
          if (!confirm("Cancelar este compromisso? A equipe recebe o aviso do cancelamento.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={c.id} />
        <button type="submit" className="text-[12px] text-[rgb(var(--tag-vermelho))] underline-offset-4 hover:underline">
          cancelar
        </button>
      </form>
    </span>
  );
}

function FormCompromisso({
  compromisso: c,
  pessoas,
  eu,
  admin,
  hoje,
  onFechar,
}: {
  compromisso?: Compromisso;
  pessoas: PessoaOpcao[];
  eu: number | null;
  admin: boolean;
  hoje: string;
  onFechar: () => void;
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarCompromisso, {});
  const [tipo, setTipo] = useState<TipoCompromisso>(c?.tipo ?? "ausencia");
  const diaInteiro = tipo === "dia_inteiro";
  useEffect(() => {
    if (estado.ok) onFechar();
  }, [estado, onFechar]);
  const pessoaInicial = c?.pessoa ?? eu ?? pessoas[0]?.id;

  return (
    <form action={acao} className="flex flex-col gap-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Pessoa">
          {admin ? (
            <select name="pessoa" defaultValue={pessoaInicial} className={classeSelect}>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id} className={classeOpcao}>
                  {p.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="flex h-9 items-center text-sm text-white">{pessoas.find((p) => p.id === eu)?.nome ?? "Você"}</span>
          )}
        </Campo>
        <Campo rotulo="Data">
          <Input name="data" type="date" min={hoje} defaultValue={c?.data ?? hoje} required className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Tipo">
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCompromisso)} className={classeSelect}>
            {TIPOS_COMPROMISSO.map((t) => (
              <option key={t.id} value={t.id} className={classeOpcao}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Motivo (opcional)">
          <Input name="motivo" maxLength={80} defaultValue={c?.motivo ?? ""} placeholder="Opcional · ex.: consulta, faculdade, resolver banco" />
        </Campo>
      </div>
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="mb-1.5 text-[13px] text-ink-dim">Horário</legend>
        <label className="flex h-9 items-center gap-1.5 text-[13px] text-ink">
          <input type="radio" name="horario" value="faixa" checked={!diaInteiro} onChange={() => setTipo(tipo === "dia_inteiro" ? "ausencia" : tipo)} className="accent-[var(--accent)]" />
          de
        </label>
        <Input name="inicio" type="time" defaultValue={c?.inicio ?? ""} disabled={diaInteiro} aria-label="de" className="w-[120px] [color-scheme:dark]" />
        <span className="flex h-9 items-center text-[13px] text-ink-dim">até</span>
        <Input name="fim" type="time" defaultValue={c?.fim ?? ""} disabled={diaInteiro} aria-label="até" className="w-[120px] [color-scheme:dark]" />
        <label className="ml-2 flex h-9 items-center gap-1.5 text-[13px] text-ink">
          <input type="radio" name="horario" value="dia_inteiro" checked={diaInteiro} onChange={() => setTipo("dia_inteiro")} className="accent-[var(--accent)]" />
          Dia inteiro
        </label>
      </fieldset>
      <p className="m-0 text-[11.5px] text-ink-faint">
        Atraso na entrada: &quot;até&quot; = a hora que você chega. Saída mais cedo: &quot;de&quot; = a hora que você sai. Ausência: o período fora.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : c ? "Salvar alteração" : "Cadastrar e avisar a equipe"}
        </Button>
        <Button type="button" variant="outline" onClick={onFechar}>
          Fechar
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
