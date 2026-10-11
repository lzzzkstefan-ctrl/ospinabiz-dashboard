import { Campo, classeOpcao, classeSelect } from "@/components/formulario";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OpcoesTarefa } from "@/modulos/tarefas/dados";
import { AREAS, COLUNAS, PRIORIDADES, type Tarefa } from "@/modulos/tarefas/regras";

// Campos do modal de edição. Tarefa de webinário não mostra o vínculo (fica preso ao webinário).
export function CamposTarefa({ opcoes, tarefa }: { opcoes: OpcoesTarefa; tarefa: Tarefa }) {
  const vinculoAtual = tarefa.numero ? `numero:${tarefa.numero.id}` : tarefa.bm ? `bm:${tarefa.bm.id}` : "";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo rotulo="Título" className="sm:col-span-2">
        <Input name="titulo" maxLength={200} required defaultValue={tarefa.titulo} />
      </Campo>
      <Campo rotulo="Detalhes (opcional)" className="sm:col-span-2">
        <textarea name="descricao" maxLength={2000} rows={3} defaultValue={tarefa.descricao ?? ""} className={cn(classeSelect, "h-auto py-2")} />
      </Campo>
      <Campo rotulo="Coluna">
        <select name="status" defaultValue={tarefa.status} className={classeSelect}>
          {COLUNAS.map((c) => (
            <option key={c.id} value={c.id} className={classeOpcao}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Prioridade">
        <select name="prioridade" defaultValue={tarefa.prioridade} className={classeSelect}>
          {PRIORIDADES.map((p) => (
            <option key={p.id} value={p.id} className={classeOpcao}>
              {p.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Responsável">
        <select name="responsavel_id" defaultValue={tarefa.responsavel?.id ?? ""} className={classeSelect}>
          <option value="" className={classeOpcao}>
            Sem responsável
          </option>
          {opcoes.equipe.map((p) => (
            <option key={p.id} value={p.id} className={classeOpcao}>
              {p.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Área">
        <select name="area" defaultValue={tarefa.area ?? ""} className={classeSelect}>
          <option value="" className={classeOpcao}>
            Sem área
          </option>
          {AREAS.map((a) => (
            <option key={a} value={a} className={classeOpcao}>
              {a}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Prazo">
        <Input type="date" name="prazo" defaultValue={tarefa.prazo ?? ""} />
      </Campo>
      <Campo rotulo="Horário (opcional)">
        <Input type="time" name="prazo_hora" defaultValue={tarefa.prazo_hora?.slice(0, 5) ?? ""} />
      </Campo>
      {tarefa.webinario ? (
        <p className="m-0 text-[12.5px] text-ink-faint sm:col-span-2">Checklist do webinário {tarefa.webinario.nome}.</p>
      ) : (
        <Campo rotulo="Vínculo (opcional)" className="sm:col-span-2">
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
      )}
    </div>
  );
}
