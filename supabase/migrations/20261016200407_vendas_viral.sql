-- Vendas: Protocolo Viral (downsell para o lead "Sem dinheiro"), pedido do Davi em 16/10/2026.
--
-- 1. vendas_produtos_hubla: IDs da Hubla (produto ou oferta) que fazem a venda ser do Viral. O chefe
--    edita na Configuração de vendas (oferta nova entra sem mexer no código). Reconhece pelo ID,
--    nunca pelo nome nem pelo valor. Começa com o produto "Protocolo Viral" (vale para todas as ofertas dele).
-- 2. vendas.linha: 'gcs' (Protocolo Game Changer, como sempre) ou 'viral'. Venda do Viral não tem
--    ticket: valor_pago = total que o cliente pagou de verdade; viral_preco = preço da oferta.
-- 3. Comissão do Viral = a MESMA regra do GCS (decisão do Davi, 16/10/2026): % da faixa do fechamento
--    (6 a 10%) sobre o líquido da venda. Líquido do Viral = o que a Hubla repassa da fatura sem os
--    juros do parcelamento (receita_liquida × preço da oferta ÷ total pago), guardado na venda quando
--    ela nasce (viral_liquido), como a cópia do ticket no GCS. Comissão de cada venda = líquido × %,
--    meio centavo para cima (igual a comissaoDe do GCS).
-- 4. Fechamento: comissao continua sendo o total congelado (GCS + Viral na faixa escolhida), e as
--    colunas viral_* guardam a parte do Viral. Estorno de venda do Viral reembolsada em mês fechado =
--    líquido dela × faixa do fechamento.
-- 5. Geral: vendas_geral_completa e a meta da equipe passam a contar só o GCS; o Viral tem
--    funções próprias (resumo por vendedor e oferta, e conversão da etiqueta de downsell).
-- 6. Vendas do Viral que já chegaram e foram gravadas como GCS são corrigidas, só em mês aberto.

