"use client";

import { useEffect } from "react";

/**
 * A borda animada do .glass (conic-gradient girando) é redesenhada a cada
 * quadro, mesmo fora da tela. Isto pausa a animação dos .glass que saíram da
 * tela e retoma quando voltam. Vigia também os .glass que entram depois
 * (troca de página, modais).
 */
export function PausarBrilhoForaDaTela() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) e.target.classList.toggle("glass-fora-da-tela", !e.isIntersecting);
      },
      { rootMargin: "100px" },
    );
    const vigiados = new WeakSet<Element>();
    const vigiar = (raiz: ParentNode) => {
      raiz.querySelectorAll(".glass").forEach((el) => {
        if (vigiados.has(el)) return;
        vigiados.add(el);
        io.observe(el);
      });
    };

    // .glass que saiu da página: para de vigiar, senão fica preso na memória
    const soltar = (n: Element) => {
      const lista = n.classList.contains("glass") ? [n, ...n.querySelectorAll(".glass")] : n.querySelectorAll(".glass");
      lista.forEach((el) => {
        if (!vigiados.has(el)) return;
        vigiados.delete(el);
        io.unobserve(el);
      });
    };

    // com "menos movimento" ligado a borda nem anima (globals.css): nada a pausar
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => io.disconnect();

    vigiar(document);
    const mo = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        m.removedNodes.forEach((n) => {
          if (n instanceof Element && !n.isConnected) soltar(n);
        });
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.classList.contains("glass") && !vigiados.has(n)) {
            vigiados.add(n);
            io.observe(n);
          }
          vigiar(n);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return null;
}
