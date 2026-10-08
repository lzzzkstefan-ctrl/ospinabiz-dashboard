import { Etiqueta } from "@/components/ui/etiqueta";
import { ehAdmin } from "@/lib/auth/papeis";
import { listarBms, listarEquipe } from "@/modulos/bms/dados";
import {
  agruparEmSecoes,
  entraNoTeste,
  formatarLimite,
  formatarTelefone,
  type Bm,
  type Numero,
  type Pessoa,
  type Secao,
} from "@/modulos/bms/regras";
import { Suspense } from "react";
import { EditarBm, EditarNumero } from "./_componentes/form-editar";
import { FormNovaBm } from "./_componentes/form-nova-bm";
import { FormNovoNumero } from "./_componentes/form-novo-numero";

// BMs e números organizados em: Ativos com acesso / Ativos sem acesso / Fora da operação.
// Todo mundo logado vê; só admin cadastra, edita e arquiva.
export default function BmsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">BMs e números</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">
          Os números de WhatsApp da operação, organizados por acesso e situação.
        </p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <ConteudoBms />
      </Suspense>
    </div>
  );
}

type Contexto = { admin: boolean; bmsParaSelect: Pick<Bm, "id" | "nome">[]; equipe: Pessoa[] };

async function ConteudoBms() {
  const [admin, bms, equipe] = await Promise.all([ehAdmin(), listarBms(), listarEquipe()]);
  const secoes = agruparEmSecoes(bms);
  const ctx: Contexto = { admin, bmsParaSelect: bms.filter((bm) => bm.ativo).map(({ id, nome }) => ({ id, nome })), equipe };

  const emOperacao = bms.flatMap((bm) => bm.numeros.filter((n) => bm.ativo && n.ativo && n.situacao === "operacao").map((n) => ({ n, bm })));
  const testaveis = emOperacao.filter(({ n, bm }) => entraNoTeste(n, bm)).length;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Resumo valor={emOperacao.length} rotulo="em operação" />
        <Resumo valor={testaveis} rotulo="prontos para o monitor" />
        <Resumo valor={emOperacao.length - testaveis} rotulo="faltando telefone" />
      </div>

      {admin && (
        <section className="glass grid gap-6 p-5 md:grid-cols-[1fr_2fr]">
          <FormNovaBm />
          <FormNovoNumero bms={ctx.bmsParaSelect} equipe={equipe} />
        </section>
      )}

      {secoes
        .filter((s) => s.id !== "arquivados")
        .map((secao) => (
          <BlocoSecao key={secao.id} secao={secao} ctx={ctx} />
        ))}

      <Arquivados secao={secoes.find((s) => s.id === "arquivados")!} bms={bms} ctx={ctx} />
    </>
  );
}

function Resumo({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="glass-lite glass-static px-4 py-3">
      <p className="text-[22px] font-semibold tabular-nums text-white">{valor}</p>
      <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{rotulo}</p>
    </div>
  );
}

function BlocoSecao({ secao, ctx }: { secao: Secao; ctx: Contexto }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">
        {secao.titulo} <span className="text-[14px] font-normal text-ink-faint">· {secao.total}</span>
      </h2>
      {secao.grupos.length === 0 ? (
        <p className="text-[13px] text-ink-faint">Nenhum número aqui.</p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {secao.grupos.map(({ bm, numeros }) => (
            <CardBm key={bm.id} bm={bm} numeros={numeros} ctx={ctx} />
          ))}
        </div>
      )}
    </section>
  );
}

function CardBm({ bm, numeros, ctx }: { bm: Bm; numeros: Numero[]; ctx: Contexto }) {
  return (
    <div className="glass-lite glass-static flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft pb-2.5">
        <h3 className="truncate text-[17px]">{bm.nome}</h3>
        <Etiqueta cor={bm.acesso_admin ? "azul" : "cinza"}>{bm.acesso_admin ? "com acesso" : "sem acesso"}</Etiqueta>
        <span className="text-[12px] text-ink-faint">
          {numeros.length} {numeros.length === 1 ? "número" : "números"}
        </span>
        {ctx.admin && <EditarBm bm={bm} />}
      </div>
      <ul className="flex flex-col">
        {numeros.map((n) => (
          <LinhaNumero key={n.id} numero={n} ctx={ctx} />
        ))}
      </ul>
    </div>
  );
}

function LinhaNumero({ numero, ctx }: { numero: Numero; ctx: Contexto }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-soft py-2 last:border-b-0">
      <span className="w-12 text-[15px] font-semibold tabular-nums text-white">{numero.final}</span>
      {numero.telefone ? (
        <span className="text-[12px] tabular-nums text-ink-dim">{formatarTelefone(numero.telefone)}</span>
      ) : (
        <Etiqueta cor="laranja">falta telefone</Etiqueta>
      )}
      <Etiqueta cor="azul">{formatarLimite(numero.limite)}</Etiqueta>
      <span className="text-[12px] text-ink-faint">{numero.responsavel?.nome ?? "sem responsável"}</span>
      {ctx.admin && <EditarNumero numero={numero} bms={ctx.bmsParaSelect} equipe={ctx.equipe} />}
    </li>
  );
}

function Arquivados({ secao, bms, ctx }: { secao: Secao; bms: Bm[]; ctx: Contexto }) {
  const bmsArquivadas = bms.filter((bm) => !bm.ativo);
  if (secao.total === 0 && bmsArquivadas.length === 0) return null;

  return (
    <details className="glass-lite glass-static p-4">
      <summary className="cursor-pointer text-[13.5px] text-ink-dim">
        Arquivados · {secao.total} {secao.total === 1 ? "número" : "números"}
        {bmsArquivadas.length > 0 && `, ${bmsArquivadas.length} ${bmsArquivadas.length === 1 ? "BM" : "BMs"}`}
      </summary>
      <div className="mt-3 grid items-start gap-4 md:grid-cols-2">
        {bmsArquivadas
          .filter((bm) => !secao.grupos.some((g) => g.bm.id === bm.id))
          .map((bm) => (
            <CardBm key={bm.id} bm={bm} numeros={[]} ctx={ctx} />
          ))}
        {secao.grupos.map(({ bm, numeros }) => (
          <CardBm key={bm.id} bm={bm} numeros={numeros} ctx={ctx} />
        ))}
      </div>
    </details>
  );
}