-- ---------------------------------------------------------------------------
-- 1. IDs da Hubla do Viral
-- ---------------------------------------------------------------------------
create table public.vendas_produtos_hubla (
  hubla_id   text primary key check (hubla_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  tipo       text not null check (tipo in ('produto', 'oferta')),
  linha      text not null default 'viral' check (linha in ('viral')),
  descricao  text check (descricao is null or length(descricao) <= 120),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null default auth.uid()
);
comment on table public.vendas_produtos_hubla is
  'IDs da Hubla (produto ou oferta) que fazem a venda ser do Protocolo Viral. Editável pelo chefe de Vendas.';

alter table public.vendas_produtos_hubla enable row level security;
revoke all on public.vendas_produtos_hubla from anon;
grant select, insert, update on public.vendas_produtos_hubla to authenticated;
create policy "chefe le produtos hubla" on public.vendas_produtos_hubla
  for select to authenticated using ((select privado.vendas_chefe()));
create policy "chefe cria produtos hubla" on public.vendas_produtos_hubla
  for insert to authenticated with check ((select privado.vendas_chefe()));
create policy "chefe edita produtos hubla" on public.vendas_produtos_hubla
  for update to authenticated using ((select privado.vendas_chefe())) with check ((select privado.vendas_chefe()));

insert into public.vendas_produtos_hubla (hubla_id, tipo, descricao, criado_por)
values ('ptOj9sEG0z4hnImIeHvC', 'produto', 'Protocolo Viral (todas as ofertas)', null);

-- ---------------------------------------------------------------------------
-- 2. Etiqueta do downsell (conversão)
-- ---------------------------------------------------------------------------
alter table public.vendas_config add column viral_etiqueta_dc_id text;
comment on column public.vendas_config.viral_etiqueta_dc_id is
  'Etiqueta da Data Crazy que marca o lead mandado para o downsell Viral (conversão na tela de Vendas).';

-- etiqueta "🪞DOWNSELL VIRAL" (id da Data Crazy, já sincronizada em funil_etiquetas)
update public.vendas_config set viral_etiqueta_dc_id = 'ca2a4239-4a82-44c8-925a-5a35e4a61c9a' where id;

-- ---------------------------------------------------------------------------
-- 3. Venda: linha, preço da oferta e líquido do Viral
-- ---------------------------------------------------------------------------
alter table public.vendas
  add column linha         text not null default 'gcs' check (linha in ('gcs', 'viral')),
  add column viral_preco   numeric(10, 2),
  add column viral_liquido numeric(10, 2);
comment on column public.vendas.linha is 'gcs = Protocolo Game Changer (ticket); viral = Protocolo Viral (downsell).';
comment on column public.vendas.viral_preco is 'Viral: preço da oferta na Hubla (48,90 a 118,90), para a distribuição por oferta.';
comment on column public.vendas.viral_liquido is
  'Viral: base da comissão (receita da Hubla sem os juros do parcelamento), guardada ao nascer. Comissão = líquido × faixa do fechamento.';

create index vendas_linha_data_idx on public.vendas (linha, data);

-- Ao nascer (ou ao virar Viral, ou chegar o valor da Hubla): calcula o líquido do Viral.
-- O nome começa com "vendas_comissao" para rodar ANTES da trava do mês fechado (os gatilhos rodam
-- em ordem alfabética), e a trava enxerga e registra o valor calculado.
create or replace function privado.vendas_comissao_viral()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.linha = 'viral' then
    if tg_op = 'INSERT'
       or new.linha is distinct from old.linha
       or new.valor_pago is distinct from old.valor_pago
       or new.receita_liquida is distinct from old.receita_liquida
       or new.viral_preco is distinct from old.viral_preco then
      new.viral_liquido := case
        when new.receita_liquida is null then null
        -- juros do parcelamento fora: só a parte do preço da oferta no que entrou
        when new.viral_preco is not null and coalesce(new.valor_pago, 0) > new.viral_preco
          then round(new.receita_liquida * new.viral_preco / new.valor_pago, 2)
        else new.receita_liquida
      end;
    end if;
  else
    new.viral_liquido := null;
    new.viral_preco := null;
  end if;
  return new;
end;
$$;
revoke execute on function privado.vendas_comissao_viral() from public, anon, authenticated;

create trigger vendas_comissao_viral
  before insert or update of linha, valor_pago, receita_liquida, viral_preco on public.vendas
  for each row execute function privado.vendas_comissao_viral();

-- comissão de UMA venda do Viral: líquido × %, meio centavo para cima (igual ao GCS)
create or replace function privado.vendas_viral_comissao(p_liquido numeric, p_faixa integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (floor((round(p_liquido * 100) * p_faixa + 50) / 100) / 100)::numeric(10, 2);
$$;
grant execute on function privado.vendas_viral_comissao(numeric, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fechamento: parte do Viral (o "comissao" continua sendo o total congelado)
-- ---------------------------------------------------------------------------
alter table public.vendas_fechamentos
  add column viral_qtd      integer not null default 0,
  add column viral_bruto    numeric(10, 2) not null default 0,
  add column viral_liquido  numeric(10, 2) not null default 0,
  add column viral_comissao numeric(10, 2) not null default 0;
comment on column public.vendas_fechamentos.comissao is
  'Comissão total congelada no fechamento: GCS + Protocolo Viral, na faixa escolhida.';
comment on column public.vendas_fechamentos.viral_comissao is 'Parte do Protocolo Viral na comissão congelada.';

-- Trava do mês fechado (igual à de vendas_registro_completo, 10/10/2026), com uma mudança:
-- estorno de venda do Viral = líquido dela × faixa do fechamento.
create or replace function privado.vendas_trava_mes_fechado()
returns trigger
language plpgsql
security definer  -- grava no registro/estornos, que nem a chave secreta edita
set search_path = ''
as $$
declare
  ignorar constant text[] := array['atualizado_em', 'alterado_por', 'alterado_via'];
  por_    uuid;
  via_    text;
  pessoa_ uuid;
  travado_antes  boolean := false;
  travado_depois boolean := false;
  antes_  jsonb;
  depois_ jsonb;
  f       record;
  valor_  numeric;
begin
  if tg_op = 'DELETE' then
    if privado.vendas_mes_fechado(old.data, old.vendedor_id) then
      raise exception 'Venda de mês fechado não pode ser apagada. Reabra o mês antes.';
    end if;
    -- mês aberto: quem apagou fica registrado (com a venda inteira em "antes")
    if (select auth.uid()) is not null then
      insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, antes)
      values ((select auth.uid()), 'admin', 'venda_apagada', null, date_trunc('month', old.data)::date, old.vendedor_id, to_jsonb(old) - ignorar);
    end if;
    return old;
  end if;

  -- quem está mudando: lê e limpa (não fica gravado na venda; vai para o registro)
  por_ := new.alterado_por;
  via_ := new.alterado_via;
  new.alterado_por := null;
  new.alterado_via := null;
  -- pessoa: a que a tela informou ou a do login (a tela com o login da pessoa não precisa informar)
  pessoa_ := coalesce(por_, (select auth.uid()));

  if tg_op = 'UPDATE' then
    travado_antes := privado.vendas_mes_fechado(old.data, old.vendedor_id);
  end if;
  travado_depois := privado.vendas_mes_fechado(new.data, new.vendedor_id);

  -- o que mudou (sem as colunas de controle)
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(a.key, a.value), jsonb_object_agg(a.key, d.value)
      into antes_, depois_
      from jsonb_each(to_jsonb(old)) a
      join jsonb_each(to_jsonb(new)) d using (key)
     where a.value is distinct from d.value
       and not (a.key = any (ignorar));
    if antes_ is null then
      return new;  -- nada mudou de verdade
    end if;
  else
    depois_ := to_jsonb(new) - ignorar;
  end if;

  -- MÊS ABERTO: registra se foi uma pessoa (não o webhook da Hubla) e segue
  if not (travado_antes or travado_depois) then
    if pessoa_ is not null and via_ is distinct from 'hubla' then
      insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, antes, depois)
      values (
        pessoa_, 'admin',
        case when tg_op = 'INSERT' then 'venda_criada' else 'venda_alterada' end,
        new.id,
        date_trunc('month', new.data)::date,
        coalesce(new.vendedor_id, case when tg_op = 'UPDATE' then old.vendedor_id end),
        antes_, depois_
      );
    end if;
    return new;
  end if;

  -- MÊS FECHADO (como antes)
  if via_ is null or (via_ = 'admin' and por_ is null) then
    raise exception 'Mês fechado: só o admin altera (alteração sem identificação de quem mudou).';
  end if;
  if via_ = 'hubla' and tg_op = 'UPDATE'
     and exists (select 1 from jsonb_object_keys(antes_) k
                 where k not in ('status', 'reembolsado_em')) then
    raise exception 'Mês fechado: o webhook da Hubla só pode mudar o status (reembolso).';
  end if;

  insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, antes, depois)
  values (
    por_, via_,
    case when tg_op = 'INSERT' then 'venda_criada' else 'venda_alterada' end,
    new.id,
    date_trunc('month', case when travado_antes then old.data else new.data end)::date,
    case when travado_antes then old.vendedor_id else new.vendedor_id end,
    antes_, depois_
  );

  -- estorno: venda paga de mês fechado virou reembolso/chargeback
  if tg_op = 'UPDATE' and travado_antes
     and old.status = 'pago' and new.status in ('reembolso', 'chargeback') then
    select * into f from public.vendas_fechamentos
     where mes = date_trunc('month', old.data)::date and vendedor_id = old.vendedor_id;
    -- Viral: líquido guardado na venda × faixa do fechamento
    valor_ := case when old.linha = 'viral' then privado.vendas_viral_comissao(old.viral_liquido, f.faixa)
                   else case f.faixa
                          when 6 then old.snap_comissao_6  when 7 then old.snap_comissao_7
                          when 8 then old.snap_comissao_8  when 9 then old.snap_comissao_9
                          when 10 then old.snap_comissao_10 end
              end;
    if coalesce(valor_, 0) > 0 then
      insert into public.vendas_estornos (venda_id, vendedor_id, mes_origem, faixa, valor, motivo)
      values (old.id, old.vendedor_id, f.mes, f.faixa, valor_, new.status);
      insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, depois)
      values (por_, via_, 'estorno_criado', old.id, f.mes, old.vendedor_id,
              jsonb_build_object('valor', valor_, 'faixa', f.faixa, 'motivo', new.status));
    end if;
  end if;

  -- voltou para pago antes do desconto: cancela o estorno pendente
  if tg_op = 'UPDATE' and old.status in ('reembolso', 'chargeback') and new.status = 'pago' then
    with cancelados as (
      update public.vendas_estornos
         set cancelado_em = now()
       where venda_id = old.id and descontado_no_mes is null and cancelado_em is null
      returning id, valor, mes_origem, vendedor_id
    )
    insert into public.vendas_alteracoes (por, via, tipo, venda_id, mes, vendedor_id, depois)
    select por_, via_, 'estorno_cancelado', old.id, c.mes_origem, c.vendedor_id,
           jsonb_build_object('estorno_id', c.id, 'valor', c.valor)
      from cancelados c;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Geral: a tabela "Por vendedor" e a meta da equipe contam só o GCS.
