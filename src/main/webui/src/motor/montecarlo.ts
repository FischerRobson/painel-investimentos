// Monte Carlo de inflação e juros: sorteia muitos futuros e mede como pós-fixado, IPCA+ e prefixado se saem em CADA UM deles
// (os mesmos sorteios valem para os três). Sorteio com semente fixa: as mesmas premissas dão sempre o mesmo resultado.
//
// Modelo (anual): inflação e juro real voltam para a média, x(t) = média + persistência × (x(t−1) − média) + choque.
// `desvio` é o quanto a variável costuma se afastar da média no longo prazo. CDI = (1 + juro real) × (1 + inflação) − 1, nunca negativo.
// Limites: choques normais e independentes (não prevê crises), taxa do IPCA+ e do prefixado mantida pelo prazo todo,
// sem marcação a mercado, sem risco de crédito; IR sobre o ganho nominal total pela tabela regressiva do prazo.
import { aliqIR } from "./motor";

export type ProcessoAnual = { hoje: number; media: number; desvio: number; persistencia: number }; // % a.a.; persistência de 0 a 0,99
export type CfgMonteCarlo = {
  inicial: number; aporte: number; /* por mês, corrigido pela inflação */ anos: number; meta?: number | null; /* em reais de hoje */
  inflacao: ProcessoAnual; juroReal: ProcessoAnual;
  pctCdi: number; taxaIpca: number; taxaPre: number;
  simulacoes?: number; semente?: number;
};
export type Estrategia = "pos" | "ipca" | "pre";
export const ESTRATEGIAS: Estrategia[] = ["pos", "ipca", "pre"];
export type Faixa = { p10: number; p50: number; p90: number };
export type ResultadoEstrategia = {
  anos: ({ ano: number } & Faixa)[]; fim: Faixa; // líquido de IR, em reais de hoje
  chanceMeta: number | null; chancePerder: number; /* terminar com menos poder de compra do que aplicou */ chanceMelhor: number;
};

// Gerador com semente (mulberry32) e normal padrão por Box-Muller
export function sorteador(semente: number): () => number {
  let a = semente >>> 0;
  const uniforme = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - uniforme())) * Math.cos(2 * Math.PI * uniforme());
}

export function percentil(ordenado: number[], p: number): number {
  const i = (ordenado.length - 1) * p, base = Math.floor(i);
  return ordenado[base] + (ordenado[Math.min(base + 1, ordenado.length - 1)] - ordenado[base]) * (i - base);
}

const proximo = (x: number, p: ProcessoAnual, choque: number) => {
  const phi = Math.min(0.99, Math.max(0, p.persistencia));
  return p.media + phi * (x - p.media) + Math.max(0, p.desvio) * Math.sqrt(1 - phi * phi) * choque;
};

export function monteCarlo(c: CfgMonteCarlo) {
  const anos = Math.min(50, Math.max(1, Math.round(c.anos))), n = Math.max(1, c.simulacoes ?? 2000);
  const normal = sorteador(c.semente ?? 42);
  const valores = Object.fromEntries(ESTRATEGIAS.map(e => [e, Array.from({ length: anos }, () => new Array<number>(n))])) as Record<Estrategia, number[][]>;
  const inflacaoMedia: number[] = [], cdiMedio: number[] = [];
  const investidoReal = c.inicial + c.aporte * 12 * anos;
  const melhores = { pos: 0, ipca: 0, pre: 0 }, perdas = { pos: 0, ipca: 0, pre: 0 }, metas = { pos: 0, ipca: 0, pre: 0 };
  for (let s = 0; s < n; s++) {
    let inf = c.inflacao.hoje, real = c.juroReal.hoje, preco = 1, somaInf = 0, somaCdi = 0;
    const saldo = { pos: c.inicial, ipca: c.inicial, pre: c.inicial };
    let aportado = c.inicial; // nominal, base do IR
    for (let a = 0; a < anos; a++) {
      inf = proximo(inf, c.inflacao, normal());
      real = proximo(real, c.juroReal, normal());
      const pi = Math.max(-0.02, inf / 100);
      const cdi = Math.max(0, (1 + real / 100) * (1 + pi) - 1);
      somaInf += pi * 100; somaCdi += cdi * 100;
      const taxas = { pos: cdi * c.pctCdi / 100, ipca: (1 + pi) * (1 + c.taxaIpca / 100) - 1, pre: c.taxaPre / 100 };
      const r = { pos: Math.pow(1 + taxas.pos, 1 / 12) - 1, ipca: Math.pow(1 + taxas.ipca, 1 / 12) - 1, pre: Math.pow(1 + taxas.pre, 1 / 12) - 1 };
      const piMes = Math.pow(1 + pi, 1 / 12);
      for (let m = 0; m < 12; m++) {
        preco *= piMes;
        const ap = c.aporte * preco;
        aportado += ap;
        for (const e of ESTRATEGIAS) saldo[e] = saldo[e] * (1 + r[e]) + ap;
      }
      const ir = aliqIR((a + 1) * 365);
      for (const e of ESTRATEGIAS) valores[e][a][s] = (saldo[e] - Math.max(0, saldo[e] - aportado) * ir) / preco;
    }
    inflacaoMedia.push(somaInf / anos); cdiMedio.push(somaCdi / anos);
    const finais = ESTRATEGIAS.map(e => valores[e][anos - 1][s]), max = Math.max(...finais);
    ESTRATEGIAS.forEach((e, k) => {
      if (finais[k] === max) melhores[e]++;
      if (finais[k] < investidoReal - 0.005) perdas[e]++;
      if (c.meta && finais[k] >= c.meta) metas[e]++;
    });
  }
  const faixa = (v: number[]): Faixa => { const o = [...v].sort((a, b) => a - b); return { p10: percentil(o, 0.1), p50: percentil(o, 0.5), p90: percentil(o, 0.9) }; };
  const estrategias = Object.fromEntries(ESTRATEGIAS.map(e => {
    const porAno = valores[e].map((v, a) => ({ ano: a + 1, ...faixa(v) }));
    const { p10, p50, p90 } = porAno[anos - 1];
    return [e, { anos: porAno, fim: { p10, p50, p90 }, chanceMeta: c.meta ? metas[e] / n : null, chancePerder: perdas[e] / n, chanceMelhor: melhores[e] / n }];
  })) as Record<Estrategia, ResultadoEstrategia>;
  return { anos, simulacoes: n, investidoReal, estrategias, inflacao: faixa(inflacaoMedia), cdi: faixa(cdiMedio) };
}
