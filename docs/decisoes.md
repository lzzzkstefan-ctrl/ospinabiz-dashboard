# Decisões do projeto

Registro curto do que foi decidido e por quê. Decisão nova entra no topo.

## 2026-10-08: Regra A — Protocolo na venda = ticket, pelo valor cobrado

Substitui as versões do mesmo dia ("só o principal" e "nome ≠ cobrado vai para A revisar").

- **"Protocolo Game Changer" (ou "Game Changer Society") na venda, como principal OU como
  order bump → venda de ticket.** Nexus PGC, Combo, Acesso Vitalício e templates nunca entram
  na comissão; sem Protocolo na venda → "sem comissão (produto)".
- **Ticket pelo VALOR cobrado do item Protocolo**, como no Lock in. O nome da oferta é
  ignorado ("Ticket - R$208" cobra R$ 288). Webhook: `amountCents` da oferta do Protocolo
  (`ticketDoPrincipal` em `modulos/vendas/regras.ts`). Planilha: valor do produto − preços
  dos outros itens (`classificar` em `scripts/vendas-planilha-hubla.mjs`); ex.: 346,90 −
  58,90 (Nexus) = 288 → ticket R$ 288.
- **Valor que não bate com nenhum ticket → "A revisar"** com o motivo.
- **Vendas antigas:** `scripts/vendas-corrigir-produto.mjs` compara cada venda com a regra A
  (prévia por vendedor e mês; grava um mês de um vendedor por vez, só com OK do Davi).
  **26 vendas do Davi já foram alteradas** de "sem comissão (produto)" para ticket (pela
  outra sessão, 08/10/2026), o que mudou julho/2026 do Davi de R$ 3.169,98 para
  R$ 3.213,26 a 10%; o masterview precisa da mesma correção para os meses baterem.

**Por quê:** a Hubla põe o ticket ora como produto, ora como order bump; e o nome da oferta
não é o preço. O valor cobrado do Protocolo é o que o Lock in sempre usou.

## 2026-10-08: Tela de Vendas igual ao Lock in, por vendedor

- **Mesma tela do Lock in** (masterview, só o visual e as regras): período, 4 cards, margem,
  rosca, resumo por ticket, comissão em cada margem, fechamento, lista Pago/Reembolso/Tabela,
  resumo anual e link público `/r/<código>`. Admin escolhe **Davi | Vyenna | Geral**; o vendedor
  vê a mesma tela só com o que é dele (RLS) e sem os botões que gravam.
- **"Total de vendas" = todas as pagas** (como no Lock in), não só as com ticket. Sem ticket conta
  só na quantidade ("sem comissão (produto)" ou "a revisar", campo `principal_produto`).
- **% que vale = o do fechamento**, gravado pelo admin no "Enviar pro Rodrigo". Antes disso a tela
  abre no % sugerido pela margem do mês (ou 10% sem sugestão); o seletor só muda a visualização.
- **Cliente: primeiro nome + 4 dígitos** para o vendedor (das vendas dele) e no link público. O
  servidor lê `vendas_clientes` com a chave secreta só das vendas que o RLS já liberou.
- **Ticket do histórico = valor cobrado** (como no Lock in), não o preço escrito no nome da oferta:
  na planilha da Hubla, "Ticket - R$238,00" cobrava R$ 100,00. Os tickets do backup do masterview
  são os valores cobrados. O webhook ainda liga pelo nome: conferir com a primeira venda real.
- **Adiantamentos, observações e link** por vendedor e mês (`vendas_adiantamentos`,
  `vendas_meses_vendedor`); WhatsApp do Rodrigo em `vendas_config` (só admin).

## 2026-10-08: Webhook da Hubla pela Edge Function

Substitui o item "Webhook continua no Next" abaixo.

- **A Edge Function `hubla-webhook` só recebe:** confere o `x-hubla-token` e grava o evento bruto
  em `hubla_eventos`. A regra de venda continua só no Next (`modulos/vendas/processar.ts`), para
  não existir uma segunda cópia em Deno.
- **Idempotência:** `x-hubla-idempotency` vai para `chave_idempotencia` (única). A Hubla reenviando
  o mesmo evento recebe 200 e nada é gravado de novo.
