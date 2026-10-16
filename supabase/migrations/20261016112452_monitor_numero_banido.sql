-- Número banido (pedido do Davi em 16/10/2026): nova situação do número, além de "operacao" e
-- "desconectado". Banido sai do monitor e vai para "Fora da operação" na aba BMs, igual ao
-- desconectado; a diferença é o Funil: os leads com conversa num número banido aparecem no
-- filtro "Número banido", para decidir quem retomar por outro número.
-- Não muda nenhum número que já existe.

alter table public.monitor_numeros drop constraint monitor_numeros_situacao_check;
alter table public.monitor_numeros
  add constraint monitor_numeros_situacao_check check (situacao in ('operacao', 'desconectado', 'banido'));
