"use client";

// Formulários dos Webinários (só admin).

import { Aviso, Campo, classeOpcao, classeSelect, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Webinario } from "@/modulos/webinarios/dados";
import { CAMPOS_MENSAGEM, ETAPAS_SESSAO, NOME_STATUS, NOME_TIPO, type Sessao } from "@/modulos/webinarios/regras";
import { useActionState } from "react";
import { criarChecklist, criarLink, salvarCustoMensagem, salvarSessao, salvarWebinario } from "../acoes";

function Enviar({ pendente, texto }: { pendente: boolean; texto: string }) {
  return (
    <Button type="submit" disabled={pendente}>
      {pendente ? "Salvando…" : texto}
    </Button>
  );
}

const valor = (n: number | null | undefined) => (n == null ? "" : String(n));

export function FormWebinario({ webinario }: { webinario?: Webinario }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarWebinario, {});
  const w = webinario;
  return (
    <form action={acao} className="flex flex-col gap-3">
      {w && <input type="hidden" name="id" value={w.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo rotulo="Nome">
          <Input name="nome" defaultValue={w?.nome ?? ""} maxLength={80} placeholder="Ex.: GSC 297 terça" required />
        </Campo>
        <Campo rotulo="Tipo">
          <select name="tipo" defaultValue={w?.tipo ?? "downsell"} className={classeSelect}>
            {Object.entries(NOME_TIPO).map(([id, nome]) => (
              <option key={id} value={id} className={classeOpcao}>
                {nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Status">
          <select name="status" defaultValue={w?.status ?? "planejando"} className={classeSelect}>
            {Object.entries(NOME_STATUS).map(([id, nome]) => (
              <option key={id} value={id} className={classeOpcao}>
                {nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Oferta">
          <Input name="oferta" defaultValue={w?.oferta ?? ""} maxLength={120} placeholder="Ex.: Game Changer Society" />
        </Campo>
        <Campo rotulo="Preço (R$)">
          <Input name="preco" inputMode="decimal" defaultValue={w?.preco != null ? String(w.preco).replace(".", ",") : ""} placeholder="297,00" />
        </Campo>
        <Campo rotulo="Frequência">
          <Input name="frequencia" defaultValue={w?.frequencia ?? ""} maxLength={80} placeholder="Ex.: toda terça" />
        </Campo>
        <Campo rotulo="Horário">
          <Input name="horario" defaultValue={w?.horario ?? ""} maxLength={40} placeholder="Ex.: 20h" />
        </Campo>
        <Campo rotulo="Plataforma (opcional)">
          <Input name="plataforma" defaultValue={w?.plataforma ?? ""} maxLength={60} placeholder="a definir" />
        </Campo>
        <Campo rotulo="ID da oferta na Hubla (opcional)">
          <Input name="hubla_oferta_id" defaultValue={w?.hubla_oferta_id ?? ""} maxLength={80} placeholder="a definir" />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Enviar pendente={pendente} texto={w ? "Salvar" : "Criar webinário"} />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormChecklist({ webinarioId, equipe, faltam }: { webinarioId: number; equipe: { id: number; nome: string }[]; faltam: number }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarChecklist, {});
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="webinario_id" value={webinarioId} />
      <Campo rotulo="Responsável (padrão)">
        <select name="responsavel_id" defaultValue="" className={`${classeSelect} w-44`}>
          <option value="" className={classeOpcao}>
            ninguém ainda
          </option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id} className={classeOpcao}>
              {p.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Prazo (padrão)">
        <Input name="prazo" type="date" className="w-40 [color-scheme:dark]" />
      </Campo>
      <Enviar pendente={pendente} texto={`Criar ${faltam} item(ns) do modelo`} />
      <Aviso estado={estado} />
    </form>
  );
}

export function FormSessao({ webinarioId, sessao, hoje }: { webinarioId: number; sessao?: Sessao; hoje: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarSessao, {});
  const s = sessao;
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="webinario_id" value={webinarioId} />
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Dia">
          <Input name="dia" type="date" defaultValue={s?.dia ?? hoje} className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Variação A/B (opcional)">
          <Input name="variacao" defaultValue={s?.variacao ?? ""} maxLength={40} placeholder="Ex.: preço 297" />
        </Campo>
        <Campo rotulo="utm_content (opcional)">
          <Input name="utm_content" defaultValue={s?.utm_content ?? ""} maxLength={80} placeholder="data da sessão" />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ETAPAS_SESSAO.map((e) => (
          <Campo key={e.campo} rotulo={e.nome}>
            <Input name={e.campo} inputMode="numeric" defaultValue={valor(s?.[e.campo])} className="tabular-nums" />
          </Campo>
        ))}
        <Campo rotulo="Recuperados (quente)">
          <Input name="recuperados_quente" inputMode="numeric" defaultValue={valor(s?.recuperados_quente)} className="tabular-nums" />
        </Campo>
        <Campo rotulo="Recuperados (morno)">
          <Input name="recuperados_morno" inputMode="numeric" defaultValue={valor(s?.recuperados_morno)} className="tabular-nums" />
        </Campo>
      </div>
      <p className="m-0 text-[12px] text-ink-faint">Mensagens enviadas: por template (paga) e dentro da janela de 24h (grátis).</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CAMPOS_MENSAGEM.flatMap((m) => [
          <Campo key={`${m.campo}_template`} rotulo={`${m.nome} · template`}>
            <Input name={`${m.campo}_template`} inputMode="numeric" defaultValue={valor(s?.[`${m.campo}_template`])} className="tabular-nums" />
          </Campo>,
          <Campo key={`${m.campo}_janela`} rotulo={`${m.nome} · janela 24h`}>
            <Input name={`${m.campo}_janela`} inputMode="numeric" defaultValue={valor(s?.[`${m.campo}_janela`])} className="tabular-nums" />
          </Campo>,
        ])}
      </div>
      <Campo rotulo="Observações">
        <Input name="observacoes" defaultValue={s?.observacoes ?? ""} maxLength={1000} />
      </Campo>
      <div className="flex items-center gap-3">
        <Enviar pendente={pendente} texto={s ? "Salvar sessão" : "Registrar sessão"} />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormLink({ webinarioId }: { webinarioId: number }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarLink, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="webinario_id" value={webinarioId} />
      <div className="grid gap-3 sm:grid-cols-[150px_1fr_1.4fr]">
        <Campo rotulo="Tipo">
          <select name="tipo" defaultValue="roteiro" className={classeSelect}>
            {["roteiro", "copy", "script", "criativo", "playbook", "outro"].map((t) => (
              <option key={t} value={t} className={classeOpcao}>
                {t}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Título">
          <Input name="titulo" maxLength={120} placeholder="Ex.: Roteiro v2" />
        </Campo>
        <Campo rotulo="Link">
          <Input name="url" type="url" maxLength={1000} placeholder="https://" />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Enviar pendente={pendente} texto="Adicionar link" />
        <Aviso estado={estado} />
      </div>
    </form>
  );
}

export function FormCusto({ custo }: { custo: number }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarCustoMensagem, {});
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <Campo rotulo="Custo por mensagem de template (R$)">
        <Input name="custo" inputMode="decimal" defaultValue={String(custo).replace(".", ",")} className="w-32 tabular-nums" />
      </Campo>
      <Enviar pendente={pendente} texto="Salvar" />
      <Aviso estado={estado} />
    </form>
  );
}
