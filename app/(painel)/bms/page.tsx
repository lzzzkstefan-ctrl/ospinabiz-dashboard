import { Etiqueta } from "@/components/ui/etiqueta";
import { ehAdmin } from "@/lib/auth/papeis";
import { listarBmsComNumeros, type BmComNumeros } from "@/modulos/bms/dados";
import { formatarTelefone } from "@/modulos/bms/regras";
import { Suspense } from "react";
import { BotaoAtivo } from "./_componentes/botao-ativo";
import { FormNovaBm } from "./_componentes/form-nova-bm";
import { FormNovoNumero } from "./_componentes/form-novo-numero";

// BMs e números que o monitor testa. Todo mundo logado vê; só admin cadastra e ativa/desativa.
export default function BmsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight">BMs e números</h1>
        <p className="mt-1 text-[13.5px] text-ink-dim">
          Os números de WhatsApp que o monitor testa, agrupados por BM.
        </p>
      </div>
      <Suspense fallback={<p className="text-[13.5px] text-ink-faint">Carregando...</p>}>
        <ConteudoBms />
      </Suspense>
    </div>
  );
}

async function ConteudoBms() {
  const [admin, bms] = await Promise.all([ehAdmin(), listarBmsComNumeros()]);
  const ativos = bms.flatMap((bm) => (bm.ativo ? bm.numeros.filter((n) => n.ativo) : []));

  return (
    <>
      <p className="text-[13.5px] text-ink-dim">
        <span className="font-semibold text-white">{ativos.length}</span> números ativos em{" "}
        <span className="font-semibold text-white">{bms.filter((bm) => bm.ativo).length}</span> BMs ativas
      </p>

      {admin && (
        <section className="glass grid gap-6 p-5 md:grid-cols-2">
          <FormNovaBm />
          <FormNovoNumero bms={bms.filter((bm) => bm.ativo).map(({ id, nome }) => ({ id, nome }))} />
        </section>
      )}

      {bms.length === 0 ? (
        <div className="glass-lite glass-static p-5 text-[13.5px] text-ink-dim">
          Nenhuma BM cadastrada ainda.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {bms.map((bm) => (
            <CardBm key={bm.id} bm={bm} admin={admin} />
          ))}
        </div>
      )}
    </>
  );
}

function CardBm({ bm, admin }: { bm: BmComNumeros; admin: boolean }) {
  return (
    <section className={`glass-lite glass-static flex flex-col gap-3 p-4 ${bm.ativo ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2 border-b border-line-soft pb-2.5">
        <h2 className="truncate text-[17px]">{bm.nome}</h2>
        {!bm.ativo && <Etiqueta cor="cinza">inativa</Etiqueta>}
        <span className="ml-auto shrink-0 text-[12px] text-ink-faint">
          {bm.numeros.length} {bm.numeros.length === 1 ? "número" : "números"}
        </span>
        {admin && <BotaoAtivo tabela="bm" id={bm.id} ativo={bm.ativo} />}
      </div>

      {bm.numeros.length === 0 ? (
        <p className="text-[13px] text-ink-faint">Nenhum número nesta BM.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {bm.numeros.map((n) => (
            <li key={n.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${n.ativo ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-white">{n.apelido}</p>
                <p className="text-[12px] tabular-nums text-ink-faint">{formatarTelefone(n.telefone)}</p>
              </div>
              {!n.ativo && <Etiqueta cor="cinza">inativo</Etiqueta>}
              {admin && <BotaoAtivo tabela="numero" id={n.id} ativo={n.ativo} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
