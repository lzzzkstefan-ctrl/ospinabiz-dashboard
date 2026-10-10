-- Pessoa de TESTE (pedido do Davi, 10/10/2026): conta para testar a dashboard com o mesmo acesso
-- de um vendedor, sem sujar nada.
-- equipe.teste = true:
--   - fica fora dos horários fixos (lista de pessoas do Check-in), do "Online agora" e dos cards da
--     semana dos outros (ela mesma vê os próprios check-ins e pausas, para poder testar);
--   - check-in e pausa dela não contam para "operação descoberta/coberta", pausa longa, sem
--     check-in nem aviso de pausa;
--   - Vendas e Funil já a deixam de fora porque ela não tem código UTM nem atendente da Data Crazy.

alter table public.equipe add column teste boolean not null default false;
comment on column public.equipe.teste is
  'Pessoa de teste: fora dos horários fixos, do Online agora, dos cards dos outros e dos avisos do Check-in. Sem UTM nem atendente.';
