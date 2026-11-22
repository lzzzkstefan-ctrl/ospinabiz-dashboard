-- Quadro de Projetos: iniciativas pequenas, com dono, prazo e checklist (22/11/2026, pedido do Davi).
-- Idempotente: pula uma iniciativa se já existir outra com o mesmo título.
-- Dono/responsável casam pelo nome na tabela equipe (davi, rodrigo, guga); se não achar, fica vazio.
do $$
declare
  p_davi    bigint := (select id from public.equipe where nome ilike 'davi%' order by id limit 1);
  p_rodrigo bigint := (select id from public.equipe where nome ilike 'rodrigo%' order by id limit 1);
  p_guga    bigint := (select id from public.equipe where nome ilike 'guga%' order by id limit 1);
  ini bigint;
begin

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '1. Alinhar a oferta e a divisão com o Rodrigo') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '1. Alinhar a oferta e a divisão com o Rodrigo', f.id, 'Sair com produto, divisão e regra do back decididos antes de abordar qualquer criador.', p_davi, date '2026-11-24', 'andamento', 1
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Decidir qual produto o funil do influenciador vende (Protocolo Viral ou outro low ticket)', p_davi, 1),
      (ini, 'Fechar a divisão do front (ex.: criador 40 / Davi 30 / Rodrigo 30)', p_rodrigo, 2),
      (ini, 'Decidir se o criador ganha algo no back (upsell e mentoria) e quanto', p_rodrigo, 3),
      (ini, 'Decidir quem paga o acréscimo por fora, se houver, e de onde sai', p_rodrigo, 4),
      (ini, 'Registrar as decisões na aba Decisões', p_davi, 5);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '2. Pegar os números reais com o amigo estrategista') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '2. Pegar os números reais com o amigo estrategista', f.id, 'Trocar chute por benchmark: quanto das views vira clique, quiz, VSL e venda.', p_davi, date '2026-11-25', 'planejando', 2
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Marcar a conversa com o estrategista do canal de referência', p_davi, 1),
      (ini, 'Anotar: % das views que clica no link', p_davi, 2),
      (ini, 'Anotar: % que termina o quiz e % que vê a VSL até a oferta', p_davi, 3),
      (ini, 'Anotar: conversão final e ticket médio', p_davi, 4),
      (ini, 'Perguntar como ele fecha o contrato e o acréscimo por fora', p_davi, 5),
      (ini, 'Confirmar que não vamos competir pelo mesmo público ou oferta', p_davi, 6);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '3. Planilha de viabilidade (views → vendas → quanto fica pra cada um)') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '3. Planilha de viabilidade (views → vendas → quanto fica pra cada um)', f.id, 'Saber quantas views por mês um criador precisa ter pra valer a pena.', p_davi, null, 'ideia', 3
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Montar a planilha com os números do benchmark', p_davi, 1),
      (ini, 'Simular criador pequeno (20 mil views), médio (80 mil) e grande (250 mil)', p_davi, 2),
      (ini, 'Definir o mínimo de views por vídeo pra entrar na lista', p_davi, 3);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '4. Lista de 20 canais candidatos') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '4. Lista de 20 canais candidatos', f.id, 'Ter 20 canais pontuados antes de mandar a primeira mensagem.', p_davi, date '2026-11-25', 'planejando', 4
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Critérios: 30 a 300 mil inscritos, público adulto, dor de dinheiro ou mudança de vida', p_davi, 1),
      (ini, 'Critérios: comentários de verdade e sem oferta parecida rodando no canal', p_davi, 2),
      (ini, 'Listar 20 canais com nome, link, inscritos, views médias e contato', p_davi, 3),
      (ini, 'Dar nota de 0 a 10 e escolher os 10 primeiros', p_davi, 4);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '5. Kit de abordagem dos criadores') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '5. Kit de abordagem dos criadores', f.id, 'Chegar com prova, proposta e contrato prontos.', p_davi, date '2026-11-26', 'planejando', 5
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Proposta de uma página: o que eu faço, o que o criador faz, divisão e conta de exemplo', p_davi, 1),
      (ini, 'Mensagem de DM e de e-mail personalizáveis + follow-up do dia 3', p_davi, 2),
      (ini, 'Separar os prints de resultado que podem ser mostrados', p_davi, 3),
      (ini, 'Contrato simples: divisão, prazo mínimo, quem faz o quê, saída', p_davi, 4);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '6. Abordar os 20 canais e fechar o primeiro') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '6. Abordar os 20 canais e fechar o primeiro', f.id, 'Primeiro parceiro fechado ou em negociação.', p_davi, null, 'ideia', 6
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Mandar as 20 abordagens personalizadas', p_davi, 1),
      (ini, 'Follow-up no dia 3 ou 4 pra quem não respondeu', p_davi, 2),
      (ini, 'Fazer as calls com quem respondeu', p_davi, 3),
      (ini, 'Fechar o 1º parceiro e assinar o contrato', p_davi, 4);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '7. Modo Protagonista: proposta enviada') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '7. Modo Protagonista: proposta enviada', f.id, 'Primeiro candidato concreto: canal com 139 mil inscritos vendendo só um guia de R$ 9,90.', p_davi, null, 'andamento', 7
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Revisar o rascunho no Gmail e trocar o [SEU WHATSAPP]', p_davi, 1),
      (ini, 'Enviar o e-mail', p_davi, 2),
      (ini, 'Mandar DM no Instagram reforçando o e-mail', p_davi, 3),
      (ini, 'Follow-up em 3 dias se não responder', p_davi, 4),
      (ini, 'Checar a faixa etária do público antes de fechar', p_davi, 5);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '8. Roteiro da mini VSL de 5 min (a parte que o criador grava)') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '8. Roteiro da mini VSL de 5 min (a parte que o criador grava)', f.id, 'Um ângulo novo, fugindo do "ganhe em dólar" saturado.', p_davi, null, 'ideia', 8
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Escrever 5 ângulos novos e escolher 2 pra testar', p_davi, 1),
      (ini, 'Roteiro com a objeção "mais um curso" respondida de frente', p_davi, 2),
      (ini, 'Adaptar o roteiro pra voz de cada criador', p_davi, 3);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '9. Funil do influenciador: quiz → VSL → checkout') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '9. Funil do influenciador: quiz → VSL → checkout', f.id, 'Funil reaproveitável: monta uma vez, troca só o link de cada criador.', p_davi, null, 'ideia', 9
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Roteiro do quiz: 5 a 8 perguntas e 3 a 4 perfis de resultado', p_davi, 1),
      (ini, 'Montar o quiz (Inlead ou no código) e pedir o WhatsApp antes do resultado', p_davi, 2),
      (ini, 'Roteiro da VSL', p_davi, 3),
      (ini, 'Gravar a VSL', p_rodrigo, 4),
      (ini, 'Checkout na Hubla com a coprodução configurada e order bump', p_davi, 5),
      (ini, 'Fluxo de recuperação no Prime pra quem fez o quiz e não comprou', p_davi, 6);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '10. Medição do funil') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '10. Medição do funil', f.id, 'Saber onde perde e quanto cada criador e cada vídeo vendeu.', p_davi, null, 'ideia', 10
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Microsoft Clarity e GA4 na página', p_davi, 1),
      (ini, 'Link com UTM por criador e por vídeo', p_davi, 2),
      (ini, 'Conectar a UTMify com a Hubla', p_davi, 3),
      (ini, 'Relatório semanal por criador pra prestar contas da divisão', p_davi, 4);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '11. Protocolo Viral no app: revisar a visão do aluno') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '11. Protocolo Viral no app: revisar a visão do aluno', f.id, 'Garantir que quem compra o Viral entra e sabe o que fazer.', p_davi, null, 'ideia', 11
      from public.frentes f where f.slug = 'viral-influencers'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Criar conta de teste com o plano Só o Protocolo Viral', p_davi, 1),
      (ini, 'Marcar em /admin/acessos os módulos liberados pro Viral', p_davi, 2),
      (ini, 'Entrar pela conta de teste e anotar o que confunde', p_davi, 3),
      (ini, 'Subir o vídeo de onboarding do Viral', p_davi, 4);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '1. Chamar os 10 leads que clicaram e ninguém atendeu') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '1. Chamar os 10 leads que clicaram e ninguém atendeu', f.id, 'Leads quentes parados no post da skill de edit.', p_davi, date '2026-11-22', 'andamento', 12
      from public.frentes f where f.slug = 'organico-instagram'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Abrir GCS admin → Instagram → post da skill de edit → "10 ainda não foram chamados"', p_davi, 1),
      (ini, 'Chamar os 10 no WhatsApp', p_davi, 2),
      (ini, 'Anotar quantos compraram', p_davi, 3);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '2. Destravar a ferramenta pra usar de novo') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '2. Destravar a ferramenta pra usar de novo', f.id, 'Saber se ela serve pra outras contas e se o Davi consegue operar.', p_davi, date '2026-11-24', 'planejando', 13
      from public.frentes f where f.slug = 'organico-instagram'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Perguntar ao Guga se está parada de propósito ou só sem dono', p_davi, 1),
      (ini, 'Confirmar se dá pra conectar mais de uma conta de Instagram', p_guga, 2),
      (ini, 'Se o app da Meta estiver em teste, adicionar o Davi como testador', p_guga, 3);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '3. Primeiro Reel com palavra que vende') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '3. Primeiro Reel com palavra que vende', f.id, 'Voltar a rodar com palavra específica (tipo CLAUDE), não de curiosidade (tipo Clone).', p_davi, null, 'ideia', 14
      from public.frentes f where f.slug = 'organico-instagram'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Escolher o produto de ~R$ 10 e o link de destino', p_davi, 1),
      (ini, 'Escolher a palavra-chave ligada ao produto', p_davi, 2),
      (ini, 'Roteiro do Reel', p_davi, 3),
      (ini, 'Gravar e postar o Reel', p_guga, 4),
      (ini, 'Configurar a automação em duas etapas e testar com um comentário', p_davi, 5);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = '4. Rotina semanal do orgânico') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select '4. Rotina semanal do orgânico', f.id, 'Constância: o orgânico só funciona com volume.', p_davi, null, 'ideia', 15
      from public.frentes f where f.slug = 'organico-instagram'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Combinar quantos Reels por semana e quem grava', p_davi, 1),
      (ini, 'Toda segunda: olhar "Qual palavra converte" e cortar a que não vende', p_davi, 2),
      (ini, 'Chamar no mesmo dia quem clicou pro WhatsApp', p_davi, 3);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'Funil base da Parte 1 no Prime (pausas e condições)') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'Funil base da Parte 1 no Prime (pausas e condições)', f.id, 'Uma conversa de verdade: para no "não", segue no "sim", lembrete de 20 min e 2 h.', p_davi, null, 'andamento', 16
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Montar a pausa 1 com a lista de palavras segura e testar "pode continuar" e "não tenho interesse"', p_davi, 1),
      (ini, 'Replicar nas pausas 2 a 5 (4 e 5 com Qualquer resposta)', p_davi, 2),
      (ini, 'Mensagem de "voltou" com a etiqueta DEMOROU MAIS DO QUE 2 HORAS', p_davi, 3),
      (ini, 'Duplicar nas 10 cópias trocando nome, etiqueta e Áudio 1', p_davi, 4);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'Objeções no Prime (47 no total)') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'Objeções no Prime (47 no total)', f.id, 'Trazer as da Data Crazy e as novas, com áudio do Rodrigo.', p_davi, null, 'andamento', 17
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Preencher os [colchetes] com a informação real', p_davi, 1),
      (ini, 'Gravar o bloco Dinheiro (5 áudios)', p_rodrigo, 2),
      (ini, 'Gravar o bloco Confiança (8 áudios)', p_rodrigo, 3),
      (ini, 'Gravar o bloco Como funciona (11 áudios)', p_rodrigo, 4),
      (ini, 'Gravar o bloco Capacidade (11 áudios)', p_rodrigo, 5),
      (ini, 'Gravar o bloco Momento (3 áudios)', p_rodrigo, 6),
      (ini, 'Criar os fluxos no Prime e testar cada palavra', p_davi, 7);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'Parte 2 com o vídeo do app novo') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'Parte 2 com o vídeo do app novo', f.id, 'Vídeo que gera desejo mostrando a trilha nova.', p_davi, null, 'planejando', 18
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Regravar o vídeo da Parte 2 (tour do app novo)', p_rodrigo, 1),
      (ini, 'Montar a Parte 2 no Prime', p_davi, 2);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'Downsell "pegar o resto" (2 dias pros R$ 158)') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'Downsell "pegar o resto" (2 dias pros R$ 158)', f.id, 'Não perder quem quer mas não tem o valor hoje.', p_davi, null, 'planejando', 19
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Gravar o áudio', p_rodrigo, 1),
      (ini, 'Criar o fluxo com o prazo de 2 dias e o lembrete', p_davi, 2);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'Vídeos de onboarding (Tomada 1, Tomada 2 e Viral)') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'Vídeos de onboarding (Tomada 1, Tomada 2 e Viral)', f.id, 'Aluno sabe o primeiro passo no mesmo dia.', p_davi, null, 'planejando', 20
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Gravar os 3 vídeos', p_rodrigo, 1),
      (ini, 'Subir no app em cada trilha', p_davi, 2);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'Saúde dos números de WhatsApp') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'Saúde dos números de WhatsApp', f.id, 'Parar de perder número por ban.', p_davi, null, 'planejando', 21
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Pedir análise dos 2 números banidos no app', p_davi, 1),
      (ini, 'Aquecer o número novo por 5 a 7 dias antes de pôr no fluxo', p_davi, 2),
      (ini, 'Reduzir follow-up de quem não respondeu e cortar disparo pra lista fria', p_davi, 3);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'Conectar a conta de anúncios na Metrik') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'Conectar a conta de anúncios na Metrik', f.id, 'Saber o custo real de cada venda.', p_rodrigo, null, 'planejando', 22
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Conectar a conta de anúncios da operação', p_rodrigo, 1);
  end if;

  ini := null;
  if not exists (select 1 from public.iniciativas where titulo = 'App GCS: erro 1102 e redesign no ar') then
    insert into public.iniciativas (titulo, frente_id, objetivo, dono_id, prazo, coluna, ordem)
    select 'App GCS: erro 1102 e redesign no ar', f.id, 'App estável pro aluno.', p_davi, null, 'planejando', 23
      from public.frentes f where f.slug = 'x1-gcs'
    returning id into ini;
  end if;
  if ini is not null then
    insert into public.iniciativa_itens (iniciativa_id, texto, responsavel_id, ordem) values
      (ini, 'Ver nos logs da Cloudflare se é limite de CPU do plano gratuito', p_davi, 1),
      (ini, 'Assinar o Workers Paid (US$ 5/mês) se for o caso', p_guga, 2),
      (ini, 'Juntar o PR do redesign e fazer o deploy', p_guga, 3);
  end if;
end $$;
