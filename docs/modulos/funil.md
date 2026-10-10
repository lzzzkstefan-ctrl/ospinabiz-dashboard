# Contexto: Funil e Leads

Fontes: Data Crazy API (leads, conversas, histórico do lead) e vendas da Hubla
(já no banco, módulo Vendas). Sincronização a cada 15 min pelo pg_cron chamando
`/api/funil/sincronizar` (protegida por `CRON_SECRET`). Respeitar o limite de
60 chamadas/min.

## Etapas (ordem)
1. Perguntas iniciais
2. Parte 1        | perda: Parte 1 frustrado
3. Parte 2        | perda: Parte 2 frustrado
4. Esclarecido
5. Eu quero
6. Link de pagamento
7. Vai pagar hoje
8. Aluno (comprou). Confirmar cruzando o telefone com a venda da Hubla.
   "Aluno pagou no Pix/CNPJ" = venda fora da Hubla.

Perda antes da Parte 1: Interação frustrado.
Objeção: Sem dinheiro → Downsell (GSC ou Viral; identificar pelo produto da
venda na Hubla).
Fora do funil: Menor de idade, Suporte, Lançamento.
Em revisão (ignorar por enquanto): Primeira interação, Conexão inicial,
Parte 2 R$398, Intervalo, Semente, Pegar o resto.

## Regra principal
O vínculo etiqueta → etapa fica numa tabela editável pelo admin (as etiquetas
vão mudar de nome). Nada de nome de etiqueta fixo no código.

## O que guardar por lead
Data de entrada, número de WhatsApp que recebeu, vendedor (pela conversa),
etiquetas com a data em que foram colocadas (evento `lead-tag-added` do
histórico; se não der, a primeira vez que a sincronização viu). Nome e telefone
só em tabela de admin; o telefone serve só para cruzar com a Hubla.

## Telas da v1
- Leads por dia (escolher período)
- Funil dos leads que entraram no período: quantos chegaram em cada etapa,
  % e perda entre etapas, com o maior gap destacado
- Perdas por motivo (frustrados, sem dinheiro)
- Funil por vendedor e por número de WhatsApp
- Tempo médio entre etapas

Acesso: admin vê tudo; vendedor vê só o funil dele.
Depois (não agora): mensagens por etapa e webhook das automações.

## Decisões (09/10/2026)
- "Chegou na etapa" = recebeu a etiqueta da etapa alguma vez (mesmo que tirada depois).
- "Aluno pagou no Pix/CNPJ" conta como comprador. "Aluno" sem venda achada na
  Hubla fica "a conferir".
- Carga inicial: leads criados desde 01/09/2026.
- Acompanhamento: leads criados nos últimos 90 dias. A API não filtra por
  "atualizado em", então a cada rodada a sincronização:
  1. lê a lista de leads dos últimos 90 dias (já vem com as etiquetas atuais,
     500 por chamada) e compara com o banco: etiqueta diferente = histórico pendente;
  2. lê as conversas por "última mensagem" (a API devolve da mais recente para
     a mais antiga) até chegar em 90 dias atrás: conversa nova = atualiza
     vendedor e número do lead (liga pelo `contactId`);
  3. lê o histórico só dos leads pendentes, respeitando o limite; o que sobrar
     fica para a próxima rodada;
  4. cruza com as vendas da Hubla (no banco, sem chamar a API).
- A tela mostra data/hora da última sincronização e avisa se ela falhou.
- Atendente da equipe da Data Crazy (`funil_atendentes.suporte_dc`) não é vendedor: a
  sincronização pula esse atendente; lead atendido só por eles fica sem vendedor.

## O que a API da Data Crazy entrega (conferido em 09/10/2026, só leitura)
Base `https://api.g1.datacrazy.io/api/v1`, `Authorization: Bearer DATACRAZY_API_KEY`.
Spec: `https://api.datacrazy.io/v1/api/openapi/v1/json`. Filtros na query como
`filter[campo]=valor`.

- **Limite:** 60 chamadas/min **por rota** (cabeçalhos `X-RateLimit-*`; 429 traz `Retry-After`).
- **`GET /leads`:** aceita `take` até 500 e `skip` até 10.000 (acima disso vem
  vazio). Filtros `createdAtGreaterOrEqual` / `createdAtLessOrEqual` funcionam
  (conferido contra a varredura completa). **Não devolve total**: contar = paginar.
  Cada lead já vem com as etiquetas **atuais** (id, nome). O campo `attendant`
  do lead vem vazio na prática: não serve para achar o vendedor.
