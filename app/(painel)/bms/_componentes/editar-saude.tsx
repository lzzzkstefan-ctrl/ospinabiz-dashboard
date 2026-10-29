"use client";

import { Aviso, Campo, classeOpcao, classeSelect, Gaveta } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarLimite, hojeBrasilia, LIMITES, type Numero } from "@/modulos/bms/regras";
import { useActionState } from "react";
import { salvarSaude, type EstadoForm } from "../acoes";

// Edição do card do número principal (só admin). Limite e qualidade são manuais enquanto a Meta não
// informa (sem META_CUSTO_TOKEN); com o token, o card mostra o da Meta e estes ficam de reserva.

export function EditarSaude({ numero, metaLigada }: { numero: Numero; metaLigada: boolean }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarSaude, {});
  const hoje = hojeBrasilia();

  return (
    <Gaveta rotulo="Editar">
      <form action={acao} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={numero.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Telefone completo">
            <Input name="telefone" inputMode="tel" placeholder={`(${numero.ddd ?? "DDD"}) 9xxxx-${numero.final}`} defaultValue={numero.telefone ?? ""} />
          </Campo>
          <Campo rotulo="Em operação desde">
            <Input type="date" name="em_operacao_desde" max={hoje} defaultValue={numero.em_operacao_desde ?? ""} className="[color-scheme:dark]" />
          </Campo>
          <Campo rotulo={metaLigada ? "Limite (manual, reserva)" : "Limite (manual)"}>
            <select name="limite" defaultValue={numero.limite ?? ""} className={classeSelect}>
              <option value="" className={classeOpcao}>
                Não informado
              </option>
              {LIMITES.map((l) => (
                <option key={l} value={l} className={classeOpcao}>
                  {formatarLimite(l)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={metaLigada ? "Qualidade (manual, reserva)" : "Qualidade na Meta (manual)"}>
            <select name="qualidade" defaultValue={numero.qualidade ?? ""} className={classeSelect}>
              <option value="" className={classeOpcao}>
                Não informada
              </option>
              <option value="verde" className={classeOpcao}>
                Verde
              </option>
              <option value="amarela" className={classeOpcao}>
                Amarela
              </option>
              <option value="vermelha" className={classeOpcao}>
                Vermelha
              </option>
            </select>
          </Campo>
        </div>
        <Campo rotulo="Observação">
          <Input name="observacao" maxLength={300} placeholder="ex.: proxy X, isolado desde 29/10" defaultValue={numero.observacao ?? ""} />
        </Campo>
        <p className="m-0 text-[11.5px] text-ink-faint">Só texto descritivo. Nunca usuário, senha ou IP do proxy: a tela e o banco recusam.</p>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
          <Aviso estado={estado} />
        </div>
      </form>
    </Gaveta>
  );
}
