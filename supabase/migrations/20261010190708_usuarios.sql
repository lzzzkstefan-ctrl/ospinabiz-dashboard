-- Aba Usuários (plano aprovado pelo Davi em 10/10/2026).
--
-- Quem gerencia: chefe e gerente (papel em Vendas). Convidar, trocar papel, desativar e reativar
-- mexem no login (Supabase Auth) e por isso rodam no servidor com a chave secreta, depois de
-- conferir quem pediu (só o chefe mexe em outro chefe; ninguém se desativa nem se rebaixa; sempre
-- fica pelo menos um chefe ativo).
--
-- 1. privado.usuarios_gestor(): é chefe ou gerente em Vendas?
-- 2. usuarios_registro: cada mudança (quem fez, em quem, antes, depois, quando). Só acrescenta;
--    só chefe e gerente leem; quem grava é o servidor.

create or replace function privado.usuarios_gestor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select privado.vendas_papel() in ('chefe', 'gerente');
$$;

revoke execute on function privado.usuarios_gestor() from public, anon;
grant execute on function privado.usuarios_gestor() to authenticated;

create table public.usuarios_registro (
  id            bigint generated always as identity primary key,
  alvo_usuario  uuid references auth.users (id) on delete set null,
  alvo_nome     text not null,
  acao          text not null check (acao in ('convite', 'novo_link', 'papel', 'atendente', 'utm', 'desativar', 'reativar')),
  antes         jsonb,
  depois        jsonb,
  feito_por     uuid references auth.users (id) on delete set null,
  feito_em      timestamptz not null default now()
);

create index usuarios_registro_alvo_usuario_idx on public.usuarios_registro (alvo_usuario);
create index usuarios_registro_feito_por_idx on public.usuarios_registro (feito_por);
create index usuarios_registro_feito_em_idx on public.usuarios_registro (feito_em);

alter table public.usuarios_registro enable row level security;
revoke all on public.usuarios_registro from anon, authenticated;
grant select on public.usuarios_registro to authenticated;

create policy "gestor le registro de usuarios" on public.usuarios_registro
  for select to authenticated using ((select privado.usuarios_gestor()));
