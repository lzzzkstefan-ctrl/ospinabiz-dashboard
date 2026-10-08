-- Junta as duas regras de leitura de vendas numa só (o Postgres avalia uma regra
-- por linha em vez de duas). Mesmo acesso: admin vê tudo; vendedor vê as próprias
-- e as "A atribuir".

drop policy "admin le vendas" on public.vendas;
drop policy "vendedor le as proprias e a atribuir" on public.vendas;

create policy "le vendas: admin tudo, vendedor as proprias e a atribuir" on public.vendas
  for select to authenticated
  using (
    (select privado.eh_admin())
    or vendedor_id = (select privado.minha_equipe_id())
    or (vendedor_id is null and not sem_vendedor)
  );
