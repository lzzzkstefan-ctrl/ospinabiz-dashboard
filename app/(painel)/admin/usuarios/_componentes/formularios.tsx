"use client";

// Formulários da aba Usuários (chefe e gerente).

import { Campo, classeOpcao, classeSelect } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Resultado } from "@/modulos/usuarios/gestao";
import { PAPEIS, type PapelUsuario } from "@/modulos/usuarios/regras";
import { useActionState, useState } from "react";
import { acaoConvidar, acaoDesativar, acaoEditar, acaoNovoLink, acaoReativar } from "../acoes";

function Mensagem({ r }: { r: Resultado }) {
  if (r.erro) return <p role="alert" className="m-0 text-[13px] text-accent-3">{r.erro}</p>;
  if (r.ok) return <p role="status" className="m-0 text-[13px] text-ink-dim">{r.ok}</p>;
  return null;
}

/** Link do convite com "copiar" (para mandar no WhatsApp). */
function LinkConvite({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[rgb(var(--tag-verde)/0.4)] bg-[rgb(var(--tag-verde)/0.06)] p-3">
      <p className="m-0 text-[12.5px] text-ink-dim">Mande só para a pessoa (no privado). Vale cerca de 1 hora; se vencer, gere outro.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-line-soft bg-transparent px-3 font-mono text-[11.5px] text-ink" />
        <Button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          }}
        >
          {copiado ? "Copiado ✓" : "Copiar link"}
        </Button>
      </div>
    </div>
  );
}

function SelectPapel({ padrao, podeChefe }: { padrao?: PapelUsuario | null; podeChefe: boolean }) {
  return (
    <select name="papel" defaultValue={padrao ?? "vendedor"} className={classeSelect}>
      {PAPEIS.filter((p) => podeChefe || p.id !== "chefe" || padrao === "chefe").map((p) => (
        <option key={p.id} value={p.id} className={classeOpcao}>
          {p.nome}
        </option>
      ))}
    </select>
  );
}

export function FormConvidar({ podeChefe }: { podeChefe: boolean }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(acaoConvidar, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_180px]">
        <Campo rotulo="E-mail">
          <Input name="email" type="email" autoComplete="off" placeholder="pessoa@exemplo.com" required />
        </Campo>
        <Campo rotulo="Nome">
          <Input name="nome" maxLength={60} placeholder="Ex.: Lucas" required />
        </Campo>
        <Campo rotulo="Papel">
          <SelectPapel podeChefe={podeChefe} />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Gerando…" : "Convidar e gerar link"}
        </Button>
        <Mensagem r={r} />
      </div>
      {r.link && <LinkConvite link={r.link} />}
    </form>
  );
}

export function FormEditar({
  id,
  papel,
  atendente,
  utm,
  atendentes,
  podeChefe,
}: {
  id: string;
  papel: PapelUsuario | null;
  atendente: string | null;
  utm: string | null;
  atendentes: { dcId: string; nome: string; livre: boolean }[];
  podeChefe: boolean;
}) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(acaoEditar, {});
  return (
    <form action={acao} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Papel">
          <SelectPapel padrao={papel} podeChefe={podeChefe} />
        </Campo>
        <Campo rotulo="Atendente na Data Crazy">
          <select name="atendente" defaultValue={atendente ?? ""} className={classeSelect}>
            <option value="" className={classeOpcao}>
              nenhum
            </option>
            {atendentes.map((a) => (
              <option key={a.dcId} value={a.dcId} disabled={!a.livre && a.dcId !== atendente} className={classeOpcao}>
                {a.nome}
                {!a.livre && a.dcId !== atendente ? " (de outra pessoa)" : ""}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Código UTM da Hubla (vendas)">
          <Input name="utm" defaultValue={utm ?? ""} maxLength={40} placeholder="ex.: davi" className="font-mono" />
        </Campo>
      </div>
      <p className="m-0 text-[11.5px] text-ink-faint">
        O atendente faz o Funil mostrar os leads da pessoa. O código UTM liga a venda da Hubla a ela (utm_term). Vazio = desliga (o histórico fica).
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
        <Mensagem r={r} />
      </div>
    </form>
  );
}

export function BotaoNovoLink({ id }: { id: string }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(acaoNovoLink, {});
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? "Gerando…" : "Gerar novo link de convite"}
        </Button>
        <Mensagem r={r} />
      </div>
      {r.link && <LinkConvite link={r.link} />}
    </form>
  );
}

/** Desativar (com confirmação) ou reativar. */
export function BotaoAtivo({ id, nome, desativado }: { id: string; nome: string; desativado: boolean }) {
  const [rD, desativar, desativando] = useActionState<Resultado, FormData>(acaoDesativar, {});
  const [rR, reativar, reativando] = useActionState<Resultado, FormData>(acaoReativar, {});
  if (desativado) {
    return (
      <form action={reativar} className="flex items-center gap-3">
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" disabled={reativando}>
          {reativando ? "Reativando…" : "Reativar acesso"}
        </Button>
        <Mensagem r={rR} />
      </form>
    );
  }
  return (
    <form
      action={desativar}
      onSubmit={(e) => {
        if (!window.confirm(`Desativar ${nome}? Ele(a) não entra mais na dashboard. Vendas, check-ins e atendimentos continuam no histórico, e dá para reativar.`)) e.preventDefault();
      }}
      className="flex items-center gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={desativando} className="text-[12.5px] text-[rgb(var(--tag-vermelho))] underline-offset-4 hover:underline disabled:opacity-60">
        {desativando ? "Desativando…" : "Desativar acesso"}
      </button>
      <Mensagem r={rD} />
    </form>
  );
}
