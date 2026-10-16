import { Etiqueta } from "@/components/ui/etiqueta";
import { ehAdmin } from "@/lib/auth/papeis";
import { listarBms, listarEquipe, totaisDosNumeros, type TotaisNumero } from "@/modulos/bms/dados";
import {
  agruparEmSecoes,
  dataBR,
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

// BMs e números organizados em: Ativos com acesso / Ativos sem acesso / Fora da operação / Levou ban.
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
  const ban = secoes.find((s) => s.id === "levou_ban")!;
  const totais = await totaisDosNumeros(ban.grupos.flatMap((g) => g.numeros.map((n) => n.id)));
  const ctx: Contexto = { admin, bmsParaSelect: bms.filter((bm) => bm.ativo).map(({ id, nome }) => ({ id, nome })), equipe };

  const emOperacao = bms.flatMap((bm) => bm.numeros.filter((n) => bm.ativo && !bm.banida_em && n.ativo && n.situacao === "operacao").map((n) => ({ n, bm })));
  const testaveis = emOperacao.filter(({ n, bm }) => entraNoTeste(n, bm)).length;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Resumo valor={emOperacao.length} rotulo="em operação" />
        <Resumo valor={testaveis} rotulo="prontos para o monitor" />
        <Resumo valor={emOperacao.length - testaveis} rotulo="faltando telefone" />
      </div>

      {admin && (
        <section className="glass grid gap-6 p-5 md:grid-cols-[1fr_2fr]" suppressHydrationWarning>
          <FormNovaBm />
          <FormNovoNumero bms={ctx.bmsParaSelect} equipe={equipe} />
        </section>
      )}

      {secoes
        .filter((s) => s.id !== "arquivados" && s.id !== "levou_ban")
        .map((secao) => (
          <BlocoSecao key={secao.id} secao={secao} ctx={ctx} />
        ))}

      <Arquivados secao={secoes.find((s) => s.id === "arquivados")!} bms={bms} ctx={ctx} />
      <LevouBan secao={ban} bms={bms} totais={totais} ctx={ctx} />
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
      {numero.situacao === "banido" && <Etiqueta cor="vermelho">banido</Etiqueta>}
      {numero.situacao === "desconectado" && <Etiqueta cor="cinza">desconectado</Etiqueta>}
      {numero.telefone ? (
        <span className="text-[12px] tabular-nums text-ink-dim">{formatarTelefone(numero.telefone)}</span>
      ) : (
        // fora da operação o telefone não faz falta (o monitor não testa)
        numero.situacao === "operacao" && <Etiqueta cor="laranja">falta telefone</Etiqueta>
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

/**
 * BMs banidas e números banidos (de BMs ativas), recolhido por padrão. Card apagado: só o selo de
 * banida fica vermelho. Cada número mostra os leads e vendas que gerou (continuam nos relatórios).
 */
function LevouBan({ secao, bms, totais, ctx }: { secao: Secao; bms: Bm[]; totais: Map<number, TotaisNumero>; ctx: Contexto }) {
  // BM banida sem nenhum número também aparece
  const vazias = bms.filter((bm) => bm.ativo && bm.banida_em && !secao.grupos.some((g) => g.bm.id === bm.id));
  const grupos = [...secao.grupos, ...vazias.map((bm) => ({ bm, numeros: [] as Numero[] }))].sort(
    (a, b) => (b.bm.banida_em ?? "").localeCompare(a.bm.banida_em ?? "") || a.bm.nome.localeCompare(b.bm.nome),
  );
  const nBms = grupos.filter((g) => g.bm.banida_em).length;
  if (grupos.length === 0) return null;

  return (
    <details className="glass-lite glass-static p-4">
      <summary className="cursor-pointer text-[13.5px] text-ink-dim">
        Levou ban · {secao.total} {secao.total === 1 ? "número" : "números"}
        {nBms > 0 && `, ${nBms} ${nBms === 1 ? "BM" : "BMs"}`}
      </summary>
      <p className="m-0 mt-2 text-[12px] text-ink-faint">
        Fora do monitor, dos alertas e do contador de ativos. Leads e vendas de cada número contam pela primeira conversa do lead e continuam nos relatórios.
      </p>
      <div className="mt-3 grid items-start gap-4 md:grid-cols-2">
        {grupos.map(({ bm, numeros }) => (
          <CardBanido key={bm.id} bm={bm} numeros={numeros} totais={totais} ctx={ctx} />
        ))}
      </div>
    </details>
  );
}

function CardBanido({ bm, numeros, totais, ctx }: { bm: Bm; numeros: Numero[]; totais: Map<number, TotaisNumero>; ctx: Contexto }) {
  const soma = numeros.reduce((s, n) => ({ leads: s.leads + (totais.get(n.id)?.leads ?? 0), vendas: s.vendas + (totais.get(n.id)?.vendas ?? 0) }), { leads: 0, vendas: 0 });
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line-soft bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft pb-2.5">
        <h3 className="truncate text-[17px] text-ink-dim">{bm.nome}</h3>
        {bm.banida_em && <Etiqueta cor="vermelho">banida</Etiqueta>}
        <span className="text-[12px] text-ink-faint">
          {bm.banida_em ? `tinha ${bm.numeros.length} ${bm.numeros.length === 1 ? "número" : "números"}` : `${numeros.length} ${numeros.length === 1 ? "número banido" : "números banidos"}`}
        </span>
        {ctx.admin && <EditarBm bm={bm} />}
      </div>
      {bm.banida_em && (
        <p className="m-0 text-[12.5px] text-ink-faint">
          Banida em <span className="tabular-nums text-ink-dim">{dataBR(bm.banida_em)}</span>
          {bm.ban_motivo ? ` · ${bm.ban_motivo}` : " · sem motivo informado"}
        </p>
      )}
      {numeros.length > 0 && (
        <ul className="flex flex-col">
          {numeros.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft py-2 text-[12.5px] tabular-nums text-ink-faint last:border-b-0">
              <span className="w-12 text-[15px] font-semibold text-ink-dim">{n.final}</span>
              <span>{formatarLimite(n.limite)}</span>
              <span>{n.responsavel?.nome ?? "sem responsável"}</span>
              {!bm.banida_em && n.banido_em && <span>ban {dataBR(n.banido_em)}</span>}
              <span className="text-ink-dim">
                {contagem(totais.get(n.id)?.leads ?? 0, "lead", "leads")} · {contagem(totais.get(n.id)?.vendas ?? 0, "venda", "vendas")}
              </span>
              {ctx.admin && <EditarNumero numero={n} bms={ctx.bmsParaSelect} equipe={ctx.equipe} />}
            </li>
          ))}
          {numeros.length > 1 && (
            <li className="flex justify-end pt-2 text-[12.5px] tabular-nums text-ink-faint">
              Total: {contagem(soma.leads, "lead", "leads")} · {contagem(soma.vendas, "venda", "vendas")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const contagem = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
