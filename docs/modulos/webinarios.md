# Contexto: Webinários

Webinários da operação: **downsell** (para quem não comprou) e **ascensão** (para quem comprou).

## v1 (09/10/2026) — sem integração
Plataforma, ofertas e o formato do A/B ainda não estão definidos: os campos de plataforma, ID da
oferta na Hubla, variação A/B e utm_content são opcionais, para preencher quando definir.

- **Cadastro** (`webinarios`): nome, tipo, oferta, preço, frequência, horário, plataforma (opcional),
  ID da oferta na Hubla (opcional), status (planejando, gravando, no ar, pausado).
- **Checklist**: cada item do modelo fixo (`webinario_checklist_modelo`, 11 itens; o admin ajusta) vira
  uma **tarefa da aba Tarefas** ligada ao webinário (`tarefas.webinario_id`), com responsável da
  equipe e prazo. Botão "criar itens do modelo" só cria os que ainda faltam.
- **Sessões** (`webinario_sessoes`): métricas digitadas — convidados → grupo → live → pitch → clique →
  compra, recuperados quente e morno — e mensagens digitadas (convite, "estou ao vivo", recuperação),
  separando template (paga) de janela de 24h (grátis). Uma sessão por dia e variação.
- **Funil da sessão**: % sobre a etapa de cima e sobre os convidados; somado e por sessão.
- **Teste A/B**: soma por variação e conversão convidados → compraram.
- **Custo de mensagens**: mensagens de template × custo por mensagem (`webinarios_config`, padrão R$ 0,035).
- **Público elegível** (vem do Funil, `modulos/funil/calculo.ts`): leads que não compraram e ficaram
  com etiqueta de perda ou objeção (Interação/Parte 1/Parte 2 frustrado, Sem dinheiro), em 7 ou 30 dias.
- **Biblioteca** (`webinario_links`): só links, por tipo (roteiro, copy, script, criativo, playbook, outro).

## Acesso
- Admin do sistema: vê e edita tudo.
- Vendedor: não lê as tabelas de webinário; vê só os webinários **no ar**, com o checklist (as
  tarefas) e o playbook, pela função `webinarios_no_ar()`. As tarefas seguem as regras da aba Tarefas
  (todo logado vê todas — decisão de 09/10/2026, pode mudar).

## Depois (não na v1)
- Webhook da plataforma de webinar (métricas automáticas).
- Vendas do webinar pela oferta própria na Hubla (ID da oferta) + utm_content com a data da sessão;
  faturamento por webinário e por sessão.
- Contar mensagens pelos templates da Meta.
