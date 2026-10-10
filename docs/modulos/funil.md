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
- **Esperando resposta:** conversa ABERTA (não finalizada na Data Crazy) em que a última mensagem do
  lead não teve resposta de atendente de verdade (automação e suporte Data Crazy não contam) há mais
  de X horas, contando só o horário de atendimento, todos os dias. Padrão 2h, 8h–22h; o admin muda em
  `/funil/config`. Vale para lead antigo que voltou a falar (base = `funil_conversas`, as conversas
  com mensagem nos últimos 90 dias). Conversa finalizada não conta: se o lead escrever de novo, ela
  reabre. A sincronização grava `esperando_desde`; quando a última mensagem é automação, confere as
  mensagens recentes (no máximo 40 conversas por rodada). Vendedor vê só as dele. Cartão no Início.
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
