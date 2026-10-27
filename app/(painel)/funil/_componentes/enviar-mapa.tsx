"use client";

// Envio dos JSON das automações (Mapa do funil). O arquivo é lido AQUI, no navegador: para o servidor
// vai só a estrutura (tipo de bloco, ordem, primeiras palavras e caminhos).

import { Aviso, type EstadoForm } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { lerMapas, type MapaLido } from "@/modulos/funil/mapa-fluxo";
import { useState, useTransition } from "react";
import { salvarMapas } from "../acoes";

export function EnviarMapa() {
  const [mapas, setMapas] = useState<MapaLido[]>([]);
  const [estado, setEstado] = useState<EstadoForm>({});
  const [pendente, iniciar] = useTransition();

  async function ler(arquivos: FileList | null) {
    setEstado({});
    const lidos: MapaLido[] = [];
    for (const arquivo of Array.from(arquivos ?? [])) {
      if (arquivo.size > 20_000_000) {
        lidos.push({ nome: arquivo.name, arquivo: arquivo.name, blocos: [], caminhos: [], avisos: ["Arquivo maior que 20 MB."] });
        continue;
      }
      try {
        lidos.push(...lerMapas(JSON.parse(await arquivo.text()), arquivo.name));
      } catch {
        lidos.push({ nome: arquivo.name, arquivo: arquivo.name, blocos: [], caminhos: [], avisos: ["Não é um JSON válido."] });
      }
    }
    setMapas(lidos);
  }

  const validos = mapas.filter((m) => m.blocos.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex w-fit cursor-pointer flex-col gap-1 text-[12.5px] text-ink-dim">
        Arquivos JSON exportados das automações (pode escolher vários)
        <input
          type="file"
          accept=".json,application/json"
          multiple
          onChange={(e) => ler(e.target.files)}
          className="text-[13px] text-ink file:mr-3 file:rounded-full file:border file:border-line file:bg-transparent file:px-3 file:py-1.5 file:text-ink"
        />
      </label>
      {mapas.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
          {mapas.map((m, i) => (
            <li key={`${m.arquivo}-${i}`} className="flex flex-wrap gap-x-3">
              <span className="text-white">{m.nome}</span>
              <span className="tabular-nums text-ink-dim">
                {m.blocos.length} mensagens · {m.caminhos.length} caminho{m.caminhos.length === 1 ? "" : "s"}
              </span>
              {m.avisos.map((a) => (
                <span key={a} className="text-[rgb(var(--tag-laranja))]">
                  {a}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pendente || !validos.length}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarMapas(validos.map(({ nome, arquivo, blocos, caminhos }) => ({ nome, arquivo, blocos, caminhos })));
              setEstado(r);
              if (r.ok) setMapas([]);
            })
          }
        >
          {pendente ? "Salvando…" : `Salvar ${validos.length || ""} fluxo${validos.length === 1 ? "" : "s"}`.replace("  ", " ")}
        </Button>
        <Aviso estado={estado} />
      </div>
    </div>
  );
}
