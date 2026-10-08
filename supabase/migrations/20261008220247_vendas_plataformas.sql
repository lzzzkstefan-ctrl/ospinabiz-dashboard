-- Vendas: plataforma da venda (Hubla / Kirvano), igual ao Lock in do masterview.
-- - Padrão 'hubla': o webhook e as importações não precisam informar.
-- - Toda venda que já existe veio da Hubla (webhook, planilha da Hubla ou o backup do Lock
--   in, que só tem Hubla) → 'hubla'. O default preenche as linhas existentes na hora.
-- - Kirvano só entra por lançamento manual (Nova venda / editar): não há webhook dela.

alter table public.vendas
  add column plataforma text not null default 'hubla' check (plataforma in ('hubla', 'kirvano'));
