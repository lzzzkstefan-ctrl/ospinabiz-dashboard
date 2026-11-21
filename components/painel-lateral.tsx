"use client";

// Painel que abre pela direita (detalhe de projeto, bloco de funil...). Fecha no X, no Esc e clicando
// fora. No celular ocupa a tela toda.

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function PainelLateral({ titulo, onFechar, children, acoes }: { titulo: ReactNode; onFechar: () => void; children: ReactNode; acoes?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[2px]" onClick={onFechar}>
      <aside
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[560px] flex-col border-l border-line bg-[rgb(var(--bg-rgb)/0.96)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0 flex-1">{titulo}</div>
          {acoes}
          <button type="button" aria-label="Fechar" onClick={onFechar} className="grid size-8 place-items-center rounded-full text-ink-faint hover:bg-bg-raised-2 hover:text-white">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}