--    + com_ticket (pagas com ticket), para o ticket médio do GCS (o tipo de retorno muda: recria)
-- ---------------------------------------------------------------------------
drop function public.vendas_geral_completa(date, date);
create function public.vendas_geral_completa(p_inicio date, p_fim date)
returns table (
  vendedor_id bigint, pagas integer, reembolsos integer, chargebacks integer,
  bruto numeric, liquido numeric,
  comissao_6 numeric, comissao_7 numeric, comissao_8 numeric, comissao_9 numeric, comissao_10 numeric,
  receita numeric, sem_receita integer, recebido_real numeric, com_ticket integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select privado.vendas_geral_completa()) then
    raise exception 'Sem acesso à Geral completa.';
  end if;
  return query
  select v.vendedor_id,
         (count(*) filter (where v.status = 'pago'))::integer,
         (count(*) filter (where v.status = 'reembolso'))::integer,
         (count(*) filter (where v.status = 'chargeback'))::integer,
         coalesce(sum(v.snap_bruto)       filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_liquido)     filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_6)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_7)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_8)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_9)  filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.snap_comissao_10) filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         coalesce(sum(v.receita_liquida)  filter (where v.status = 'pago'), 0),
         (count(*) filter (where v.status = 'pago' and v.receita_liquida is null))::integer,
         coalesce(sum(v.liquido_real)     filter (where v.status = 'pago' and v.ticket_id is not null), 0),
         (count(*) filter (where v.status = 'pago' and v.ticket_id is not null))::integer
    from public.vendas v
   where v.data >= p_inicio and v.data < p_fim
     and v.linha = 'gcs'
     and not v.teste and not v.aguardando_confirmacao
   group by v.vendedor_id;
