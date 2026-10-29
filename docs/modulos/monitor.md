# Contexto: Dashboard de monitoramento dos números de WhatsApp (BMs)

## Objetivo
Criar um sistema que testa automaticamente, 2x por dia, se os números de WhatsApp API oficial da operação estão funcionando. O resultado deve aparecer numa dashboard e gerar um alerta. Hoje esse teste é manual: alguém manda uma mensagem para cada número e confere se chegou. Isso falha quando a pessoa esquece de testar ou quando um número cai de madrugada e ninguém vê.

## Cenário da operação
- Operação de vendas via WhatsApp (X1), com leads vindos de tráfego frio do Facebook Ads.
- **18 números** de WhatsApp Cloud API (oficial), distribuídos em **várias BMs** (ex.: "BM 01", "BM X").
- Todos os números estão conectados no CRM **Data Crazy**.
- **Quando uma BM cai, todos os números dela caem juntos.** Mas um número também pode cair sozinho (ban do número, restrição por qualidade, instabilidade).
- **Não temos mais acesso de admin a algumas BMs**, então não dá para consultar o status pelo token de cada BM.
- A **Data Crazy não envia relatório nem confirma se uma mensagem chegou**. O painel dela mostra "Conectado", mas não sabemos se esse status reflete uma queda real.

## Abordagem escolhida (via oficial)
1. Um **número remetente** de API oficial, numa **BM separada**, usada só para o monitor (fora da operação).
2. Duas vezes por dia, o sistema envia um **template de utilidade** neutro (ex.: "Teste de conexão {{1}}") para cada um dos 18 números.
3. O sistema recebe da Meta, via **webhook**, o status de cada mensagem (sent / delivered / failed) e registra o resultado.
4. **Opcional (teste completo):** uma automação na Data Crazy responde "ok" automaticamente quando chega "teste de conexão". O sistema confere quem respondeu, o que detecta também problemas do lado da Data Crazy.
5. Os resultados vão para a **dashboard**, e um **alerta** vai para o Telegram (ou outro canal definido).

Alternativa descartada por enquanto: chip comum conectado por ferramenta não oficial (ex.: Evolution API). Não precisa de BM, mas o chip pode ser banido e exige servidor ligado 24h.

## Horários dos testes
- **Manhã, antes de a operação começar** (ex.: 7h30): pega bans que aconteceram de madrugada.
- **Fim da tarde** (ex.: 17h, antes do turno do atendente da noite).
- Fuso horário: America/Sao_Paulo.

## O que a dashboard deve mostrar
- Um card por número, **agrupado por BM**, com: nome/apelido do canal (ex.: "1234 BM X"), status do último teste (OK / FALHOU / SEM RESPOSTA) e horário do último teste.
- Um destaque no topo: "18/18 ok" ou a lista do que caiu.
- **Regra de BM:** se todos os números de uma BM falharem no mesmo teste, mostrar "BM X caiu" em vez de listar número por número.
- **Regra do remetente:** se todos os 18 falharem ao mesmo tempo, o problema provavelmente está no remetente. Mostrar "verificar número remetente" em vez de "18 números caíram".
- Histórico simples dos últimos testes por número.
- Botão para rodar um teste manualmente.

## Formato do alerta
Mensagem curta, problemas primeiro. Exemplo:
```
Teste 07h30 — 17/18 ok
❌ BM X caiu (1234)
```

## Dados de entrada necessários
- Lista dos 18 números: número completo, apelido usado na Data Crazy e a qual BM pertence.
- Do remetente: Phone Number ID, WABA ID e token de acesso (usuário do sistema da BM do monitor).
- Nome e idioma do template aprovado.
- Token do bot do Telegram e o chat ID de destino.

## Requisitos técnicos
- Todos os tokens em variáveis de ambiente (`.env` local ou variáveis do provedor). **Nunca no código.**
- O webhook da Meta precisa de uma URL pública, sempre disponível, com verificação do token do webhook.
- Hospedagem sugerida: **Vercel**, já usada pelo usuário em outro projeto. Dashboard + endpoint do webhook + agendamento (cron) dos 2 testes. Antes de implementar, conferir os limites de cron do plano gratuito da Vercel.
- Custo estimado com a Meta: cerca de R$ 50/mês para 2 testes por dia nos 18 números (conferir a tarifa atual de template de utilidade no Brasil).
- O texto do template deve ser neutro, para não ser reclassificado como marketing (que é mais caro).

## Pendências antes de começar
- [ ] Confirmar com o Rodrigo que a decisão é a via oficial
- [ ] Ter a BM separada do monitor, com o número remetente conectado
- [ ] Template de utilidade aprovado
- [ ] Planilha com os 18 números e a BM de cada um
- [ ] (Opcional) Automação de resposta "ok" na Data Crazy

---

## Decisões de implementação (atualizado em 2026-10-08)

Estas decisões substituem o que está acima onde houver conflito.

- **"O Supabase é o relógio, a Vercel faz o trabalho":**
  - todo o código fica no Next, na Vercel:
    - `app/api/monitor/webhook` recebe da Meta;
    - `app/api/monitor/rodar-teste` envia o template;
    - `app/api/monitor/fechar-teste` decide o resultado e manda o alerta;
  - o pg_cron + pg_net do Supabase só chama essas rotas no horário exato
    (UTC: `30 10 * * *` = 7h30 e `0 20 * * *` = 17h; o fechamento roda alguns minutos depois de cada um);
  - o cron da Vercel **não** é usado: no plano Hobby ele roda no máximo 1x/dia por tarefa e
    dispara em qualquer minuto da hora marcada (7h00–7h59), sem garantir 7h30.
  - as chamadas do pg_cron levam `Authorization: Bearer CRON_SECRET`.
