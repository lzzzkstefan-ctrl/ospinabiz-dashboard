-- Melhorias: backlog e novidades da dashboard (pedido do Davi, 11/10/2026). Contexto em
-- docs/modulos/melhorias.md.
--
-- Uma linha por melhoria. Status: ideia → fazer → andamento → feito. Ao ir para "feito" ela entra
-- em Novidades com a data (feito_em) e uma linha explicando (novidade).
-- Quem pode o quê:
--   - chefe e gerente (privado.usuarios_gestor): veem, criam, editam, movem e apagam tudo;
--   - qualquer logado: só SUGERE (cria em "ideia", em nome dele). Não vê o quadro.
-- O nome de quem sugeriu vem da equipe (gatilho), para ninguém sugerir em nome de outro.

create table public.melhorias (
  id             bigint generated always as identity primary key,
  titulo         text not null check (length(trim(titulo)) between 3 and 120),
  descricao      text check (length(descricao) <= 2000),
  status         text not null default 'ideia' check (status in ('ideia', 'fazer', 'andamento', 'feito')),
  prioridade     text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  aba            text check (length(aba) <= 40),
  sugerido_por   uuid references auth.users (id) on delete set null default auth.uid(),
  sugerido_nome  text check (length(sugerido_nome) <= 80),
  feito_em       timestamptz,
  novidade       text check (length(novidade) <= 300),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null default auth.uid()
);

create index melhorias_status_idx on public.melhorias (status);
create index melhorias_feito_em_idx on public.melhorias (feito_em desc) where status = 'feito';
create index melhorias_sugerido_por_idx on public.melhorias (sugerido_por);
create index melhorias_atualizado_por_idx on public.melhorias (atualizado_por);

-- Gatilho: nome de quem sugeriu (da equipe) e data de "feito".
create or replace function privado.melhorias_ajusta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.sugerido_por is not null then
    new.sugerido_nome := coalesce(
      (select e.nome from public.equipe e where e.usuario_id = new.sugerido_por limit 1),
      new.sugerido_nome
    );
  end if;
  if tg_op = 'UPDATE' then
    -- quem sugeriu não muda depois
    new.sugerido_por := old.sugerido_por;
    new.sugerido_nome := old.sugerido_nome;
    new.atualizado_em := now();
    new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  end if;
  if new.status = 'feito' then
    new.feito_em := coalesce(new.feito_em, now());
    new.novidade := coalesce(nullif(trim(new.novidade), ''), new.titulo);
  else
    new.feito_em := null;
  end if;
  return new;
end;
$$;

revoke execute on function privado.melhorias_ajusta() from public, anon, authenticated;

create trigger melhorias_ajusta
  before insert or update on public.melhorias
  for each row execute function privado.melhorias_ajusta();

-- RLS
alter table public.melhorias enable row level security;
revoke all on public.melhorias from anon;
grant select, insert, update, delete on public.melhorias to authenticated;

create policy "gestor le melhorias" on public.melhorias for select to authenticated
  using ((select privado.usuarios_gestor()));

-- gestor cria qualquer coisa; os outros só sugerem (ideia, em nome próprio, sem "feito")
create policy "gestor cria, logado sugere" on public.melhorias for insert to authenticated
  with check (
    (select privado.usuarios_gestor())
    or (status = 'ideia' and sugerido_por = (select auth.uid()) and feito_em is null and novidade is null)
  );

create policy "gestor edita melhorias" on public.melhorias for update to authenticated
  using ((select privado.usuarios_gestor())) with check ((select privado.usuarios_gestor()));

create policy "gestor apaga melhorias" on public.melhorias for delete to authenticated
  using ((select privado.usuarios_gestor()));

-- Pendências combinadas até 11/10/2026 (sugeridas pelo Davi) e o que foi entregue no mesmo dia.
insert into public.melhorias (titulo, descricao, status, prioridade, aba, sugerido_por, sugerido_nome) values
  ('Webinários fase 2', 'Plataforma de webinário, ofertas na Hubla e teste A/B.', 'fazer', 'baixa', 'Webinários', null, 'Davi'),
  ('Monitor das BMs', 'Falta configurar o número remetente e o template na Meta.', 'fazer', 'alta', 'Monitor', null, 'Davi'),
  ('Resumo diário e alertas pelo WhatsApp', 'Resumo do dia e alertas importantes chegando no WhatsApp.', 'fazer', 'alta', 'Início', null, 'Davi'),
  ('Custo de mensagens por BM', 'Custo por BM a R$ 0,035 por mensagem.', 'fazer', 'media', 'BMs', null, 'Davi'),
  ('Recuperação de vendas', 'Acompanhar Pix e boleto gerados e não pagos.', 'fazer', 'alta', 'Vendas', null, 'Davi'),
  ('Metas por vendedor', 'Meta individual e acompanhamento por vendedor.', 'fazer', 'media', 'Vendas', null, 'Davi'),
  ('Chargeback da Hubla', 'Registrar e descontar chargebacks da Hubla.', 'fazer', 'media', 'Vendas', null, 'Davi'),
  ('Checklist diário do gerente', 'Lista do que o gerente confere todo dia.', 'fazer', 'media', 'Tarefas', null, 'Davi'),
  ('Biblioteca da operação', 'Scripts, objeções e áudios num lugar só.', 'fazer', 'baixa', 'Outra', null, 'Davi'),
  ('Check-in fase 2', 'Comparação por dia da semana com o Funil.', 'fazer', 'media', 'Check-in', null, 'Davi'),
  ('Mensagem automática fora do horário', 'Resposta automática na Data Crazy para quem chega fora do horário de atendimento.', 'fazer', 'alta', 'Funil', null, 'Davi');

insert into public.melhorias (titulo, descricao, status, prioridade, aba, sugerido_por, sugerido_nome, feito_em, novidade) values
  ('Lead conta no dia da 1ª mensagem', 'Lead sem etiqueta também conta; filas com uma linha por lead.', 'feito', 'alta', 'Funil', null, 'Davi',
   '2026-10-11 10:35:00-03', 'Funil: o lead conta no dia da 1ª mensagem, com ou sem etiqueta, e as filas mostram uma linha por lead.'),
  ('Etiqueta CL como marcador de chegada', 'Chegada = 1ª mensagem ou CL; tempo até iniciar o atendimento; quem chegou e ainda não começou.', 'feito', 'alta', 'Funil', null, 'Davi',
   now(), 'Funil: a etiqueta CL marca a chegada, e há o tempo até iniciar o atendimento e a lista de quem chegou e ainda não começou.'),
  ('Aba Melhorias', 'Backlog em colunas, sugestões de qualquer pessoa e Novidades.', 'feito', 'media', 'Melhorias', null, 'Davi',
   now(), 'Nova aba Melhorias: backlog, botão "Sugerir melhoria" no Início e Novidades.');
