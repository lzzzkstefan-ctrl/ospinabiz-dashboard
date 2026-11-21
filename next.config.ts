import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // service worker das notificações: nunca em cache (sempre a versão nova) e só scripts do próprio site
  // (docs: guides/progressive-web-apps, "Securing your application")
  // Usuários e o diagnóstico das notificações foram para Configurações (21/11/2026)
  async redirects() {
    return [
      { source: "/admin/usuarios", destination: "/configuracoes/usuarios", permanent: false },
      { source: "/admin/notificacoes", destination: "/configuracoes/diagnostico", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
