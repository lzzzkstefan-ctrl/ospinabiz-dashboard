import { Campo, classeOpcao, classeSelect } from "@/components/formulario";
import { Input } from "@/components/ui/input";
import { LIMITES, formatarLimite, type Bm, type Numero, type Pessoa } from "@/modulos/bms/regras";

// Campos do formulário de número da tela de BMs.

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
