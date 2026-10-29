import { Etiqueta, type CorEtiqueta } from "@/components/ui/etiqueta";
import { ehAdmin } from "@/lib/auth/papeis";
import { comparacaoDoTeste, listarBms, listarEquipe, saudeDosNumeros, totaisDosNumeros, type Periodo, type SaudeNumero, type TotaisNumero } from "@/modulos/bms/dados";
import { agruparEmSecoes, dataBR, ehPrincipal, formatarLimite, hojeBrasilia, type Bm, type Numero, type Qualidade, type Secao } from "@/modulos/bms/regras";
import { alertasDoNumero, diasEntre, type Comparacao, type LadoComparacao } from "@/modulos/bms/saude";
import { Suspense } from "react";
import { EditarSaude } from "./_componentes/editar-saude";
import { GerenciarNumeros } from "./_componentes/gerenciar-numeros";

// Aba BMs: saúde dos números principais (teste: 2 números numa BM isolada) no topo, a comparação
// "antes x agora" e o Arquivo (todo o resto, recolhido e só leitura). Todo mundo logado vê; só admin
// edita (card do número e "Gerenciar números"). Contexto em docs/modulos/bms.md.
export default function BmsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense
        fallback={
          <>
            <Titulo />
            <p className="text-[13.5px] text-ink-faint">Carregando...</p>
          </>
        }
      >
        <ConteudoBms />
      </Suspense>
    </div>
  );
}

function Titulo({ acao }: { acao?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div>
        <h1 className="text-[28px] leading-tight">BMs e números</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">A saúde dos números principais da operação. O resto fica no Arquivo.</p>
      </div>
      {acao && <div className="ml-auto pt-1">{acao}</div>}
    </div>
  );
}