- **Status de cada número num teste:**
  - `delivered` (ou `read`) = OK;
  - `failed` = FALHOU;
  - só `sent`, ou nada, depois do prazo = SEM RESPOSTA.
  - Por isso o teste é "fechado" alguns minutos depois do envio (um job do pg_cron), e só aí o alerta sai.
- **Webhook:** responde à verificação GET da Meta (`hub.challenge`), confere a assinatura
  `X-Hub-Signature-256` com o app secret antes de processar qualquer coisa.
- **Números monitorados:** ficam numa tabela do banco, carregados da planilha. Nunca no código nem no git.
- **Login:** Supabase Auth, só convite, papéis `admin` e `atendente`.

## BM banida e seção "Levou ban" (16/10/2026, migration bms_ban)

- "Editar BM" tem a situação **Banida**: data do ban (padrão hoje, Brasília; não aceita data futura) e motivo.
  Banir a BM marca todos os números dela como **Banido**, com a mesma data, e guarda em
  `situacao_antes_ban` a situação que cada um tinha. **Desfazer ban** volta a BM e esses números para a
  situação de antes; número que já estava banido sozinho antes continua banido.
- Funções no banco: `public.bm_banir(bm, data, motivo)` e `public.bm_desfazer_ban(bm)` (só admin). O gatilho
  `monitor_numeros_ban` preenche `banido_em` quando o número vira banido (hoje, se não vier) e limpa ao sair.
- Aba BMs: BM banida e número banido saem de Ativos com/sem acesso e Fora da operação e vão para
  **Levou ban** (no fim, recolhida). Card apagado com selo vermelho, data, motivo, quantos números tinha e,
  por número, final, limite, responsável, leads e vendas que gerou (lead no número da 1ª conversa; venda =
  lead que comprou, Hubla ou Pix/CNPJ — mesma conta do Funil).
- Banido não entra no monitor (só testa situação "operacao" de BM ativa e não banida), nos alertas nem no
  contador "em operação". Os leads e as vendas continuam nos relatórios. Os números banidos entram no filtro
  "Número banido" do Funil.
- 16/10/2026: BM 01 (12 números) e BM KAIKY (2682) marcadas como banidas, motivo "Ban permanente da Meta".

## Números principais e Arquivo (29/10/2026, migration bms_numeros_principais)

Teste: a operação passou a rodar com **2 números principais numa BM nova e isolada (com proxy)**, para ver se o
ban vinha de ter muitos números juntos. A aba BMs deixou de ser uma lista de BMs e passou a mostrar a saúde
desses números.

- **Cadastro:** BM "BM Principal" com 🫆 1072 (DDD 21) e 🐻‍❄️ 8419 (DDD 18, veio da BM 09), os dois
  "em operação desde" 29/10/2026. Dados reais só no banco.
- **Colunas novas em `monitor_numeros`:** `principal`, `ddd`, `em_operacao_desde` (começo do contador
  "dias sem ban"), `qualidade` (manual: verde/amarela/vermelha) e `observacao` (texto livre, até 300 letras).
  Situação nova **Reserva** (fora do monitor, que só testa "operacao").
- **Observação nunca guarda usuário, senha ou IP de proxy:** o banco recusa texto com IP; a tela recusa também
  "senha:", "usuário:", "user:pass@".
- **Card de cada principal:** situação, BM, DDD, atendentes que receberam leads dele nos últimos 7 dias,
  dias sem ban, limite (tier) e qualidade, tabela Hoje / 7 dias (leads, mensagens, custo, vendas), último
  teste do monitor e observação. Mensagens e custo só para admin (mesma regra do Funil: custo = mensagens
  cobradas × preço da configuração do custo). O vendedor vê só os próprios leads e vendas.
- **Limite e qualidade:** com `META_CUSTO_TOKEN`, a tela lê da Meta (`/{waba}/phone_numbers`:
  `quality_rating` e `messaging_limit_tier`), casando pelo telefone completo ou pelo final. Sem o token (ou se
  a Meta recusar), usa o que foi preenchido à mão e mostra "manual".
- **Alertas no card:** qualidade amarela ou vermelha, ou contatos do dia acima de 80% do limite. "Contatos
  do dia" = leads diferentes que receberam mensagem do número hoje (é o que a Meta conta no limite de 24 h);
  só admin.
- **Comparação "Antes x Agora" (só admin):** antes = toda a operação até a véspera do teste; agora = só os
  principais desde o início do teste.
  - Dias até o ban: média, por número banido antes do teste, do 1º lead dele até a data do ban.
  - Leads por dia: leads sem internos ÷ dias do período.
  - Custo por venda: mensagens cobradas × preço ÷ vendas. O "antes" só conta desde 01/10/2026, quando o
    custo começou a ser lido.
- **Arquivo:** todo o resto (reserva, em operação fora dos principais, fora da operação, levou ban,
  arquivados), recolhido e só leitura. Nada é apagado: leads, vendas e testes continuam ligados.
- **"Gerenciar números" (só admin):** botão discreto que abre um modal para mudar a situação (e marcar como
  principal), cadastrar número reserva e cuidar das BMs (nova BM, renomear, banir, arquivar).
