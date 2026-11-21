// Acesso à central de gestão (21/11/2026): app_metadata.gestao = true, só no Davi e no Rodrigo.
// Arquivo sem dependência do servidor: o proxy.ts usa sem puxar cookies/headers.
export const temGestao = (appMetadata: unknown): boolean => (appMetadata as { gestao?: unknown } | null | undefined)?.gestao === true;
