-- Pedidos de reembolso da Hubla (pedido do Davi, 16/10/2026).
--
-- Na Hubla, o cliente que pede reembolso dentro da garantia tem o pedido aceito sozinho se ninguém
-- resolver. O alerta avisa na hora para o vendedor tentar reverter (e pedir o cancelamento manual).
--
-- Eventos da Hubla (mesmo webhook, Edge Function hubla-webhook → hubla_eventos → /api/vendas/processar):
--   refund_request.created   → pedido novo: status 'pendente' + push para admins, chefes e o vendedor
--   refund_request.canceled  → o cliente desistiu: 'revertido' (via Hubla)
--   refund_request.rejected  → o pedido foi recusado: 'revertido' (via Hubla)
--   refund_request.accepted  → reembolso aceito: 'reembolsado' (a venda já virava "reembolso" antes)
--   invoice.refunded         → a fatura foi reembolsada: pedido aberto dessa fatura vira 'reembolsado'
--
-- 1. vendas_reembolsos: um pedido por refund.id da Hubla, ligado à venda pela fatura.
--    Lê: admin do sistema, chefe de Vendas e o vendedor dono da venda. Grava: só o servidor e a
--    função vendas_reembolso_reverter (botão "Marcar como revertido", registra quem e quando).
-- 2. vendas_config.reembolso_prazo_dias: prazo da garantia (padrão 7). A Hubla não manda o prazo
--    no evento: prazo = pago em + dias. Pedido feito depois disso fica sem prazo.
-- 3. notificacoes_enviadas aceita o tipo 'reembolso' (a chave única evita aviso repetido).
-- 4. pg_cron a cada 15 min chama /api/vendas/reembolsos (lembrete de 24h pendente e de prazo < 24h).
--
-- A comissão não muda aqui: quando o reembolso é efetuado, a venda vira 'reembolso' como já era
-- (sai do mês aberto; em mês fechado a trava gera o estorno).

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
create table public.vendas_reembolsos (
  id                bigint generated always as identity primary key,
  refund_id         text not null unique check (length(refund_id) between 1 and 100),
  id_fatura         text not null check (length(id_fatura) between 1 and 100),
  venda_id          bigint references public.vendas (id) on delete set null,
  vendedor_id       bigint references public.equipe (id),
  utm_term          text,
  linha             text check (linha in ('gcs', 'viral')),
  produto           text,
  valor             numeric(10, 2),
  cliente_nome      text,
  cliente_telefone  text,
  motivo            text,                       -- o que o cliente escreveu no pedido (refund.description)
  pago_em           timestamptz,
  pedido_em         timestamptz not null,
  prazo             timestamptz,                -- quando a Hubla executa sozinha (null = sem prazo conhecido)
  auto_aceite       boolean,                    -- refund.isAutoAccepted
  status            text not null default 'pendente' check (status in ('pendente', 'revertido', 'reembolsado')),
  hubla_status      text not null check (hubla_status in ('created', 'canceled', 'rejected', 'accepted', 'refunded')),
  revertido_em      timestamptz,
  revertido_por     uuid references auth.users (id) on delete set null,
  revertido_via     text check (revertido_via in ('tela', 'hubla')),
  reembolsado_em    timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint vendas_reembolsos_revertido_coerente check ((status = 'revertido') = (revertido_em is not null))
);

create index vendas_reembolsos_id_fatura_idx on public.vendas_reembolsos (id_fatura);
create index vendas_reembolsos_venda_id_idx on public.vendas_reembolsos (venda_id);
create index vendas_reembolsos_vendedor_id_idx on public.vendas_reembolsos (vendedor_id);
create index vendas_reembolsos_revertido_por_idx on public.vendas_reembolsos (revertido_por);
create index vendas_reembolsos_pendentes_idx on public.vendas_reembolsos (prazo) where status = 'pendente';
create index vendas_reembolsos_pedido_em_idx on public.vendas_reembolsos (pedido_em);

alter table public.vendas_reembolsos enable row level security;
revoke all on public.vendas_reembolsos from anon, authenticated;
grant select on public.vendas_reembolsos to authenticated;

create policy "le reembolsos: admin e chefe tudo, vendedor os proprios" on public.vendas_reembolsos
  for select to authenticated
  using (
    (select privado.eh_admin())
    or (select privado.vendas_chefe())
    or vendedor_id = (select privado.minha_equipe_id())
  );

-- ---------------------------------------------------------------------------
-- Botão "Marcar como revertido": só pedido pendente, por quem pode ver o pedido.
-- ---------------------------------------------------------------------------
create or replace function public.vendas_reembolso_reverter(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.vendas_reembolsos;
begin
  if (select auth.uid()) is null then
    raise exception 'Faça login.';
  end if;
  select * into r from public.vendas_reembolsos where id = p_id for update;
  if not found
     or not (privado.eh_admin() or privado.vendas_chefe() or r.vendedor_id = privado.minha_equipe_id()) then
    raise exception 'Pedido de reembolso não encontrado.';
  end if;
  if r.status <> 'pendente' then
    raise exception 'Esse pedido não está mais pendente (%).', r.status;
  end if;
  update public.vendas_reembolsos
     set status = 'revertido', revertido_em = now(), revertido_por = (select auth.uid()), revertido_via = 'tela', atualizado_em = now()
   where id = p_id;
  return 'revertido';
end;
$$;

revoke execute on function public.vendas_reembolso_reverter(bigint) from public, anon;
grant execute on function public.vendas_reembolso_reverter(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Prazo da garantia
-- ---------------------------------------------------------------------------
alter table public.vendas_config
  add column reembolso_prazo_dias integer not null default 7 check (reembolso_prazo_dias between 1 and 60);
comment on column public.vendas_config.reembolso_prazo_dias is
  'Dias de garantia na Hubla: prazo do pedido de reembolso = pago em + estes dias (a Hubla não manda o prazo).';

-- ---------------------------------------------------------------------------
-- 3. Tipo de aviso
-- ---------------------------------------------------------------------------
alter table public.notificacoes_enviadas drop constraint if exists notificacoes_enviadas_tipo_check;
alter table public.notificacoes_enviadas add constraint notificacoes_enviadas_tipo_check
  check (tipo in ('pausa_inicio', 'pausa_fim', 'pausa_longa', 'operacao_descoberta', 'sem_checkin', 'entrada', 'saida', 'teste', 'feriado', 'reembolso'));

-- ---------------------------------------------------------------------------
-- 4. Lembretes
-- ---------------------------------------------------------------------------
select cron.schedule('vendas-reembolsos-lembretes', '*/15 * * * *', $$select privado.chamar_rota_monitor('/api/vendas/reembolsos')$$);
