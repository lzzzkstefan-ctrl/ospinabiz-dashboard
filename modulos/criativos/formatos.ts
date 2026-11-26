// Formato fixo da resposta de cada modo (JSON). O mesmo schema vai pra IA (structured outputs) e confere a
// resposta antes de salvar em criativo_geracoes.saida. As telas usam só os tipos (`import type`).

import * as z from "zod";

// função (não constante): cada campo é um schema novo, senão o conversor junta tudo numa referência e perde a descrição
const txt = (descricao?: string) => (descricao ? z.string().min(1).describe(descricao) : z.string().min(1));

export const HookSchema = z.object({ hook: txt(), subhook: txt(), angulo: txt() });

export const VariacoesSchema = z.object({
  diagnostico: txt("Em até 3 linhas: por que esse criativo deve estar funcionando."),
  hooks: z.array(HookSchema).min(1).describe("10 pares de hook + subhook novos, de pelo menos 4 ângulos diferentes."),
  matriz_visual: z
    .array(z.object({ roupa: txt(), acessorio: txt(), cenario: txt(), enquadramento: txt(), legenda: txt(), primeiro_frame: txt() }))
    .min(1)
    .describe("As 6 combinações visuais que mais mudam a cara do anúncio."),
  lista_gravacao: z.array(txt()).min(1).describe("Passos em ordem pra gravar tudo numa sessão de 30 minutos."),
});

export const IdeiasSchema = z.object({
  ideias: z
    .array(z.object({ titulo: txt(), angulo: txt(), conceito: txt(), hook: txt(), subhook: txt(), formato: txt(), por_que: txt() }))
    .min(1)
    .describe("5 ideias com ângulos diferentes."),
});

export const RoteiroSchema = z.object({
  nome: txt(),
  angulo: txt(),
  formato: txt(),
  duracao_seg: z.number().int(),
  hook: txt(),
  hooks_alternativos: z.array(txt()).describe("2 hooks alternativos."),
  subhook: txt(),
  roteiro: txt("As falas na ordem, com as instruções de gravação (entre parênteses e em negrito)."),
  cta: txt(),
});

export const OrganicoSchema = z.object({
  hook: txt("Hook novo pros primeiros 2 segundos no Instagram."),
  hooks_alternativos: z.array(txt()).describe("3 variações do hook."),
  cta: txt("CTA de orgânico: comenta X, DM ou link na bio."),
  como_cortar: txt("Como cortar o criativo pra 30 a 45 segundos."),
  legenda: txt("Legenda curta do post."),
});

export const AnaliseSchema = z.object({
  hook: txt(),
  subhook: txt(),
  angulo: txt(),
  promessa: txt(),
  estrutura: txt("A estrutura do corpo, em passos."),
  formato: txt(),
  por_que_escala: txt(),
  adaptacao: txt("O que dá pra adaptar pro GCS mantendo a essência, sem copiar texto, marca ou personagem."),
  hooks_nossos: z.array(HookSchema).min(1).describe("3 hooks nossos inspirados no ângulo dele."),
});

export const SepararSchema = z.object({
  titulo: txt("Nome curto pra achar o criativo na lista."),
  hook: txt(),
  subhook: z.string(),
  corpo: txt(),
  cta: z.string(),
  angulo: txt(),
  por_que_funciona: txt(),
});

export type Hook = z.infer<typeof HookSchema>;
export type Variacoes = z.infer<typeof VariacoesSchema>;
export type Ideias = z.infer<typeof IdeiasSchema>;
export type Roteiro = z.infer<typeof RoteiroSchema>;
export type Organico = z.infer<typeof OrganicoSchema>;
export type Analise = z.infer<typeof AnaliseSchema>;
export type Separar = z.infer<typeof SepararSchema>;

export type SaidaPorModo = {
  variacoes: Variacoes;
  ideias: Ideias;
  roteiro: Roteiro;
  organico: Organico;
  analise_referencia: Analise;
  separar: Separar;
};
