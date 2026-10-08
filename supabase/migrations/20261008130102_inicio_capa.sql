-- Página inicial: capa com imagem editável.
-- A imagem fica no Storage do Supabase (bucket "capas"); o caminho da imagem
-- atual fica na tabela config_painel. Só admin troca a capa.

-- ---------------------------------------------------------------------------
-- config_painel: ajustes do painel em formato chave/valor (ex.: capa_inicio).
-- ---------------------------------------------------------------------------
create table public.config_painel (
  chave          text primary key,
  valor          text,
  atualizado_em  timestamptz not null default now()
);

alter table public.config_painel enable row level security;

revoke all on public.config_painel from anon;
grant select, insert, update on public.config_painel to authenticated;

create policy "logado le config" on public.config_painel
  for select to authenticated using (true);
create policy "admin cria config" on public.config_painel
  for insert to authenticated with check ((select privado.eh_admin()));
create policy "admin edita config" on public.config_painel
  for update to authenticated
  using ((select privado.eh_admin())) with check ((select privado.eh_admin()));

-- ---------------------------------------------------------------------------
-- Bucket "capas": leitura pública (é só uma imagem decorativa, e assim ela
-- carrega rápido pelo endereço direto), até 5 MB, só JPG, PNG ou WEBP.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas', 'capas', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Só admin envia, troca ou apaga imagens do bucket. Trocar arquivo (upsert)
-- precisa de insert + select + update.
create policy "admin envia capa" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'capas' and (select privado.eh_admin()));
create policy "admin ve capas" on storage.objects
  for select to authenticated
  using (bucket_id = 'capas' and (select privado.eh_admin()));
create policy "admin troca capa" on storage.objects
  for update to authenticated
  using (bucket_id = 'capas' and (select privado.eh_admin()))
  with check (bucket_id = 'capas' and (select privado.eh_admin()));
create policy "admin apaga capa" on storage.objects
  for delete to authenticated
  using (bucket_id = 'capas' and (select privado.eh_admin()));
