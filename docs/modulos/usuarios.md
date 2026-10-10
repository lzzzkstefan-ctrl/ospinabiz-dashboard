# Usuários

Aba `/admin/usuarios` (menu "Usuários"). Chefes em 10/10/2026: **Rodrigo e Davi** (um chefe só
altera outro chefe sendo chefe; tudo fica no registro). Só **chefe e gerente** em Vendas (a página confere; o
proxy ainda exige admin do sistema, que os dois são). Feita em 10/10/2026 (plano aprovado pelo Davi).

## Papéis (um na tela, dois por dentro)

| Tela | app_metadata.papel | app_metadata.vendas |
|---|---|---|
| Chefe | admin | chefe |
| Gerente | admin | gerente |
| Vendedor | atendente | vendedor |
| Plantonista | plantonista | nenhum |

Regras em `modulos/usuarios/regras.ts` (`podeMudar`), conferidas no servidor com o estado atual:
só chefe/gerente gerenciam; **só o chefe mexe em quem é ou vai ser chefe**; ninguém se desativa nem
troca o próprio papel; sempre fica pelo menos um chefe ativo. Troca de papel vale quando o login da
pessoa renova (até 1 h) ou ela sai e entra.

## O que a tela faz (`modulos/usuarios/gestao.ts`, chave secreta)

- **Lista:** nome, e-mail, papel, status (convite pendente = nunca entrou / ativo / desativado =
  `banned_until` no futuro), último acesso, atendente da Data Crazy e código UTM.
- **Convidar:** e-mail + nome + papel → `generateLink({type:"invite"})` + papel no app_metadata +
  pessoa na equipe (liga a uma pessoa sem login com o mesmo nome, ou cria). Mostra o link com
  "Copiar link" (vale ~1 h). Convite pendente: "Gerar novo link" (o anterior deixa de valer).
- **Editar:** papel; atendente da Data Crazy (um por pessoa; `funil_atendentes.equipe_id`, o gatilho
  repassa o vendedor aos leads); código UTM da Hubla (`vendedores.utm_term`, único; vazio = desliga,
  histórico fica).
- **Desativar:** `ban_duration` longo (não entra mais; quem está com a página aberta perde o acesso
  quando o login renovar, até 1 h), `equipe.ativo = false`, `vendedores.ativo = false`. Vendas,
  check-ins, pausas e atendimentos ficam. **Reativar** desfaz.
- **Registro** (`usuarios_registro`, só acrescenta; chefe/gerente leem): quem fez, em quem, antes,
  depois, quando.

## Pessoa de teste (`equipe.teste`, migration `equipe_teste_coluna`)

Conta "Teste" (familiastefann@gmail.com, 10/10/2026): vendedor, `app_metadata.teste = true`,
`equipe.teste = true`, sem UTM e sem atendente. Fica fora dos horários fixos, do "Online agora" e
dos cards dos outros no Check-in (ela vê os próprios), e o check-in/pausa dela não gera nenhum aviso
(descoberta/coberta, pausa longa, sem check-in, pausa). Vendas e Funil já a ignoram (sem UTM nem
atendente). Aparece com a etiqueta "teste" em Usuários e em Pessoas.

Testado em 10/10 com cliques de verdade e usuários temporários (gerente, chefe, vendedor,
convidado, clone da conta de teste), apagados no fim.
