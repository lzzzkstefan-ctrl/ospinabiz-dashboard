// Cor fixa por pessoa (pelo id da equipe), das cores de etiqueta do tema: Davi azul, Rodrigo verde,
// Vyenna roxo. Usada nos cards da semana e nos compromissos previstos.
const CORES = ["--tag-azul", "--tag-verde", "--tag-roxo", "--tag-laranja", "--tag-vermelho"];
export const corDaPessoa = (equipeId: number) => CORES[(Math.max(1, equipeId) - 1) % CORES.length];
