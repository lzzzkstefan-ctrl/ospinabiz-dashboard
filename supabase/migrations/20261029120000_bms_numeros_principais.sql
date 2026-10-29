-- Aba BMs vira "saúde dos números principais" (pedido do Davi, 29/10/2026).
-- A operação passou a rodar com 2 números principais numa BM nova, isolada (teste: o ban vinha de ter
-- muitos números juntos?). A tela mostra a saúde desses números; o resto vai para o Arquivo.
--
-- O que entra (só colunas novas e uma situação nova; nada é apagado):
--   - situação "reserva": número pronto para entrar, fora do monitor (o monitor só testa "operacao");
--   - principal: o número aparece em "Números em operação" (card grande);
--   - ddd: só o DDD, para o card ("DDD 21") sem precisar do telefone completo;
--   - em_operacao_desde: começo do contador "dias sem ban" do teste;
--   - qualidade: qualidade do número na Meta (verde/amarela/vermelha), preenchida à mão enquanto o
--     META_CUSTO_TOKEN não existe (com o token, a tela lê da Meta e esta coluna fica de reserva);
--   - observacao: texto livre (ex.: "proxy X, isolado desde 29/10"). Nunca usuário, senha ou IP de
--     proxy: o banco recusa texto com cara de IP; a tela recusa também "senha", "user:pass@" etc.
--
-- Os dados reais (BM Principal, finais, DDD) entram direto no banco, fora do git.

alter table public.monitor_numeros drop constraint monitor_numeros_situacao_check;
alter table public.monitor_numeros
  add constraint monitor_numeros_situacao_check check (situacao in ('operacao', 'reserva', 'desconectado', 'banido'));

alter table public.monitor_numeros drop constraint monitor_numeros_situacao_antes_ban_check;
alter table public.monitor_numeros
  add constraint monitor_numeros_situacao_antes_ban_check check (situacao_antes_ban in ('operacao', 'reserva', 'desconectado'));

alter table public.monitor_numeros
  add column principal          boolean not null default false,
  add column ddd                text check (ddd ~ '^[1-9][0-9]$'),
  add column em_operacao_desde  date,
  add column qualidade          text check (qualidade in ('verde', 'amarela', 'vermelha')),
  add column observacao         text check (
    char_length(observacao) <= 300
    and observacao !~ '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}'
  );

comment on column public.monitor_numeros.principal is 'Número principal da operação: card grande no topo da aba BMs.';
comment on column public.monitor_numeros.ddd is 'Só o DDD (2 dígitos), para mostrar no card sem o telefone completo.';
comment on column public.monitor_numeros.em_operacao_desde is 'Começo do contador "dias sem ban" (teste dos números isolados).';
comment on column public.monitor_numeros.qualidade is 'Qualidade na Meta preenchida à mão (verde/amarela/vermelha). Com META_CUSTO_TOKEN a tela lê da Meta.';
comment on column public.monitor_numeros.observacao is 'Texto livre descritivo. Nunca usuário, senha ou IP de proxy (o banco recusa IP).';
