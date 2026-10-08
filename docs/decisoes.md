# Decisões do projeto

Registro curto do que foi decidido e por quê. Decisão nova entra no topo.

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