- **Processamento:** um gatilho no banco chama `/api/vendas/processar` (pg_net, `cron_secret` do
  Vault); o pg_cron repete a cada 10 min para pendentes, até 5 tentativas.
- **Token:** a Hubla usa um token só para a conta, então o secret é o mesmo do masterview.
  A rota `/api/vendas/hubla` na Vercel foi apagada em 09/10/2026 (ver abaixo).

## 2026-10-08: Vendas por vendedor (Davi e Vyenna), snapshot e fechamento

Substitui, onde houver conflito, a entrada "Vendas (Hubla, atribuição e comissão)" abaixo.

- **% da comissão escolhido no fechamento, por vendedor** (`vendas_fechamentos`). A margem da
  operação continua sendo calculada, mas só **sugere** a faixa; o % gravado no fechamento é o
  que vale. Os totais ficam congelados no fechamento; se uma venda mudar depois, a tela avisa
  e a exportação só sai depois de atualizar.
- **Snapshot por venda:** cada venda guarda bruto, líquido e as 5 comissões do ticket no
  momento da venda (trigger no banco). Mudar ou desativar ticket nunca recalcula venda antiga.
- **Vendedor vê só o que é dele**, garantido pelo RLS: saiu o "A atribuir" do vendedor e o
  botão "É minha". Venda sem dono ou nova sem ticket vai para **"A revisar"**, só do admin.
  O e-mail de acesso fica em `vendedores.email`, coluna que o vendedor não consegue ler.
