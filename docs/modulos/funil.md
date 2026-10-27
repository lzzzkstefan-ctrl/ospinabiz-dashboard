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
- **Mudou em 11/10/2026 (ver "Chegada e leads sem etiqueta" abaixo):** o dia do lead agora é o da
  1ª mensagem, e contato novo sem etiqueta também conta. O texto a seguir é a regra antiga.
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

## Chegada e leads sem etiqueta (11/10/2026, decisão do Davi; sem migration)
- **Problema:** na Data Crazy o lead só existe depois que a automação põe a 1ª etiqueta (de 0 min a
  quase 1 dia depois da 1ª mensagem, medido em 11/10). Quem chegava e não era etiquetado não contava,
  e quem era etiquetado depois da meia-noite caía no dia seguinte.
- **Regra:** lead conta no **dia da 1ª mensagem** (Brasília, UTC-3), com ou sem etiqueta.
  - Lead da Data Crazy: chegada = a conversa mais antiga do contato (a conversa nasce com a 1ª
    mensagem), ou a criação do lead, se for mais cedo. Conversa de mais de 7 dias antes do lead
    (contato antigo que voltou) não puxa a data.
  - Contato **novo** (criado na janela) que mandou mensagem e ainda não tem lead: linha em
    `funil_leads` com `dc_id = contato:<id interno do contato>` (nunca o telefone), sem histórico.
    Quando o lead aparece na Data Crazy, a linha `contato:` é apagada e o lead entra no mesmo dia.
- Vale para tudo que lê `funil_leads` por `dia`: Leads no período, por dia, por número, funil por
  etapa, Leads sem atendimento na chegada, gráfico por hora e o card do Início.
- **Funil por etapa:** a primeira linha é **Chegou** (todos do funil), com "(N sem etiqueta)"; quem
  não tem etiqueta não chega em nenhuma etapa. O maior gap continua só entre etapas.
- Contagem em 11/10 (antes → depois): sexta 09/10 28 → 29 (2 sem etiqueta), sábado 10/10 30 → 37
  (2 sem etiqueta), domingo 11/10 17 → 11 (6 tinham a 1ª mensagem no sábado).
- **Filas:** uma linha por lead (o mesmo lead em dois números aparece uma vez, números juntos; se
  alguma conversa for Não iniciado, vale Não iniciado; o tempo é o maior). O total do título continua
  em conversas abertas.

## Etiqueta de chegada CL (11/10/2026, migration funil_etiqueta_chegada)
- **Contexto:** o Davi criou na Data Crazy a automação "Contador de lead": gatilho "Mensagem recebida"
  nos 18 números, com trechos da mensagem do anúncio; só põe a etiqueta CL (e cria o lead se não existir),
  sem mandar mensagem. Serve porque as automações do funil só rodam quando um vendedor assume.
