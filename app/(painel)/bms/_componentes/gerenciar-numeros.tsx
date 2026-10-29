"use client";

import { Aviso, Campo, classeOpcao, classeSelect } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hojeBrasilia, type Bm, type Pessoa, type Situacao } from "@/modulos/bms/regras";
import { useActionState, useEffect, useState } from "react";
import { mudarSituacao, type EstadoForm } from "../acoes";
import { EditarBm } from "./form-editar";
import { FormNovaBm } from "./form-nova-bm";
import { FormNovoNumero } from "./form-novo-numero";

// "Gerenciar números" (só admin): botão discreto que abre um modal para cadastrar número reserva,
// mudar a situação de um número e cuidar das BMs. Fica fora da tela principal para não poluir.

export type NumeroParaGerenciar = { id: number; rotulo: string; situacao: Situacao; principal: boolean; temInicio: boolean };

export function GerenciarNumeros({ bms, equipe, numeros }: { bms: Bm[]; equipe: Pessoa[]; numeros: NumeroParaGerenciar[] }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  const bmsAtivas = bms.filter((bm) => bm.ativo && !bm.banida_em).map(({ id, nome }) => ({ id, nome }));

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-full border border-line-soft px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-bg-raised-2 hover:text-white"
      >
        Gerenciar números
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[60] grid place-items-start justify-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={() => setAberto(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gerenciar números"
            className="my-8 flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-line bg-[#0a1418] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <h2 className="text-[19px]">Gerenciar números</h2>
              <button type="button" onClick={() => setAberto(false)} className="ml-auto rounded-full px-3 py-1.5 text-[13px] text-ink-dim hover:bg-bg-raised-2 hover:text-white">
                Fechar
              </button>
            </div>

            <Bloco titulo="Mudar situação">
              <MudarSituacao numeros={numeros} />
            </Bloco>

            <Bloco titulo="Adicionar número reserva">
              <FormNovoNumero bms={bmsAtivas} equipe={equipe} />
            </Bloco>

            <Bloco titulo="BMs">
              <div className="flex flex-col gap-3">
                <FormNovaBm />
                <ul className="flex flex-col">
                  {bms.map((bm) => (
                    <li key={bm.id} className="flex flex-wrap items-center gap-2 border-b border-line-soft py-2 text-[13.5px] last:border-b-0">
                      <span className={bm.ativo && !bm.banida_em ? "text-white" : "text-ink-faint"}>{bm.nome}</span>
                      {bm.banida_em && <span className="text-[12px] text-ink-faint">banida</span>}
                      {!bm.ativo && <span className="text-[12px] text-ink-faint">arquivada</span>}
                      <EditarBm bm={bm} />
                    </li>
                  ))}
                </ul>
              </div>
            </Bloco>
          </div>
        </div>
      )}
    </>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line-soft pt-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{titulo}</p>
      {children}
    </section>
  );
}

const NOMES_SITUACAO: Record<Situacao, string> = { operacao: "Em operação", reserva: "Reserva", desconectado: "Desconectado", banido: "Banido" };

function MudarSituacao({ numeros }: { numeros: NumeroParaGerenciar[] }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(mudarSituacao, {});
  const [id, setId] = useState<number | null>(null);
  const escolhido = numeros.find((n) => n.id === id) ?? null;
  const hoje = hojeBrasilia();

  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Campo rotulo="Número">
          <select name="id" required value={id ?? ""} onChange={(e) => setId(Number(e.target.value) || null)} className={classeSelect}>
            <option value="" disabled className={classeOpcao}>
              Escolha o número
            </option>
            {numeros.map((n) => (
              <option key={n.id} value={n.id} className={classeOpcao}>
                {n.rotulo} · {NOMES_SITUACAO[n.situacao]}
                {n.principal ? " · principal" : ""}
              </option>
            ))}
          </select>
        </Campo>
        {/* key: ao trocar de número, os campos voltam para a situação atual dele */}
        <Campo rotulo="Nova situação" key={`s${id}`}>
          <select name="situacao" defaultValue={escolhido?.situacao ?? "operacao"} className={classeSelect}>
            {(Object.keys(NOMES_SITUACAO) as Situacao[]).map((s) => (
              <option key={s} value={s} className={classeOpcao}>
                {NOMES_SITUACAO[s]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Data">
          <Input type="date" name="data" defaultValue={hoje} max={hoje} className="[color-scheme:dark]" />
        </Campo>
      </div>
      <input type="hidden" name="tem_inicio" value={String(escolhido?.temInicio ?? false)} />
      <label className="flex items-center gap-2 text-[13px] text-ink-dim" key={`p${id}`}>
        <input type="checkbox" name="principal" defaultChecked={escolhido?.principal ?? false} className="accent-[var(--accent)]" />
        Número principal (card grande no topo)
      </label>
      <p className="m-0 text-[11.5px] text-ink-faint">
        Banido: a data vira a data do ban. Principal em operação pela primeira vez: a data começa o contador “dias sem ban”. Nada é apagado: leads, vendas e testes continuam ligados ao número.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={salvando || !id}>
          {salvando ? "Salvando..." : "Salvar situação"}
        </Button>
        <Aviso estado={estado} />
      </div>
    </form>
  );
}