end;
$$;
revoke execute on function public.vendas_geral_completa(date, date) from public, anon;
grant execute on function public.vendas_geral_completa(date, date) to authenticated;

create or replace function public.vendas_geral_equipe(p_inicio date, p_fim date)
returns table (pagas integer, meta_qtd integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::integer from public.vendas v
           where v.data >= p_inicio and v.data < p_fim and v.status = 'pago' and v.linha = 'gcs'
             and not v.teste and not v.aguardando_confirmacao),
         (select m.meta_qtd from public.vendas_metas m where m.mes = date_trunc('month', p_inicio)::date)
   where not (select privado.eh_plantonista());
$$;

-- ---------------------------------------------------------------------------
-- 7. Viral na Geral (chefe e gerente): só números, por vendedor e por preço da oferta
-- ---------------------------------------------------------------------------
create or replace function public.vendas_viral_resumo(p_inicio date, p_fim date)
returns table (
  vendedor_id bigint, preco numeric, pagas integer, reembolsos integer, chargebacks integer,
  faturamento numeric, receita numeric, liquido numeric,
  comissao_6 numeric, comissao_7 numeric, comissao_8 numeric, comissao_9 numeric, comissao_10 numeric,
  sem_liquido integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select privado.vendas_geral_completa()) then
    raise exception 'Sem acesso à Geral completa.';
  end if;
  return query
  select v.vendedor_id, v.viral_preco,
         (count(*) filter (where v.status = 'pago'))::integer,
         (count(*) filter (where v.status = 'reembolso'))::integer,
         (count(*) filter (where v.status = 'chargeback'))::integer,
         coalesce(sum(v.valor_pago)      filter (where v.status = 'pago'), 0),
         coalesce(sum(v.receita_liquida) filter (where v.status = 'pago'), 0),
         coalesce(sum(v.viral_liquido)   filter (where v.status = 'pago'), 0),
         coalesce(sum(privado.vendas_viral_comissao(v.viral_liquido, 6))  filter (where v.status = 'pago'), 0),
         coalesce(sum(privado.vendas_viral_comissao(v.viral_liquido, 7))  filter (where v.status = 'pago'), 0),
         coalesce(sum(privado.vendas_viral_comissao(v.viral_liquido, 8))  filter (where v.status = 'pago'), 0),
         coalesce(sum(privado.vendas_viral_comissao(v.viral_liquido, 9))  filter (where v.status = 'pago'), 0),
         coalesce(sum(privado.vendas_viral_comissao(v.viral_liquido, 10)) filter (where v.status = 'pago'), 0),
         (count(*) filter (where v.status = 'pago' and v.viral_liquido is null))::integer
    from public.vendas v
   where v.data >= p_inicio and v.data < p_fim
     and v.linha = 'viral'
     and not v.teste and not v.aguardando_confirmacao
   group by v.vendedor_id, v.viral_preco;
