import type { MetadataRoute } from "next";

// App instalável (PWA): "Adicionar à tela de início" no celular. No iPhone é o único jeito de
// receber notificação (iOS 16.4+, abrindo pelo ícone). Docs: guides/progressive-web-apps.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GCS Staff · Ospinabiz",
    // nome embaixo do ícone no celular (pedido do Davi, 10/10/2026)
    short_name: "GCS Staff",
    description: "Dashboard interno da Ospinabiz",
    start_url: "/escala",
    scope: "/",
    display: "standalone",
    background_color: "#000607",
    theme_color: "#000607",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png?v=3", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png?v=3", sizes: "512x512", type: "image/png" },
      // Android corta em círculo: versão com o desenho menor e fundo preto
      { src: "/icone-maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icone-1024.png?v=3", sizes: "1024x1024", type: "image/png" },
    ],
  };
}