- **CL é marcador de chegada, não etapa.** Chegada = o que vier primeiro entre a 1ª mensagem e a CL.
  `funil_config.etiqueta_chegada_dc_id` (pelo id: renomear não muda nada; já se chamou "🤖CONTADOR DE
  LEAD", só emoji e "👹 CL") e `etiqueta_chegada_desde`: a etiqueta foi reaproveitada da antiga
  "🧊ads-sab-10-10" (colocada em 09/10 e 10/10, e às 07:09 de 11/10 em lote pelo fluxo "❄️NOMES"), então
  só valem colocações a partir de 11/10 08:45 (1ª vez com o nome "CONTADOR DE LEAD"). Admin muda em
  /funil/config.
- A sincronização lê as datas da CL do histórico já gravado; lead novo acerta o dia na rodada seguinte.
- **Funil:** começa em "Chegou" com "(N ainda sem Perguntas iniciais)". Maior gap só entre etapas.
- **Tempo até iniciar o atendimento:** chegada → 1ª etiqueta de etapa (só datas reais do histórico),
  média e mediana, separando chegada dentro e fora do horário (9h–22h). Tempo real.
- **Chegaram e ainda não começaram** (card + lista): leads dos últimos 7 dias sem nenhuma etiqueta de
  etapa, sem etiqueta "fora do funil" e sem compra; espera em tempo real desde a chegada.
- Conferência em 11/10 (13h): depois do corte das 08:45, 4 chegaram e os 4 têm CL. Os outros 11 do dia
  chegaram antes do corte.

## Filas e números internos (10/10/2026, migration funil_filas_internos)
- **Filas da Data Crazy (corrigido em 10/10, migration funil_statuses):** os `statuses` da API são
  marcas que SE SOMAM, como as abas do CRM: `opened` = **Em aberto** (em atendimento), `unstarted` =
  **Não iniciados** (ninguém assumiu), `waiting` = **Aguardando** (o lead espera a empresa),
  `automation` = **Com automação** (robô). A mesma conversa pode estar em mais de uma lista (ex.: o
  atendimento #37096 veio `["waiting", "opened"]`; os do robô vêm `["automation", "unstarted"]`).
  A primeira versão (uma fila só por conversa, coluna `fila`) punha o #37096 só em Em aberto e o
  Aguardando ficava 0. Conferido em 10/10: 08h20 API 38 opened + 3 unstarted = CRM (Em aberto 38,
  Não iniciados 3); robô 2 = aba do robô no CRM.
  **Tela (10/10, pedido do Davi):** duas listas. "Não iniciados e em atendimento" (unstarted +
  opened, uma linha por lead desde 11/10, coluna Situação; Não iniciados primeiro, cada grupo pelo maior
  tempo na fila) e "Aguardando" (waiting), separada. Robô (automation) não aparece (não é usado em
  outra parte; o status continua gravado).
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

## Leads sem atendimento na chegada (10/10/2026, migration funil_minutos_chegada)
- Substitui na tela a lista "Alunos esperando (suporte)" (o cálculo continua separando aluno de
  lead nas listas de espera).
- Leads que ENTRARAM no período (filtros de vendedor e número valem; vendedor vê só os dele pelo
  RLS; número interno fora). Chegada = 1ª mensagem do lead (`primeira_msg_lead_em`; sem ela, a
  criação do lead). Resposta = 1ª mensagem de atendente de verdade (`primeira_resposta_em`).
  - **Fora do horário:** chegada fora de `atendimento_inicio`–`atendimento_fim` (9h–22h desde 10/10).
  - **Dentro do horário, sem atendente:** chegou no horário e não teve resposta em até
    `minutos_primeira_resposta` (padrão 30, editável em /funil/config).
  - **Atendidos a tempo:** chegou no horário e teve resposta nesse prazo.
  - Quem chegou no horário há menos de X minutos e ainda não teve resposta fica "no prazo" (fora dos
    grupos).
  - Por grupo: quantidade, % do total, tempo REAL médio até a 1ª resposta (só de quem teve resposta;
    a madrugada conta) e % que virou Aluno (venda na Hubla ou Pix/CNPJ, a mesma regra do funil).
  - Gráfico de leads por hora de chegada (0h–23h, Brasília), com a faixa fora do horário em laranja.
- Cálculo em `chegadaDosLeads` (modulos/funil/calculo.ts).


## Filtro "Número banido" (16/10/2026, migration monitor_numero_banido)

Pedido do Davi: ver os leads que ficaram num número banido para decidir quem retomar por outro número.

- Número banido = situação **Banido** na aba BMs (nova, além de Em operação e Desconectado). Banido sai do
  monitor e vai para "Fora da operação", igual ao desconectado. Fora da operação a etiqueta "falta telefone"
  não aparece (o telefone completo só serve para o teste do monitor).
- Botão **Número banido** nos filtros do Funil (`?b=1`): mostra a seção "Leads em número banido". Entra todo
  lead com conversa (aberta ou finalizada, qualquer data) em número banido; uma linha por lead.
- Colunas: lead, etapa, vendedor, número banido, outro número (conversa do mesmo lead em número não banido) e
  última mensagem. Etapa e vendedor vêm da conversa mais recente; sem eles, de outra conversa e por fim do
  lead (`funil_leads`), porque conversa antiga/finalizada costuma vir sem vendedor.
- Ordem: primeiro os órfãos (sem nenhum outro número), depois os demais; dentro, a conversa mais recente.
- O vendedor vê só os dele (RLS das conversas). O filtro de vendedor vale; o de número e o período não.

## Dono do lead = atendente (16/10/2026, decisão do Davi; sem migration)

Mudança de modelo: antes cada número era de um vendedor ("2504-DAVI", "0348-VY"); agora sobraram poucos
números e os leads são distribuídos por **atendente** na Data Crazy.

- Investigação: o vendedor já vinha do atendente da conversa (`attendants` da conversa ou, no histórico, a
  troca de atendente), nunca do sufixo do nome do número. O sufixo só aparecia no nome exibido. O que mudou:
  - a tela mostra o **atendente** (`atendente_dc_id`), com o nome da pessoa da equipe quando ligado, senão o
    nome na Data Crazy (ex.: atendente sem pessoa ligada deixava de aparecer como "ninguém"). Linha antiga
    sem atendente usa a pessoa gravada (`vendedor_id`); dados gravados não mudam;
  - o filtro **Vendedor (atendente)** é o principal e filtra por `atendente_dc_id` (`?v=<id na Data Crazy>`);
    **Número (ativos)** é secundário e lista só número em operação de BM ativa e não banida (sem cadastro na
    aba BMs entra); banido fica só no filtro "Número banido";
  - vendas e comissão continuam pelo `utm_term` da Hubla (não mexido).
- Número vira detalhe: `rotuloDoNumero` (calculo.ts) mostra emoji + final ("🍿 0348"), sem o sufixo; apelido
  trocado na aba BMs (diferente do padrão "final + BM") vale. Nas tabelas, Número vem depois de Vendedor, menor
  e apagado.
- **Hoje por atendente** (topo do Funil, `visaoPorAtendente`): um card por atendente (sem os de suporte; conta
  sem pessoa e sem movimento hoje fica de fora) com leads recebidos hoje (dono = atendente), em atendimento agora
  (conversa aberta com status opened), aguardando resposta dele (conversa aberta, última mensagem do lead, sem
  limite de horas), vendas de hoje (pagas e confirmadas, da pessoa ligada) e média até a 1ª resposta nos leads
  de hoje (horário de atendimento). Card **Sem atendente**: leads com conversa aberta sem atendente e há quanto
  tempo (real) espera o mais antigo. Barra de **distribuição** dos leads de hoje por dono.
- Aba BMs: cada número ativo mostra leads de **hoje** e dos **últimos 7 dias** (número da 1ª conversa do lead) e o
  selo "mais tráfego" no que mais recebeu na semana.

## Número banido fora das filas (16/10/2026, pedido do Davi; sem migration)

- Conversas em número banido (`numerosBanidos()`: situação Banido na aba BMs) ficam fora das Filas da Data
  Crazy, de "Leads esperando resposta", "Aguardando o lead", da visão "Hoje por atendente" e dos totais
  (inclusive o resumo do Início). "Chegaram e ainda não começaram" tira o lead cujo número (o da 1ª conversa)
  está banido.
- Embaixo das Filas, uma linha discreta "N conversas abertas em números banidos" leva ao filtro "Número banido".

## Custo de mensagens (27/10/2026, migration funil_custo_mensagens)

Pedido do Davi: quanto custam as mensagens do WhatsApp API oficial, por etapa, por lead e por venda.
Tela `/funil/custo` (só admin; link no topo do Funil). Configuração em `/funil/config#custo`.

**Regra de cobrança (como o Davi passou; configurável):**
- A Meta cobra cada mensagem **enviada** pela empresa e **entregue** (status RECEIVED ou READ na Data Crazy;
  SENT = ainda não entregue; ERROR = não cobra). Mensagem recebida do lead é grátis.
- **Franquia:** as primeiras 1.000 entregues de cada número no mês saem de graça, contadas na ordem de envio
  (mês em UTC, como a Meta). Depois, tudo é cobrado. A tela mostra em que dia/hora a franquia de cada número acabou.
- **Janela grátis de anúncio:** só para lead que chegou por anúncio Click-to-WhatsApp e teve a 1ª resposta em
  até 24 h: as mensagens dentro da janela (padrão 72 h, a regra da Meta que conhecemos) saem de graça. Os leads
  de hoje chegam por link/redirecionador, então não têm janela.
- Preço padrão R$ 0,035 por mensagem cobrada. Custo = cobradas × preço.

**O que a API da Data Crazy entrega (conferido em 27/10/2026, só leitura):**
- `GET /conversations/{id}/messages`: por mensagem, `received` (direção), `createdAt`, `status`
  (SENT/RECEIVED/READ/ERROR), `attachments[].type` (AUDIO, VIDEO, IMAGE, DOCUMENT), `buttons`/`header`
  (template ou botões), `attendant` (pessoa no CRM) e `senderName` (nome do fluxo de automação, ex.:
  "🦕 PARTE 1 TOPO"). Sem `attendant` e sem `senderName` = enviada pelo app do WhatsApp no celular
  (coexistência). O texto nunca é lido nem guardado.
- Os 9 números são WhatsApp Cloud API (`provider = WHATSAPP_CLOUD_API`); cada instância traz o id da WABA
  (`config.wabaId`, guardado em `funil_numeros.waba_id`). O token da instância nunca é lido.
- **Origem do lead:** a conversa tem `sourceReferral` (`ctwaId` = anúncio Click-to-WhatsApp). Em 500 conversas
  conferidas, todas vieram vazias (leads de link). Conversa com `ctwaId` = origem `ctwa`; senão `link`. O lead
  é `ctwa` se alguma conversa dele for.
- Limite: 1 chamada por conversa (100 mensagens por página), 60/min. A sincronização lê até 150 conversas por
  rodada, as mais recentes primeiro, só as que mandaram algo desde a última leitura
  (`funil_conversas.mensagens_lidas_ate`). Começa em 01/10/2026 (`INICIO_DO_CUSTO`).

**Etapa no momento do envio:** a última etiqueta colocada até o envio cujo `funil_etapas.grupo_custo` não é
vazio (o histórico de etiquetas já era guardado em `funil_eventos`). Depois da compra (`funil_leads.comprou_em`
= 1ª etiqueta de Aluno ou pagamento na Hubla, o que vier primeiro), "Comprou". Sem etiqueta ainda, "Antes da
1ª etapa". Grupos: Perguntas iniciais (ordem 1 e Interação frustrado), Parte 1 (ordem 2 e frustrado), Parte 2
(ordens 3–4 e frustrado), Sem dinheiro/downsell (objeção e downsell), Pagamento (ordens 5–7), Comprou (Aluno).
Etiqueta "fora do funil" não muda a etapa. O grupo de cada etapa fica no banco (`grupo_custo`).

**Onde fica:** `funil_mensagens_enviadas` (só metadados), `funil_custo_config`, `funil_meta_custo_dia`. O cálculo
de etapa/compra/cobrança é a função `funil_custo_recalcular` (no fim de cada sincronização, do 1º dia do mês de
3 dias atrás em diante; só grava o que mudou). Visões `funil_custo_resumo`, `funil_custo_franquia` e
`funil_custo_dia_utc` para a tela. Contas da tela em `modulos/funil/custo-calculo.ts`.

**Tela:**
- Por etapa: mensagens, leads, mensagens por lead, custo por lead e total.
- Custo por lead que entrou (custo do período ÷ leads que entraram), custo por lead que comprou (custo das
  mensagens até a compra ÷ compradores do período) e **custo por venda** (custo do período ÷ vendas pagas, GCS e
  Viral separados). Mensagens até a compra: média e mediana (só compradores que entraram a partir de 01/10).
- Grátis × cobrado, automação × atendente × celular, % do faturamento (valor pago das vendas do período).
- Por origem (link × Click-to-WhatsApp): leads, mensagens, custo, compras e custo por compra.
- Franquia por número e estimado × real (Meta) por dia em UTC.
- Filtros: período, vendedor (dono do lead) e produto (vale para vendas, faturamento e compradores).
- Número interno (teste) fica fora das contas por lead, mas entra na comparação com a Meta (ela cobra).

**Custo real da Meta (opcional):** `META_CUSTO_TOKEN` (`.env.local` e Vercel). Lê `pricing_analytics` de cada WABA
(`GET /{waba}?fields=currency,pricing_analytics...granularity(DAILY)`), no máximo a cada 3 h, 35 dias para trás.
Sem o token a tela mostra só o estimado. Como criar: Meta Business Suite da empresa dona dos números →
Configurações do negócio → Usuários do sistema → Adicionar (Admin) → Atribuir ativos → Contas do WhatsApp (as
da operação, controle total) → Gerar token, com o app da empresa, permissão **whatsapp_business_management**,
validade "Nunca". O token antigo do monitor (`META_ACCESS_TOKEN`) é de outra conta e não serve.
