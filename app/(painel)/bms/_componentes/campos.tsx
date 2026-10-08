import { Input } from "@/components/ui/input";
import { LIMITES, formatarLimite, type Bm, type Numero, type Pessoa } from "@/modulos/bms/regras";

// Peças dos formulários da tela de BMs.

export const classeSelect =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-ink shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const classeOpcao = "bg-[#0a1418]";

export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-ink-dim">
      {rotulo}
      {children}
    </label>
  );
}

/** Campos de um número (cadastro e edição). `numero` preenche os valores atuais. */
export function CamposNumero({
  bms,
  equipe,
  numero,
}: {
  bms: Pick<Bm, "id" | "nome">[];
  equipe: Pessoa[];
  numero?: Numero;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo rotulo="BM">
        <select name="bm_id" required defaultValue={numero?.bm_id ?? ""} className={classeSelect}>
          <option value="" disabled className={classeOpcao}>
            Escolha a BM
          </option>
          {bms.map((bm) => (
            <option key={bm.id} value={bm.id} className={classeOpcao}>
              {bm.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Final (4 dígitos)">
        <Input name="final" inputMode="numeric" maxLength={4} placeholder="0348" defaultValue={numero?.final} />
      </Campo>
      <Campo rotulo="Telefone completo (opcional)">
        <Input name="telefone" inputMode="tel" placeholder="(11) 99999-0348" defaultValue={numero?.telefone ?? ""} />
      </Campo>
      <Campo rotulo="Apelido na Data Crazy">
        <Input name="apelido" maxLength={60} placeholder="automático: final + BM" defaultValue={numero?.apelido} />
      </Campo>
      <Campo rotulo="Limite">
        <select name="limite" defaultValue={numero?.limite ?? ""} className={classeSelect}>
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
      <Campo rotulo="Responsável">
        <select name="responsavel_id" defaultValue={numero?.responsavel?.id ?? ""} className={classeSelect}>
          <option value="" className={classeOpcao}>
            Ninguém
          </option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id} className={classeOpcao}>
              {p.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Situação">
        <select name="situacao" defaultValue={numero?.situacao ?? "operacao"} className={classeSelect}>
          <option value="operacao" className={classeOpcao}>
            Em operação
          </option>
          <option value="desconectado" className={classeOpcao}>
            Desconectado
          </option>
        </select>
      </Campo>
    </div>
  );
}
