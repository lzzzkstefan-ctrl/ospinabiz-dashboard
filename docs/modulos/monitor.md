# Contexto: Dashboard de monitoramento dos números de WhatsApp (BMs)

## Objetivo
Criar um sistema que testa automaticamente, 2x por dia, se os números de WhatsApp API oficial da operação estão funcionando. O resultado deve aparecer numa dashboard e gerar um alerta. Hoje esse teste é manual: alguém manda uma mensagem para cada número e confere se chegou. Isso falha quando a pessoa esquece de testar ou quando um número cai de madrugada e ninguém vê.

## Cenário da operação
- Operação de vendas via WhatsApp (X1), com leads vindos de tráfego frio do Facebook Ads.
- **18 números** de WhatsApp Cloud API (oficial), distribuídos em **várias BMs** (ex.: "BM 01", "BM ALEMÃO").
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
- Um card por número, **agrupado por BM**, com: nome/apelido do canal (ex.: "0348 BM ALEMÃO"), status do último teste (OK / FALHOU / SEM RESPOSTA) e horário do último teste.
- Um destaque no topo: "18/18 ok" ou a lista do que caiu.
- **Regra de BM:** se todos os números de uma BM falharem no mesmo teste, mostrar "BM X caiu" em vez de listar número por número.
- **Regra do remetente:** se todos os 18 falharem ao mesmo tempo, o problema provavelmente está no remetente. Mostrar "verificar número remetente" em vez de "18 números caíram".
- Histórico simples dos últimos testes por número.
- Botão para rodar um teste manualmente.

## Formato do alerta
Mensagem curta, problemas primeiro. Exemplo:
```
Teste 07h30 — 17/18 ok
❌ BM ALEMÃO caiu (0348)
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