- **`GET /leads/{id}/history`:** uma chamada por lead. Eventos com data
  (`createdAt`) e `historyCode`:
  - `lead-created`
  - `lead-tag-added` / `lead-tag-removed`: `parameters.name` = **nome** da
    etiqueta (não vem o id). `sessionName` = nome do fluxo de automação que
    colocou a etiqueta (vazio quando foi manual).
  - `conversation-attendant-changed`: `parameters.attendantName` (vendedor) e
    `parameters.instanceName` (número de WhatsApp, ex.: "🌽3087-NOME").
- **Etiquetas no histórico vêm pelo nome.** Quando uma etiqueta for renomeada,
  os eventos antigos continuam com o nome antigo. Por isso a sincronização
  guarda todos os nomes que cada id de etiqueta já teve.
- **`GET /tags`:** id, nome, cor, descrição, `createdAt` (data em que a
  etiqueta foi criada, não em que foi colocada no lead).
- **`GET /pipelines` e `/pipelines/{id}/stages`:** 1 pipeline ("Processo de
  vendas", 17 etapas). Quase sem negócios cadastrados: a operação usa etiquetas,
  não o pipeline.
- **`GET /conversations`:** tem `attendants` e `instance` (número). O `count`
  trava em 999 (não é o total real).
- **`GET /conversations/{id}/messages`:** devolve `{messages, histories}`.
  `received = true` = veio do lead; `false` = saiu da empresa (com `attendant`
  quando foi uma pessoa; sem, quando foi automação ou envio pelo celular).
- **Webhook de saída:** não existe na API. Possível via bloco de automação do
  CRM (a confirmar no CRM, fica para depois).

## Tela v1 (09/10/2026)
Rota `/funil` (menu "Funil"). Cálculo em `modulos/funil/calculo.ts`, leitura em `modulos/funil/dados.ts`
(com o login de quem vê: o vendedor só recebe os leads dele pelo RLS).
- Período: hoje, 7 dias (padrão), 30 dias, mês, personalizado (até 366 dias). Filtros de
  vendedor e número (só admin).
- Funil acumulado: quem chegou numa etapa conta nas anteriores. Comprou (Hubla ou Pix/CNPJ) conta
  como chegou em Aluno. Lead com etiqueta "fora do funil" fica fora do funil, mas entra em
  "leads por dia".
- Maior gap: a maior perda entre duas etapas seguidas, só onde a etapa de cima tem pelo menos
  3 leads ou 10% do funil (senão 1 lead virando 0 aparece como −100%).
- Tempo entre etapas: só com data real do histórico (não a data de "primeira vez que vi").
- Aviso de sincronização: última rodada falhou ou mais de 45 min sem rodada completa.
- Início: cartões "Leads hoje" e "Maior gap da semana".
- Fora da v1: downsell, mensagens por etapa.

## Contagem de leads (09/10/2026, decisão do Davi)
- **Lead do dia** = lead criado na Data Crazy no dia, no fuso America/Sao_Paulo: a sincronização
  busca `GET /api/v1/leads` com `createdAtGreaterOrEqual`/`createdAtLessOrEqual` (00:00–23:59:59.999
  de Brasília convertidos para UTC). A API não devolve total: o "count" é o tamanho da lista.
- **Card, leads por dia (e o tooltip por número) e a tabela "Leads por número"** saem da mesma
  leitura dos leads (mesmo snapshot): cada lead uma vez só, no número (instância) da **primeira
  conversa**; quem ainda não conversou fica em "ainda sem conversa". A soma por número = total.
- O número do lead, depois de definido, não muda (a primeira conversa pode sair da janela de 90 dias).
- **Etiquetas não contam leads**: servem só para as etapas do funil.
- A tela lê a cópia do banco (atualizada a cada 15 min); o card mostra "contado até HH:MM" e o
  admin tem "Sincronizar agora". A tela não consulta a Data Crazy a cada acesso (limite de 60
  chamadas/min por rota, dividido com o cron).

## Atendimento (09/10/2026, migration funil_atendimento)
- **Esperando resposta (regra de 10/10/2026):** conversa ABERTA em que a ÚLTIMA mensagem é do lead
  (`received = true`) e nenhuma mensagem da empresa veio depois, seja de atendente ou de automação,
  há mais de X horas, contando só o horário de atendimento, todos os dias. Padrão 2h, 8h–22h; o admin
  muda em `/funil/config`. Vale para lead antigo que voltou a falar (base = `funil_conversas`, as
  conversas com mensagem nos últimos 90 dias). Vem de `ultima_recebida_em` > `ultima_enviada_em`
  (`lastSendedMessageDate` da API inclui automação), sem ler mensagens. Vendedor vê só as dele.
  Cartão no Início.
  - **Antes (09/10):** "automação não conta como resposta": se a automação respondeu, o lead seguia
    esperando até um atendente responder. **Errado:** ex.: Henry -6376 aparecia esperando 15h, mas a
    última mensagem era a automação PARTE 2 TOPO perguntando o caminho: quem tinha que responder era
    o lead. **Agora:** qualquer mensagem da empresa depois do lead conta como resposta.
- **Aguardando o lead:** conversa ABERTA em que a última mensagem é da empresa (atendente ou
  automação) e o lead não responde há mais de X horas (mesmo limite e horário). Mostra a etapa em que
  parou. São os candidatos a follow-up e ao webinar de downsell. Só leads (alunos ficam fora); o lead
  que está esperando a empresa em outro número não entra.
  - **Aberta x fechada (10/10/2026):** o "Finalizar" do CRM ARQUIVA a conversa: na API, `finished`
    continua `false`, mas vem `archivedAt` e `statuses: ["archived"]`. Fechada = `finished` OU
    `archivedAt` OU `statuses` com `finished`/`archived` (gravado em `funil_conversas.finalizada`).
    Aberta = `statuses` com `opened`, `unstarted` ou `automation`.
  - **Uma linha por lead:** o mesmo lead em mais de um número vira uma linha, com os números juntos e
    o maior tempo de espera.
  - **Duas listas:** "Leads esperando resposta" (sem etiqueta de Aluno) e "Alunos esperando (suporte)"
    (com etiqueta de uma etapa de compra, ex.: 👽 ALUNO). O cartão do Início conta só os leads.
- **Tempo de primeira resposta:** 1ª mensagem do lead → 1ª mensagem depois dela de um atendente de
  verdade, na 1ª conversa do lead, em horário de atendimento. Lido uma vez por lead (até 40 por rodada;
  sem resposta, tenta por 7 dias). Média e mediana por quem respondeu.
- **Conversão por número e por BM:** número = o da 1ª conversa; BM pela ligação `funil_numeros →
  monitor_numeros` (os 18 números ligados pelo final em 09/10/2026).
- **Conversão por dia:** % dos leads do funil do dia que viraram Aluno ou chegaram numa etapa
  (padrão Parte 2), com seletor.
- **Mudanças no funil:** o admin registra (dia, etapa opcional, descrição) em `/funil/config`; viram
  linhas tracejadas nos gráficos de leads e de conversão.
- Identificação do lead nas listas: só "primeiro nome -1234" (nunca nome completo nem telefone).

## Filas e números internos (10/10/2026, migration funil_filas_internos)
- **Filas da Data Crazy (corrigido em 10/10, migration funil_statuses):** os `statuses` da API são
  marcas que SE SOMAM, como as abas do CRM: `opened` = **Em aberto** (em atendimento), `unstarted` =
  **Não iniciados** (ninguém assumiu), `waiting` = **Aguardando** (o lead espera a empresa),
  `automation` = **Com automação** (robô). A mesma conversa pode estar em mais de uma lista (ex.: o
  atendimento #37096 veio `["waiting", "opened"]`; os do robô vêm `["automation", "unstarted"]`).
  A primeira versão (uma fila só por conversa, coluna `fila`) punha o #37096 só em Em aberto e o
  Aguardando ficava 0. Conferido em 10/10: 08h20 API 38 opened + 3 unstarted = CRM (Em aberto 38,
  Não iniciados 3); robô 2 = aba do robô no CRM.
  Gravado em `funil_conversas.statuses` (vazio = fechada) e `fila_desde` (`currentThread.createdAt`,
  senão a criação da conversa). Tempo real: no Aguardando, desde a última mensagem do lead; nas outras,
  desde o início do atendimento atual. Uma linha por conversa (para bater com o CRM). Vendedor vê só as
  dele (as não iniciadas ainda não têm vendedor).
- **Números internos (teste):** cadastro em `/funil/config` (só admin), tabela
  `funil_numeros_internos` (o telefone fica só lá; nunca no código nem no git). Comparação pelos
  8 últimos dígitos (`chave`, única). A sincronização marca `interno` em `funil_leads` (telefone do
  lead e dos contatos) e `funil_conversas` (telefone do contato); todas as leituras do Funil filtram
  `interno = false`: leads por dia, funil, conversão, esperando resposta, aguardando o lead, filas,
  primeira resposta, cartões do Início e público elegível dos Webinários. Cadastrar ou apagar dispara
  uma sincronização: o que já foi contado sai (ou volta) sem apagar dado nenhum. A tela mostra só o
  nome e o final do número.
- **Rótulo do contato:** se o nome no CRM é (ou contém) um telefone, ele não entra no rótulo, só os
  4 últimos dígitos (antes aparecia o telefone inteiro na lista).

