-- Medir o caminho do push até o aparelho (pedido do Davi, 02/11/2026). O servidor sabe que Apple/Google
-- aceitaram o aviso, mas não se ele chegou no aparelho.
--
-- 1. push_entregas: uma linha por aviso e aparelho. O id (uuid aleatório) vai dentro do aviso, que é cifrado
--    para o aparelho; o service worker devolve esse id em /api/push/recebido e a linha ganha recebido_em.
--    Guarda pessoa e aparelho em cópia: o histórico continua se a inscrição for removida.
-- 2. notificacoes_enviadas.recebido_em: quando o primeiro aparelho confirmou aquele aviso.
-- 3. push_inscricoes: aparelho_id (identifica o aparelho, guardado nele) e visto_em (app aberto por último).
-- 4. escala_alerta_estado.sem_ninguem_desde: início da contagem de 15 min da operação descoberta.
-- 5. Admin lê tudo isso para a tela de diagnóstico. Gravar continua só pelo servidor.

create table public.push_entregas (
  id           uuid primary key default gen_random_uuid(),
  aviso_id     bigint not null references public.notificacoes_enviadas (id) on delete cascade,
  usuario_id   uuid references auth.users (id) on delete set null,
  inscricao_id bigint,
  aparelho     text,
  situacao     text not null default 'enviando',
  codigo       integer,
  enviado_em   timestamptz not null default now(),
  recebido_em  timestamptz,
  sw_versao    integer
);
create index push_entregas_aviso_id_idx on public.push_entregas (aviso_id);
create index push_entregas_usuario_id_idx on public.push_entregas (usuario_id);
create index push_entregas_inscricao_id_idx on public.push_entregas (inscricao_id);
create index push_entregas_enviado_em_idx on public.push_entregas (enviado_em);

alter table public.notificacoes_enviadas add column recebido_em timestamptz;

alter table public.push_inscricoes
  add column aparelho_id text check (aparelho_id is null or length(aparelho_id) <= 64),
  add column visto_em timestamptz;
create index push_inscricoes_aparelho_id_idx on public.push_inscricoes (aparelho_id);

alter table public.escala_alerta_estado add column sem_ninguem_desde timestamptz;

alter table public.push_entregas enable row level security;
revoke all on public.push_entregas from anon, authenticated;
grant select on public.push_entregas to authenticated;
grant select on public.notificacoes_enviadas to authenticated;

create policy "admin le entregas" on public.push_entregas
  for select to authenticated using ((select privado.eh_admin()));
create policy "admin le avisos enviados" on public.notificacoes_enviadas
  for select to authenticated using ((select privado.eh_admin()));
create policy "admin le todas as inscricoes" on public.push_inscricoes
  for select to authenticated using ((select privado.eh_admin()));