end;
$$;
revoke execute on function public.vendas_viral_resumo(date, date) from public, anon;
grant execute on function public.vendas_viral_resumo(date, date) to authenticated;

-- Conversão do downsell: leads que receberam a etiqueta do Viral no período (dia de Brasília)
-- e quantos deles compraram o Viral (venda ligada ao lead pela sincronização do Funil).
create or replace function public.vendas_viral_conversao(p_inicio date, p_fim date)
returns table (marcados integer, compraram integer, etiqueta_definida boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  etiqueta text;
begin
  if not (select privado.vendas_geral_completa()) then
    raise exception 'Sem acesso à Geral completa.';
  end if;
  select c.viral_etiqueta_dc_id into etiqueta from public.vendas_config c where c.id;
  return query
  with marcados as (
    select distinct e.lead_dc_id
      from public.funil_eventos e
      join public.funil_leads l on l.dc_id = e.lead_dc_id
     where e.etiqueta_dc_id = etiqueta
       and e.acao = 'colocou'
       and not l.interno
       and (e.em at time zone 'America/Sao_Paulo')::date >= p_inicio
       and (e.em at time zone 'America/Sao_Paulo')::date < p_fim
  )
  select count(*)::integer,
         (count(*) filter (where exists (
            select 1 from public.funil_leads l join public.vendas v on v.id = l.venda_id
             where l.dc_id = m.lead_dc_id and v.linha = 'viral' and v.status = 'pago')))::integer,
         etiqueta is not null
    from marcados m;
end;
$$;
revoke execute on function public.vendas_viral_conversao(date, date) from public, anon;
grant execute on function public.vendas_viral_conversao(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Vendas do Viral que já chegaram (gravadas como GCS, "a revisar"): corrige só mês aberto.
--    Valor = total pago na fatura; preço = valor da oferta do Viral.
-- ---------------------------------------------------------------------------
with ids as (
  select hubla_id, tipo from public.vendas_produtos_hubla where ativo
), ofertas as (
  select distinct on (e.id_fatura)
         e.id_fatura,
         (e.payload #>> '{event,invoice,amount,totalCents}')::numeric / 100 as total,
         (o ->> 'amountCents')::numeric / 100 as preco
    from public.hubla_eventos e,
         jsonb_array_elements(coalesce(e.payload #> '{event,products}', '[]')) p,
         jsonb_array_elements(coalesce(p -> 'offers', '[]')) o
   where e.tipo = 'invoice.payment_succeeded'
     and e.id_fatura is not null
     and (p ->> 'id' in (select hubla_id from ids where tipo = 'produto')
          or o ->> 'id' in (select hubla_id from ids where tipo = 'oferta'))
   order by e.id_fatura, e.id
)
update public.vendas v
   set linha = 'viral',
       ticket_id = null,
       motivo_sem_ticket = null,
       principal_produto = false,
       valor_pago = coalesce(o.total, v.valor_pago),
       viral_preco = o.preco
  from ofertas o
 where v.id_fatura = o.id_fatura
   and v.linha = 'gcs'
   and not privado.vendas_mes_fechado(v.data, v.vendedor_id);