- ~~Webhook continua no Next~~: substituído pela Edge Function (entrada "Webhook da Hubla pela
  Edge Function"). A regra continua num lugar só (`/api/vendas/processar`).
- **Exportação:** CSV (separador `;`, abre certo no Excel) e PDF pela impressão do navegador
  (`/vendas/fechamento`), sem biblioteca nova. Só de mês fechado.
- **Histórico:** importado com `origem = 'importacao'`. O do Davi vem do backup do Lock in
  (`scripts/vendas-importar-masterview.mjs`, confere os totais com o masterview); o da Vyenna,
  da planilha da Hubla (`scripts/vendas-importar-hubla-xlsx.mjs`), e só vale depois de ela conferir.
- **Convite sem depender de SMTP:** `scripts/vendas-convidar.mjs` gera o link de convite para
  mandar no WhatsApp (sem SMTP próprio, o e-mail padrão do Supabase pode não chegar a quem
  não é da equipe do projeto no Supabase).

## 2026-10-08: Vendas (Hubla, atribuição e comissão)

- **Toda venda aprovada vira registro na hora, mesmo sem dono.** No Lock in a venda só nascia
  depois do "É minha", e o reembolso que chegava antes se perdia (a venda nascia "Pago").
- **Evento gravado antes de processar**, com reprocessar pela tela: se o processamento falhar
  depois do 200, nada se perde.
- **Dados de cliente em tabela separada, só admin** (`vendas_clientes`), e payload bruto só admin.
- **"É minha" e correções gravam com a chave secreta no servidor**, depois de conferir quem pede;
  o "É minha" só pega venda ainda sem dono (dois cliques ao mesmo tempo: um ganha).
- **Margem calculada sobre a operação inteira**; o vendedor recebe só a faixa.
- **Comparação de token ignora espaço/Enter nas pontas** (`lib/auth/segredo.ts`), para cron e
  Hubla: token colado na Vercel com Enter dava 401 no Lock in.

Detalhes em `docs/modulos/vendas.md`.

## 2026-10-08: Página inicial e capa

- **Capa no Storage, bucket `capas` com leitura pública:** é só uma imagem decorativa; pública,
  ela carrega direto pelo endereço. Só admin envia, troca ou apaga (RLS no `storage.objects`).
- **Envio direto do navegador para o Storage:** evita o limite de tamanho das Server Actions.
  Depois o servidor confere se é admin e grava o caminho em `config_painel`; a imagem antiga é apagada.
- **"Status do dia" lê as mesmas regras das abas** (monitor e tarefas), sem copiar cálculo.
- **Depois do login, a pessoa cai no Início** (antes: Monitor).

## 2026-10-08: Tarefas

- **"Atrasada" é calculada, não guardada:** pendente com prazo antes de hoje (horário de Brasília).
- **Qualquer usuário logado** cria, edita, conclui e reabre. **Ninguém apaga** (sem delete no RLS).
- **`concluida_em`, `criado_por` e `criado_em`** são cuidados por gatilho no banco: a tela não
  consegue preencher errado nem trocar quem criou.
- **Vínculo opcional com uma BM ou um número**, nunca os dois.

**Por quê:** status guardado como "atrasada" ficaria errado no dia seguinte sem ninguém mexer.
Sem delete, o histórico da operação não se perde.

## 2026-10-08: Organização das BMs (equipe, final, situação)

- **Tabela `equipe`:** responsáveis por números e tarefas. `usuario_id` é opcional, para alguém
  ser responsável antes de ter login.
- **Número identificado pelo `final` (4 dígitos):** o telefone completo é opcional e, quando
  preenchido, tem que terminar com o final. O mesmo final não se repete na mesma BM.
- **`situacao` (operação/desconectado) × `ativo`:** situação diz se o número está em uso;
  `ativo = não` é "arquivado" (sai da tela principal, fica no histórico). Nada é apagado.
- **O monitor só testa:** situação = operação, ativo, BM ativa e telefone completo preenchido.
- **Limite como número inteiro** (250, 1000, 2000…): aceita novos degraus da Meta sem migration.
- **Dados reais (BMs, finais, equipe) entram direto no banco**, nunca na migration nem no git.

**Por quê:** a lista da operação vem só com os 4 finais; o telefone completo é preenchido
depois pela tela. Separar situação de arquivado permite tirar um número do teste sem perder
o histórico dele.

## 2026-10-08: Relógio do monitor no pg_cron, segredos no Vault

O pg_cron chama `rodar-teste` às 7h30 e 17h e `fechar-teste` 10 minutos depois de cada um
(7h40 e 17h10). O endereço do app (`monitor_app_url`) e a senha (`cron_secret`) ficam no Vault
do Supabase, nunca na migration.

**Por quê:**
- **10 minutos:** dá tempo de a Meta mandar os status pelo webhook sem atrasar demais o alerta.
- **Vault:** a migration vai para o GitHub; no Vault a senha fica criptografada no banco.
  Trocar a URL ou a senha é só atualizar o Vault, sem migration nova.
- **`cron_secret`** tem que ser igual ao `CRON_SECRET` da Vercel. Se trocar um, trocar o outro.

## 2026-10-08: Estrutura organizada por módulo

Cada módulo tem uma pasta própria em cada camada:
- telas em `app/(painel)/<modulo>`;
- rotas de máquina em `app/api/<modulo>`;
- regras em `modulos/<modulo>`;
- documentação em `docs/modulos/<modulo>.md`.

Ferramentas usadas por mais de um módulo ficam em `lib/`.

**Por quê:** módulo novo (vendas, fechamento) entra sem mexer nos outros. As regras ficam
fora das telas pra serem usadas pelo webhook, pelo relógio e pelo botão sem copiar código.

## 2026-10-08: Supabase é o relógio, Vercel faz o trabalho

O webhook, o envio e o alerta rodam em rotas `app/api` do Next, na Vercel. O pg_cron do Supabase
só chama essas rotas nos horários certos.

**Por quê:**
- **Cron da Vercel:** no Hobby, o cron roda no máximo 1x/dia por tarefa e com precisão de hora
  (±59 min).
- **pg_cron:** é gratuito e tem precisão de minuto.
- **Código:** ficar num lugar só (Next) é mais simples de manter do que dividir com Edge Functions em Deno.

## 2026-10-08: GitHub na conta pessoal, sem organização

A Vercel Hobby não importa repositório privado de organização. Transferir para uma organização
da empresa quando a Vercel for para um time pago. Ver `contas.md`.

## 2026-10-08: Login só por convite, papéis admin e atendente

Cadastro público desligado. O papel fica em `app_metadata` (o usuário não consegue editar).

## 2026-10-09: Funil pelas etiquetas da Data Crazy, não pelo pipeline

O funil é montado pelas etiquetas que os fluxos de automação colocam no lead. O pipeline da
Data Crazy quase não tem negócios cadastrados. O vínculo etiqueta → etapa fica na tabela
`funil_etiquetas`, editada pelo admin; nenhum nome de etiqueta fica no código.

**Por quê:** a operação acompanha o lead pelas etiquetas. Os nomes mudam com frequência
(duas sumiram no mesmo dia em que o módulo foi criado). O histórico da Data Crazy traz o
**nome** da etiqueta, não o id, então `funil_etiquetas_nomes` guarda todos os nomes que cada
etiqueta já teve.

## 2026-10-09: Sincronização do Funil incremental, a cada 15 min

A API da Data Crazy não filtra por "atualizado em" e limita 60 chamadas/min por rota. A cada
rodada: lê a lista de leads da janela (90 dias, mínimo 01/09/2026), que já traz as etiquetas
atuais; só busca o histórico (1 chamada por lead) de quem é novo ou mudou de etiqueta. O
vendedor e o número vêm das conversas, lidas da mais recente para trás até o início da janela.
A rota responde na hora e trabalha em segundo plano (`after`, até 300 s); o que não couber
fica para a próxima rodada.

**Por quê:** uma rodada sem mudanças custa ~6 chamadas. A carga inicial (29 leads) levou
35 chamadas e 40 s.

## 2026-10-09: Um receptor só para a Hubla (Edge Function)

A rota `/api/vendas/hubla` da Vercel foi apagada. O único receptor é a Edge Function
`hubla-webhook`, que é a URL cadastrada na Hubla (conferido pelo Davi no painel da Hubla).

**Por quê:** dois receptores fazendo a mesma coisa confundem (a doc de Vendas ainda apontava
para a rota antiga) e são mais uma porta aberta para manter. A regra de venda já ficava num
lugar só (`/api/vendas/processar`); agora a entrada também.

## 2026-10-09: Mês fechado fica travado (estorno, reabrir, ajuste)

Regras em `docs/modulos/vendas.md` ("Mês fechado"). A trava fica no banco (gatilho), não só
na tela: venda de mês fechado só muda com a identificação de quem mudou, e tudo vai para
`vendas_alteracoes`, que ninguém edita nem apaga.

**Por quê:** o fechamento é o que foi pago ao vendedor. Mudar uma venda de mês pago sem
registro deixa o valor pago e o valor da tela diferentes sem explicação. Reembolso depois do
fechamento não reabre o mês: vira estorno no próximo fechamento (decisão do Davi), e o mês
fechado continua mostrando o valor congelado, para não descontar duas vezes. Correção sem
reabrir: ajuste manual com motivo.

## 2026-10-09: Líquido de ticket pela fatura real (a partir de outubro/2026) — REVOGADA em 10/10 (ver abaixo)

Até setembro, o líquido de ticket (base da comissão) vinha da tabela de tickets, que supõe a taxa
do Pix. No cartão parcelado com juros a operação recebe mais (ex.: ticket R$ 238 em 12x: tabela
R$ 225,53, real R$ 234,67). A partir de outubro, o líquido de ticket é o que realmente fica na
fatura, na parte do ticket. Vale para todas as formas de pagamento.

**Por quê:** a comissão tem que acompanhar o que a operação recebe de fato, inclusive se a Hubla
mudar taxa (de jan a mar/2026 o Pix custava ~R$ 2 a mais por venda do que a tabela supõe).
Agosto e setembro já foram pagos e ficam como estão; julho fechado também (a diferença de
+R$ 30,67 a 10% ficou só como informação).

## 2026-10-09: Papel em Vendas separado do admin do sistema

Vendas tem papel próprio (chefe, gerente, vendedor) em `app_metadata.vendas`. As regras (RLS) de
Vendas usam esse papel; o "admin do sistema" continua valendo para Monitor, BMs, Usuários e Funil.

**Por quê:** o Davi é admin do sistema (criou e mantém a dash), mas em Vendas é vendedor e não pode
ver as vendas individuais da Vyenna. O chefe de Vendas é o Rodrigo. A Geral do vendedor não mostra
valor em reais nem ticket médio da equipe: com a quantidade da equipe, revelariam o faturamento do
outro pela diferença. A Configuração saiu do vendedor pelo mesmo motivo (a margem mostrava o
líquido da operação).

## 2026-10-09: Webinários v1 sem integração; checklist na aba Tarefas

Webinários começam com tudo digitado (cadastro, sessões, mensagens, links). Plataforma, ID da oferta
na Hubla e variação A/B são opcionais até serem definidos. O checklist de implantação vira tarefas da
aba Tarefas (ligadas ao webinário), a partir de um modelo fixo que o admin ajusta.

**Por quê:** plataforma, ofertas e formato do A/B ainda não estão definidos; digitar agora permite
usar o funil da live e o custo de mensagens já, e a integração (webhook, vendas pela oferta) entra
depois sem mudar o desenho. Tarefas já tem responsável, prazo e conclusão: não faz sentido duplicar.
O vendedor só vê nome e playbook dos webinários no ar (função no banco), nunca preço ou métricas.

## 2026-10-10: Funil: qualquer mensagem da empresa depois do lead conta como resposta

"Esperando resposta" = conversa em aberto (nem finalizada nem arquivada na Data Crazy) cuja ÚLTIMA
mensagem é do lead, sem nenhuma mensagem da empresa depois, seja de atendente ou de automação.
Quando a última é da empresa, o lead vai para "Aguardando o lead" (follow-up e webinar de downsell).
Antes (09/10): "automação não conta como resposta".

**Por quê:** a automação muitas vezes faz uma pergunta ao lead (ex.: PARTE 2 TOPO, "qual caminho
você vai escolher?"). Aí quem precisa responder é o lead, e a lista acusava espera de horas que não
era da empresa (Henry -6376 aparecia com 15h). A conversa "finalizada" no CRM vem como arquivada na
API (`finished` continua false), por isso arquivada também conta como fechada.

## 2026-10-10: Números internos marcados na sincronização, não apagados

Números de teste da equipe ficam fora do Funil por uma marca (`interno`) que a sincronização põe
nos leads e conversas, comparando os 8 últimos dígitos com o cadastro em `/funil/config`.

**Por quê:** apagar os leads de teste não adianta (a próxima sincronização traz de novo) e perderia
o histórico se o número for descadastrado. Os 8 últimos dígitos não dependem de +55, DDD ou do 9
extra. O telefone fica só na tabela de números internos (só admin) e no registro de contato que já
existia: as tabelas que o vendedor lê recebem só a marca.

## 2026-10-10: Escala: papel "plantonista" travado no banco; check-in pela hora do servidor

Quem só cobre turnos (irmãos do Davi, alguém só para sábado) ganha o papel `plantonista`: vê a
escala, faz check-in, os leads dele no Funil e as tarefas dele. Não vê Vendas, comissão, Webinários
nem Monitor, e o bloqueio está nas regras do banco (não só no menu). Começar e encerrar turno são
funções do banco que usam a hora do servidor; o admin corrige com motivo registrado.

**Por quê:** algumas tabelas eram legíveis por qualquer logado (tickets com comissão, meta, números
monitorados com telefone); para alguém de fora da equipe de vendas isso é demais. Hora digitada
permitiria "ajustar" presença. A escala padrão guarda vigência (desde/até) para que mudar a escala
não reescreva o escalado dos dias passados.

**Exceção ao "Supabase é o relógio, a Vercel faz o trabalho":** o fechamento do turno esquecido
(22h05) roda direto no banco (`privado.escala_encerrar_esquecidos`), sem chamar rota: é uma
atualização simples de dados, sem serviço externo nem regra que precise do código.

## 2026-10-10: Comissão sempre pela tabela; valor com juros só como "recebido real"

Revoga a decisão de 09/10. Líquido de ticket e comissão voltam a sair da tabela de tickets em todos
os meses (outubro do Davi a 10%: R$ 54,66, não R$ 55,58). O valor que entra de verdade na fatura,
com os juros do parcelamento, fica guardado à parte (`vendas.liquido_real`) e aparece só como
"Recebido real" na visão Geral.

**Por quê:** decisão do Davi: a comissão tem que ser previsível pela tabela; os juros do cartão
parcelado são receita da operação, não base de comissão.

