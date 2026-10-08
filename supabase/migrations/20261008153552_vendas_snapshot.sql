-- Vendas: cada venda guarda uma cópia (snapshot) dos valores do ticket no momento
-- da venda. Mudar ou desativar ticket nunca recalcula venda antiga.
-- Também: origem da venda, e-mail de acesso do vendedor e o vendedor passa a ver
-- SÓ as próprias vendas ("A atribuir" fica só com o admin). Decisões em docs/decisoes.md.

-- ---------------------------------------------------------------------------
-- Snapshot + origem
-- ---------------------------------------------------------------------------
alter table public.vendas
  add column snap_bruto       numeric(10, 2),
  add column snap_liquido     numeric(10, 2),
  add column snap_comissao_6  numeric(10, 2),
  add column snap_comissao_7  numeric(10, 2),
  add column snap_comissao_8  numeric(10, 2),
  add column snap_comissao_9  numeric(10, 2),
  add column snap_comissao_10 numeric(10, 2),
  -- webhook = Hubla em tempo real; importacao = histórico (masterview ou planilha da Hubla)
  add column origem text not null default 'webhook' check (origem in ('webhook', 'importacao', 'manual'));

-- Copia do ticket quando a venda nasce ou quando o ticket dela é trocado.
-- Mudar outro campo (dono, status) não mexe no snapshot.
create or replace function privado.vendas_snapshot_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id then
    if new.ticket_id is null then
      new.snap_bruto := null;
      new.snap_liquido := null;
      new.snap_comissao_6 := null;
      new.snap_comissao_7 := null;
      new.snap_comissao_8 := null;
      new.snap_comissao_9 := null;
      new.snap_comissao_10 := null;
    else
      select t.valor_bruto, t.valor_liquido, t.comissao_6, t.comissao_7, t.comissao_8, t.comissao_9, t.comissao_10
        into new.snap_bruto, new.snap_liquido, new.snap_comissao_6, new.snap_comissao_7,
             new.snap_comissao_8, new.snap_comissao_9, new.snap_comissao_10
        from public.tickets t
       where t.id = new.ticket_id;
    end if;
  end if;
  return new;
end $$;

revoke execute on function privado.vendas_snapshot_ticket() from public, anon, authenticated;

create trigger vendas_snapshot_ticket
  before insert or update of ticket_id on public.vendas
  for each row execute function privado.vendas_snapshot_ticket();

-- vendas que já existirem (hoje: nenhuma) recebem a cópia do ticket atual
update public.vendas v set
  snap_bruto = t.valor_bruto,
  snap_liquido = t.valor_liquido,
  snap_comissao_6 = t.comissao_6,
  snap_comissao_7 = t.comissao_7,
  snap_comissao_8 = t.comissao_8,
  snap_comissao_9 = t.comissao_9,
  snap_comissao_10 = t.comissao_10
from public.tickets t
where t.id = v.ticket_id
  and v.snap_bruto is null;

-- ---------------------------------------------------------------------------
-- E-mail de acesso do vendedor (para o convite). Só admin lê: a coluna fica de
-- fora do select liberado para os logados.
-- ---------------------------------------------------------------------------
alter table public.vendedores
  add column email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

revoke select on public.vendedores from authenticated;
grant select (equipe_id, utm_term, ativo, criado_em) on public.vendedores to authenticated;

-- ---------------------------------------------------------------------------
-- Vendedor vê SÓ as próprias vendas. "A atribuir" (sem dono) é só do admin.
-- ---------------------------------------------------------------------------
drop policy "le vendas: admin tudo, vendedor as proprias e a atribuir" on public.vendas;

create policy "le vendas: admin tudo, vendedor so as proprias" on public.vendas
  for select to authenticated
  using (
    (select privado.eh_admin())
    or vendedor_id = (select privado.minha_equipe_id())
  );

create index vendas_origem_idx on public.vendas (origem);
