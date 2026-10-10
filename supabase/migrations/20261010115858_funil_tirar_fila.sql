-- Funil: tira a coluna `fila` de funil_conversas (substituída por `statuses` em funil_statuses).
-- Ela era uma fila só por conversa e errava o Aguardando. Desde o deploy de 10/10/2026 nenhum
-- código lê ou grava nela. Não perde informação: as filas vêm de `statuses`.

drop index if exists public.funil_conversas_fila_idx;
alter table public.funil_conversas drop column fila;
