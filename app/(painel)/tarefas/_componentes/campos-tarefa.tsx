import { Campo, classeOpcao, classeSelect } from "@/components/formulario";
import { Input } from "@/components/ui/input";
import type { OpcoesTarefa } from "@/modulos/tarefas/dados";
import type { Tarefa } from "@/modulos/tarefas/regras";

// Campos da tarefa (criar e editar). `tarefa` preenche os valores atuais.
export function CamposTarefa({ opcoes, tarefa }: { opcoes: OpcoesTarefa; tarefa?: Tarefa }) {
  const vinculoAtual = tarefa?.numero ? `numero:${tarefa.numero.id}` : tarefa?.bm ? `bm:${tarefa.bm.id}` : "";

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Campo rotulo="Título" className="sm:col-span-3">
        <Input name="titulo" maxLength={200} required placeholder="O que precisa ser feito?" defaultValue={tarefa?.titulo} />
      </Campo>
      <Campo rotulo="Responsável">
        <select name="responsavel_id" defaultValue={tarefa?.responsavel?.id ?? ""} className={classeSelect}>
          <option value="" className={classeOpcao}>
            Ninguém
          </option>
          {opcoes.equipe.map((p) => (
            <option key={p.id} value={p.id} className={classeOpcao}>
              {p.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Prazo">
        <Input type="date" name="prazo" defaultValue={tarefa?.prazo ?? ""} />
      </Campo>
      <Campo rotulo="Vínculo (opcional)">
        <select name="vinculo" defaultValue={vinculoAtual} className={classeSelect}>
          <option value="" className={classeOpcao}>
            Nenhum
          </option>
          {opcoes.bms.map((bm) => (
            <optgroup key={bm.id} label={bm.nome} className={classeOpcao}>
              <option value={`bm:${bm.id}`} className={classeOpcao}>
                {bm.nome} (BM inteira)
              </option>
              {bm.numeros.map((n) => (
                <option key={n.id} value={`numero:${n.id}`} className={classeOpcao}>
                  {n.final} · {bm.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Campo>
    </div>
  );
}
