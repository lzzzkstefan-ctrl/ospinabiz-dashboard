"use client";

import { Aviso, Campo, Gaveta } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataBR, hojeBrasilia, type Bm } from "@/modulos/bms/regras";
import { useActionState } from "react";
import { banir, desfazerBan, editarBm, type EstadoForm } from "../acoes";
import { BotaoAtivo } from "./botao-ativo";

// Edição da BM (nome, acesso, ban, arquivar), dentro do "Gerenciar números". Só admin.

export function EditarBm({ bm }: { bm: Pick<Bm, "id" | "nome" | "acesso_admin" | "ativo" | "banida_em" | "ban_motivo"> }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(editarBm, {});

  return (
    <Gaveta rotulo="Editar BM">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={bm.id} />
        <Campo rotulo="Nome">
          <Input name="nome" maxLength={60} required defaultValue={bm.nome} />
        </Campo>
        <label className="flex items-center gap-2 text-[13px] text-ink-dim">
          <input type="checkbox" name="acesso_admin" defaultChecked={bm.acesso_admin} className="accent-[var(--accent)]" />
          Temos acesso de admin
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
        <Aviso estado={estado} />
      </form>
      <BanDaBm bm={bm} />
      <div className="mt-2 border-t border-line-soft pt-2">
        <BotaoAtivo tabela="bm" id={bm.id} ativo={bm.ativo} />
      </div>
    </Gaveta>
  );
}

/** Situação da BM: marcar como banida (data e motivo) ou desfazer o ban. */
function BanDaBm({ bm }: { bm: Pick<Bm, "id" | "banida_em" | "ban_motivo"> }) {
  const [estadoBan, acaoBan, banindo] = useActionState<EstadoForm, FormData>(banir, {});
  const [estadoVolta, acaoVolta, voltando] = useActionState<EstadoForm, FormData>(desfazerBan, {});

  if (bm.banida_em) {
    return (
      <form action={acaoVolta} className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3">
        <input type="hidden" name="id" value={bm.id} />
        <p className="m-0 text-[13px] text-ink-dim">
          Situação: <span className="font-semibold text-[rgb(var(--tag-vermelho))]">Banida</span> em {dataBR(bm.banida_em)}
          {bm.ban_motivo && ` · ${bm.ban_motivo}`}
        </p>
        <div>
          <Button type="submit" size="sm" variant="outline" disabled={voltando}>
            {voltando ? "Desfazendo..." : "Desfazer ban"}
          </Button>
        </div>
        <p className="m-0 text-[11.5px] text-ink-faint">A BM e os números voltam para a situação de antes do ban.</p>
        <Aviso estado={estadoVolta} />
      </form>
    );
  }

  const hoje = hojeBrasilia();
  return (
    <form action={acaoBan} className="mt-3 flex flex-col gap-3 border-t border-line-soft pt-3">
      <input type="hidden" name="id" value={bm.id} />
      <p className="m-0 text-[13px] font-semibold text-ink">Marcar BM como banida</p>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <Campo rotulo="Data do ban">
          <Input type="date" name="data" defaultValue={hoje} max={hoje} required className="[color-scheme:dark]" />
        </Campo>
        <Campo rotulo="Motivo">
          <Input name="motivo" maxLength={300} placeholder="ex.: Ban permanente da Meta" />
        </Campo>
      </div>
      <p className="m-0 text-[11.5px] text-ink-faint">Marca todos os números desta BM como Banido, com a mesma data. Eles saem do monitor e entram no filtro “Número banido” do Funil.</p>
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={banindo}>
          {banindo ? "Marcando..." : "Marcar como banida"}
        </Button>
      </div>
      <Aviso estado={estadoBan} />
    </form>
  );
}
