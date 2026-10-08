"use client";

import { createClient } from "@/lib/supabase/client";
import { BUCKET_CAPAS, caminhoParaArquivo } from "@/modulos/inicio/regras-capa";
import { useRef, useState, useTransition } from "react";
import { salvarCapa } from "../acoes-inicio";

// Botão "trocar capa" (só admin). A imagem vai direto do navegador para o Storage
// (sem passar pelo limite de tamanho do servidor) e depois o servidor grava qual é a capa.
export function TrocarCapa() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const aoEscolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;

    const conferido = caminhoParaArquivo(arquivo, Date.now());
    if ("erro" in conferido) {
      setErro(conferido.erro);
      return;
    }

    iniciar(async () => {
      setErro(null);
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET_CAPAS)
        .upload(conferido.caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) {
        setErro("Não deu para enviar a imagem.");
        return;
      }
      const resultado = await salvarCapa(conferido.caminho);
      if (resultado.erro) setErro(resultado.erro);
    });
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={aoEscolher} className="hidden" />
      <button
        type="button"
        disabled={enviando}
        onClick={() => inputRef.current?.click()}
        className="glass pointer-events-auto absolute right-6 top-6 rounded-full px-4 py-2 text-xs font-medium text-ink transition-colors hover:text-white disabled:opacity-60 md:top-[104px]"
      >
        {enviando ? "enviando..." : "trocar capa"}
      </button>
      {erro && (
        <p className="pointer-events-auto absolute right-6 top-16 rounded-full bg-background/80 px-3 py-1.5 text-xs text-accent-3 md:top-[148px]">
          {erro}
        </p>
      )}
    </>
  );
}