async function ConteudoBms() {
  const [admin, bms, equipe] = await Promise.all([ehAdmin(), listarBms(), listarEquipe()]);
  const principais = bms.flatMap((bm) => bm.numeros.filter((n) => ehPrincipal(n, bm)).map((n) => ({ n, bm })));
  const secoes = agruparEmSecoes(bms);
  const ban = secoes.find((s) => s.id === "levou_ban")!;
  const [saude, totais, comparacao] = await Promise.all([
    saudeDosNumeros(
      principais.map((p) => p.n),
      admin,
    ),
    totaisDosNumeros(ban.grupos.flatMap((g) => g.numeros.map((n) => n.id))),
    admin
      ? comparacaoDoTeste(
          bms,
          principais.map((p) => p.n),
        )
      : null,
  ]);

  const paraGerenciar = bms
    .filter((bm) => bm.ativo)
    .flatMap((bm) =>
      bm.numeros
        .filter((n) => n.ativo)
        .map((n) => ({ id: n.id, rotulo: `${n.final} · ${bm.nome}`, situacao: n.situacao, principal: n.principal, temInicio: !!n.em_operacao_desde })),
    );

  return (
    <>
      <Titulo acao={admin && <GerenciarNumeros bms={bms} equipe={equipe} numeros={paraGerenciar} />} />

      <section className="flex flex-col gap-3">
        <h2 className="mb-1 border-b border-line-soft pb-2.5 text-[19px]">
          Números em operação <span className="text-[14px] font-normal text-ink-faint">· {principais.length}</span>
        </h2>
        {principais.length === 0 ? (
          <p className="text-[13px] text-ink-faint">Nenhum número principal. {admin ? "Marque em “Gerenciar números”." : ""}</p>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {principais.map(({ n, bm }) => (
              <CardPrincipal key={n.id} numero={n} bm={bm} saude={saude.get(n.id)!} admin={admin} />
            ))}
          </div>
        )}
        {!admin && <p className="m-0 text-[12px] text-ink-faint">Leads e vendas: só os seus. Mensagens, custo e a comparação do teste aparecem só para admin.</p>}
      </section>

      {comparacao && <BlocoComparacao c={comparacao} />}

      <Arquivo secoes={secoes} bms={bms} totais={totais} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Card do número principal
// ---------------------------------------------------------------------------

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (v: number) => v.toLocaleString("pt-BR");
const COR_QUALIDADE: Record<Qualidade, CorEtiqueta> = { verde: "verde", amarela: "laranja", vermelha: "vermelho" };
const SITUACAO: Record<Numero["situacao"], { nome: string; cor: CorEtiqueta }> = {
  operacao: { nome: "Em operação", cor: "verde" },
  reserva: { nome: "Reserva", cor: "azul" },
  desconectado: { nome: "Desconectado", cor: "cinza" },
  banido: { nome: "Banido", cor: "vermelho" },
};

/** "🫆1072" → "🫆 1072"; sem nome da Data Crazy, o final. */
const nomeDoCard = (n: Numero, s: SaudeNumero) => (s.nome ? s.nome.replace(/\s*(\d{4})/, " $1").trim() : n.final);

function CardPrincipal({ numero: n, bm, saude: s, admin }: { numero: Numero; bm: Bm; saude: SaudeNumero; admin: boolean }) {
  const hoje = hojeBrasilia();
  const alertas = alertasDoNumero({ qualidade: s.qualidade, limite: s.limite, contatosHoje: s.contatosHoje });
  const grave = s.qualidade === "vermelha";
  const sit = SITUACAO[n.situacao];
  const dias = n.em_operacao_desde ? diasEntre(n.em_operacao_desde, hoje) : null;
  const manual = s.meta.fonte === "manual";

  return (
    <article
      className={`glass-lite glass-static flex flex-col gap-4 p-5 ${alertas.length ? (grave ? "!border-[rgb(var(--tag-vermelho)/0.6)]" : "!border-[rgb(var(--tag-laranja)/0.6)]") : ""}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[26px] font-semibold leading-none text-white">{nomeDoCard(n, s)}</h3>
        <Etiqueta cor={sit.cor}>{sit.nome}</Etiqueta>
        <span className="text-[12.5px] text-ink-dim">
          {n.ddd ? `DDD ${n.ddd} · ` : ""}
          {bm.nome}
        </span>
        {admin && <EditarSaude numero={n} metaLigada={!manual} />}
      </header>

      {alertas.length > 0 && (
        <ul
          role="alert"
          className={`m-0 flex list-none flex-col gap-1 rounded-xl border p-3 text-[13px] ${grave ? "border-[rgb(var(--tag-vermelho)/0.5)] bg-[rgb(var(--tag-vermelho)/0.08)]" : "border-[rgb(var(--tag-laranja)/0.5)] bg-[rgb(var(--tag-laranja)/0.08)]"} text-white`}
        >
          {alertas.map((a) => (
            <li key={a}>⚠ {a}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
        <Indicador rotulo="Dias sem ban">
          {dias === null ? (
            <span className="text-[13px] text-ink-faint">sem data de início</span>
          ) : (
            <>
              <span className="text-[34px] font-semibold leading-none tabular-nums text-white">{n.situacao === "banido" && n.banido_em ? diasEntre(n.em_operacao_desde!, n.banido_em) : dias}</span>
              <span className="text-[12px] text-ink-dim">
                {n.situacao === "banido" && n.banido_em ? `banido em ${dataBR(n.banido_em)}` : `em operação desde ${dataBR(n.em_operacao_desde!)}`}
              </span>
            </>
          )}
        </Indicador>
        <Indicador rotulo="Limite (tier)" fonte={manual ? "manual" : "Meta"}>
          <span className="text-[22px] font-semibold leading-none tabular-nums text-white">{s.limite ? formatarLimite(s.limite) : "?"}</span>
          {s.contatosHoje !== null && s.limite ? (
            <span className="text-[12px] tabular-nums text-ink-dim">
              {inteiro(s.contatosHoje)} contatos hoje ({Math.round((s.contatosHoje / s.limite) * 100)}%)
            </span>
          ) : (
            <span className="text-[12px] text-ink-faint">contatos por 24 h</span>
          )}
        </Indicador>
        <Indicador rotulo="Qualidade" fonte={manual ? "manual" : "Meta"}>
          {s.qualidade ? (
            <Etiqueta cor={COR_QUALIDADE[s.qualidade]} className="self-start text-[13px]">
              {s.qualidade}
            </Etiqueta>
          ) : (
            <span className="text-[13px] text-ink-faint">não informada</span>
          )}
        </Indicador>
      </div>
      {manual && admin && s.meta.fonte === "manual" && <p className="-mt-2 m-0 text-[11.5px] text-ink-faint">Limite e qualidade manuais ({s.meta.motivo}). Com o META_CUSTO_TOKEN, vêm da Meta.</p>}

      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-ink-faint">
            <th className="pb-1.5 text-left font-normal"></th>
            <th className="pb-1.5 text-right font-normal">Leads</th>
            <th className="pb-1.5 text-right font-normal">Mensagens</th>
            <th className="pb-1.5 text-right font-normal">Custo</th>
            <th className="pb-1.5 text-right font-normal">Vendas</th>
          </tr>
        </thead>
        <tbody>
          <LinhaPeriodo rotulo="Hoje" p={s.hoje} />
          <LinhaPeriodo rotulo="7 dias" p={s.semana} />
        </tbody>
      </table>

      <dl className="m-0 grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-faint">Atendentes</dt>
        <dd className="m-0 text-ink">{s.atendentes.length ? s.atendentes.join(", ") : <span className="text-ink-faint">ninguém recebeu lead por ele nos últimos 7 dias</span>}</dd>
        <dt className="text-ink-faint">Último teste</dt>
        <dd className="m-0 text-ink">
          {s.ultimoTeste ? (
            <>
              {s.ultimoTeste.em ? dataHora(s.ultimoTeste.em) : "sem data"} · {s.ultimoTeste.resultado === "ok" ? "ok" : s.ultimoTeste.resultado === "falhou" ? "falhou" : s.ultimoTeste.resultado === "sem_resposta" ? "sem resposta" : "aguardando"}
            </>
          ) : (
            <span className="text-ink-faint">nenhum teste do monitor ainda</span>
          )}
        </dd>
        <dt className="text-ink-faint">Observação</dt>
        <dd className="m-0 text-ink">{n.observacao ?? <span className="text-ink-faint">nenhuma</span>}</dd>
      </dl>
    </article>
  );
}

function Indicador({ rotulo, fonte, children }: { rotulo: string; fonte?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line-soft bg-white/[0.02] p-3">
      <p className="m-0 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-ink-faint">
        {rotulo}
        {fonte && <span className="rounded-full border border-line-soft px-1.5 py-px text-[9.5px] normal-case tracking-normal">{fonte}</span>}
      </p>
      {children}
    </div>
  );
}

function LinhaPeriodo({ rotulo, p }: { rotulo: string; p: Periodo }) {
  return (
    <tr className="border-t border-line-soft">
      <td className="py-1.5 text-ink-dim">{rotulo}</td>
      <td className="py-1.5 text-right font-semibold text-white">{inteiro(p.leads)}</td>
      <td className="py-1.5 text-right text-ink">{p.mensagens === null ? "—" : inteiro(p.mensagens)}</td>
      <td className="py-1.5 text-right text-ink">{p.custo === null ? "—" : brl(p.custo)}</td>
      <td className="py-1.5 text-right font-semibold text-white">{inteiro(p.vendas)}</td>
    </tr>
  );
}

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// ---------------------------------------------------------------------------
// Comparação do teste
// ---------------------------------------------------------------------------

const um = (v: number | null, f: (x: number) => string) => (v === null ? "—" : f(v));
const decimal = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function BlocoComparacao({ c }: { c: Comparacao }) {
  const linhas: { rotulo: string; antes: string; agora: string; nota?: string }[] = [
    {
      rotulo: "Dias até o ban",
      antes: um(c.antes.diasAteBan, (v) => `${decimal(v)} dias`),
      agora: `${c.agora.diasAteBan} ${c.agora.diasAteBan === 1 ? "dia" : "dias"}${c.agora.aindaSemBan ? " e contando" : ""}`,
      nota: `antes: média de ${c.antes.numerosNaMedia} números banidos, do 1º lead até o ban`,
    },
    { rotulo: "Leads por dia", antes: um(c.antes.leadsPorDia, decimal), agora: um(c.agora.leadsPorDia, decimal) },
    { rotulo: "Custo por venda", antes: um(c.antes.custoPorVenda, brl), agora: um(c.agora.custoPorVenda, brl), nota: "mensagens cobradas ÷ vendas; antes conta desde 01/10, quando o custo começou a ser lido" },
  ];
  return (
    <section className="glass-lite glass-static flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[16px]">Antes (vários números) x Agora (2 números isolados)</h2>
        <span className="text-[12px] text-ink-faint">teste desde {dataBR(c.inicio)}</span>
      </div>
      <table className="w-full max-w-2xl text-[13px] tabular-nums">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-ink-faint">
            <th className="pb-1.5 text-left font-normal"></th>
            <th className="pb-1.5 text-right font-normal">Antes · {periodo(c.antes)}</th>
            <th className="pb-1.5 text-right font-normal">Agora · {periodo(c.agora)}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo} className="border-t border-line-soft">
              <td className="py-1.5 text-ink-dim">
                {l.rotulo}
                {l.nota && <span className="block text-[11px] text-ink-faint">{l.nota}</span>}
              </td>
              <td className="py-1.5 text-right text-ink">{l.antes}</td>
              <td className="py-1.5 text-right font-semibold text-white">{l.agora}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const periodo = (l: LadoComparacao) => `${l.dias} ${l.dias === 1 ? "dia" : "dias"}, ${l.vendas} ${l.vendas === 1 ? "venda" : "vendas"}`;

// ---------------------------------------------------------------------------
// Arquivo: todo o resto, recolhido e só leitura
// ---------------------------------------------------------------------------

function Arquivo({ secoes, bms, totais }: { secoes: Secao[]; bms: Bm[]; totais: Map<number, TotaisNumero> }) {
  const total = secoes.reduce((s, x) => s + x.total, 0);
  const bmsSemNumero = bms.filter((bm) => !bm.ativo && bm.numeros.length === 0);
  const ban = secoes.find((s) => s.id === "levou_ban")!;
  const bmsBanidasVazias = bms.filter((bm) => bm.ativo && bm.banida_em && !ban.grupos.some((g) => g.bm.id === bm.id));

  return (
    <details className="glass-lite glass-static p-4">
      <summary className="cursor-pointer text-[14px] text-ink-dim">
        Arquivo · {total} {total === 1 ? "número" : "números"}
        <span className="text-[12px] text-ink-faint"> · fora da operação, desconectados, reservas e banidos</span>
      </summary>
      <p className="m-0 mt-2 text-[12px] text-ink-faint">
        Só leitura. Nada é apagado: leads, vendas e testes continuam ligados a cada número (contam pela primeira conversa do lead).
      </p>
      <div className="mt-3 flex flex-col gap-5">
        {secoes
          .filter((s) => s.total > 0 || (s.id === "levou_ban" && bmsBanidasVazias.length) || (s.id === "arquivados" && bmsSemNumero.length))
          .map((s) => {
            const grupos = [
              ...s.grupos,
              ...(s.id === "levou_ban" ? bmsBanidasVazias : s.id === "arquivados" ? bmsSemNumero : []).map((bm) => ({ bm, numeros: [] as Numero[] })),
            ].sort((a, b) => (b.bm.banida_em ?? "").localeCompare(a.bm.banida_em ?? "") || a.bm.nome.localeCompare(b.bm.nome));
            return (
              <div key={s.id} className="flex flex-col gap-2">
                <h3 className="text-[15px] text-ink-dim">
                  {s.titulo} <span className="text-[13px] font-normal text-ink-faint">· {s.total}</span>
                </h3>
                <div className="grid items-start gap-3 md:grid-cols-2">
                  {grupos.map(({ bm, numeros }) => (
                    <CardArquivo key={bm.id} bm={bm} numeros={numeros} totais={s.id === "levou_ban" ? totais : null} />
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </details>
  );
}

function CardArquivo({ bm, numeros, totais }: { bm: Bm; numeros: Numero[]; totais: Map<number, TotaisNumero> | null }) {
  const soma = totais && numeros.reduce((s, n) => ({ leads: s.leads + (totais.get(n.id)?.leads ?? 0), vendas: s.vendas + (totais.get(n.id)?.vendas ?? 0) }), { leads: 0, vendas: 0 });
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line-soft bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft pb-2.5">
        <h4 className="truncate text-[16px] text-ink-dim">{bm.nome}</h4>
        {bm.banida_em && <Etiqueta cor="vermelho">banida</Etiqueta>}
        {!bm.ativo && <Etiqueta cor="cinza">arquivada</Etiqueta>}
        <span className="text-[12px] text-ink-faint">
          {numeros.length} {numeros.length === 1 ? "número" : "números"}
        </span>
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
              <Etiqueta cor={SITUACAO[n.situacao].cor}>{SITUACAO[n.situacao].nome.toLowerCase()}</Etiqueta>
              <span>{formatarLimite(n.limite)}</span>
              <span>{n.responsavel?.nome ?? "sem responsável"}</span>
              {!bm.banida_em && n.banido_em && <span>ban {dataBR(n.banido_em)}</span>}
              {totais && (
                <span className="text-ink-dim">
                  {contagem(totais.get(n.id)?.leads ?? 0, "lead", "leads")} · {contagem(totais.get(n.id)?.vendas ?? 0, "venda", "vendas")}
                </span>
              )}
            </li>
          ))}
          {soma && numeros.length > 1 && (
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
