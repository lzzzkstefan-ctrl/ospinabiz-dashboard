-- Tarefas em kanban (pedido do Davi em 11/10/2026). Adapta a tabela que já existe, sem apagar nada:
--   - status passa de pendente/concluida para 4 colunas: a_fazer, fazendo, travado, feito
--     (pendente vira a_fazer; concluida vira feito);
--   - ordem: posição dentro da coluna (número com casas decimais; ao soltar entre dois cartões vale o
--     meio dos dois, então só o cartão movido é gravado);
--   - descricao, prioridade (alta/media/baixa), area e prazo_hora (opcional, horário de Brasília).
-- Equipe ganha "apelido" (nome curto nas Tarefas): Vyenna aparece como "Vy".
-- As regras de acesso continuam as mesmas (logado lê e edita; plantonista só as dele; ninguém apaga).

alter table public.equipe add column apelido text check (apelido is null or length(btrim(apelido)) between 1 and 30);
comment on column public.equipe.apelido is 'Nome curto usado nas Tarefas (ex.: Vy). Vazio = usa o nome.';
update public.equipe set apelido = 'Vy' where nome = 'Vyenna';

-- ---------------------------------------------------------------------------
-- Status: 4 colunas
-- ---------------------------------------------------------------------------
alter table public.tarefas drop constraint tarefas_status_check;
update public.tarefas set status = case status when 'concluida' then 'feito' else 'a_fazer' end;
alter table public.tarefas
  alter column status set default 'a_fazer',
  add constraint tarefas_status_check check (status in ('a_fazer', 'fazendo', 'travado', 'feito'));

-- ---------------------------------------------------------------------------
-- Campos novos
-- ---------------------------------------------------------------------------
alter table public.tarefas
  add column descricao  text check (descricao is null or length(descricao) <= 2000),
  add column prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  add column area       text check (area is null or length(btrim(area)) between 1 and 40),
  add column prazo_hora time,
  add column ordem      double precision not null default 0,
  -- horário só faz sentido com data
  add constraint tarefas_hora_com_prazo check (prazo_hora is null or prazo is not null);

comment on column public.tarefas.prazo_hora is 'Horário do prazo (Brasília). Vazio = vale o dia inteiro.';
comment on column public.tarefas.ordem is 'Posição dentro da coluna (menor = mais em cima).';

-- ordem inicial das que já existem: pelo prazo (sem prazo no fim) e pela criação
update public.tarefas t
   set ordem = o.n * 1000
  from (select id, row_number() over (partition by status order by prazo nulls last, criado_em) as n
          from public.tarefas) o
 where o.id = t.id;

drop index public.tarefas_status_prazo_idx;
create index tarefas_status_ordem_idx on public.tarefas (status, ordem);

-- ---------------------------------------------------------------------------
-- concluida_em acompanha "feito": preenche ao entrar, limpa ao sair.
-- ---------------------------------------------------------------------------
create or replace function privado.tarefas_marca_conclusao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
    new.criado_em  := old.criado_em;
  end if;

  if new.status = 'feito' and (tg_op = 'INSERT' or old.status <> 'feito') then
    new.concluida_em := coalesce(new.concluida_em, now());
  elsif new.status <> 'feito' then
    new.concluida_em := null;
  end if;
  return new;
end;
$$;
