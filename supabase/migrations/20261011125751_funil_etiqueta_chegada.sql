-- Funil: etiqueta de chegada (automação "Contador de lead" na Data Crazy; pedido do Davi, 11/10/2026).
--
-- A Data Crazy só cria o lead na 1ª etiqueta, e as automações do funil só rodam quando um vendedor
-- assume a conversa. O Davi criou uma automação que só põe a etiqueta CL quando chega a mensagem do
-- anúncio. Ela é MARCADOR DE CHEGADA, não etapa: chegada do lead = o que vier primeiro entre a
-- 1ª mensagem e a etiqueta CL.
--
-- etiqueta_chegada_dc_id: a etiqueta (pelo id: renomear na Data Crazy não muda nada).
-- etiqueta_chegada_desde: a etiqueta foi reaproveitada (antes era "🧊ads-sab-10-10"); só valem as
--   colocações a partir daqui. Começa na 1ª vez que o nome "CONTADOR DE LEAD" aparece no histórico.
-- O admin muda as duas em /funil/config.

alter table public.funil_config
  add column etiqueta_chegada_dc_id text references public.funil_etiquetas (dc_id) on delete set null,
  add column etiqueta_chegada_desde timestamptz;

create index funil_config_etiqueta_chegada_idx on public.funil_config (etiqueta_chegada_dc_id);

comment on column public.funil_config.etiqueta_chegada_dc_id is
  'Etiqueta que marca a chegada do lead (CL). Não é etapa do funil.';
comment on column public.funil_config.etiqueta_chegada_desde is
  'Só as colocações da etiqueta de chegada a partir deste instante contam (a etiqueta foi reaproveitada).';

grant update (etiqueta_chegada_dc_id, etiqueta_chegada_desde) on public.funil_config to authenticated;

-- valor inicial a partir dos dados (sem id no código): etiqueta que já se chamou "CONTADOR DE LEAD"
-- e a 1ª colocação dela com esse nome
update public.funil_config c
set etiqueta_chegada_dc_id = n.etiqueta_dc_id,
    etiqueta_chegada_desde = (
      select min(e.em) from public.funil_eventos e
      where e.etiqueta_dc_id = n.etiqueta_dc_id and e.acao = 'colocou' and e.etiqueta_nome ilike '%contador de lead%'
    )
from (
  select etiqueta_dc_id from public.funil_etiquetas_nomes
  where nome ilike '%contador de lead%'
  order by visto_em
  limit 1
) n
where c.id;
