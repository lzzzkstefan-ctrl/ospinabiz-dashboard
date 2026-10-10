import type { MetadataRoute } from "next";

// App instalável (PWA): "Adicionar à tela de início" no celular. No iPhone é o único jeito de
// receber notificação (iOS 16.4+, abrindo pelo ícone). Docs: guides/progressive-web-apps.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ospinabiz",
    short_name: "Ospinabiz",
    description: "Dashboard interno da Ospinabiz",
    start_url: "/escala",
    scope: "/",
    display: "standalone",
    background_color: "#000607",
    theme_color: "#000607",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
