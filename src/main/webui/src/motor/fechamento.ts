// Fechamento do mês: de onde veio a variação do patrimônio investido (aportes, valorização, proventos), quanto da renda foi
// poupado e o que fugiu do padrão. Contas puras: a página busca os dados.
//
// O patrimônio vem das fotos das 18h (historico.json, só investimentos). A janela vai da última foto ANTES do mês até a última
// foto do mês. Os fluxos são os mesmos da rentabilidade sem aportes (fluxosDasOperacoes), com datas depois da primeira foto e
// até a última. A valorização é o que sobra da conta: fim − início − aportes + retiradas. Proventos não entram nas fotos (o
// painel não acompanha o caixa), então o rendimento é valorização + proventos.
import { efetivas, fluxosDasOperacoes, governados, rentabilidade, type Operacao, type Provento } from "./operacoes";
import type { TituloRF } from "./motor";

export type FotoMes = { i: number; takenAt?: string; stale?: { asset: string }[]; missing?: string[] };

export type Janela = { inicio: string; fim: string; datas: string[]; /* não há foto antes do mês */ comecaNoMes: boolean };

export function janelaDoMes(datas: string[], mes: string): Janela | null {
  const ordenadas = [...datas].sort();
  const doMes = ordenadas.filter(d => d.startsWith(mes));
  if (!doMes.length) return null;
  const anterior = ordenadas.filter(d => d < `${mes}-01`).pop();
  const inicio = anterior ?? doMes[0], fim = doMes[doMes.length - 1];
  if (inicio === fim) return null;
  return { inicio, fim, datas: ordenadas.filter(d => d >= inicio && d <= fim), comecaNoMes: !anterior };
}

export type Ponte = Janela & {
  valorInicio: number; valorFim: number; aportes: number; retiradas: number; proventos: number; valorizacao: number;
  rendimento: number; // valorização + proventos
  twr: number | null; // rentabilidade sem aportes (%)
  separavel: boolean; // sem operações lançadas não dá para separar aporte de rendimento
  alertas: string[];
};

const dataBR = (d: string) => d.split("-").reverse().join("/");
const nomes = (xs: string[]) => [...new Set(xs)].slice(0, 5).join(", ") + (new Set(xs).size > 5 ? " e outros" : "");

export function pontePatrimonio({ fotos, mes, operacoes, proventos, rendaFixa = [] }: {
  fotos: Record<string, FotoMes>; mes: string; operacoes: Operacao[]; proventos: Provento[]; rendaFixa?: TituloRF[];
}): Ponte | null {
  const janela = janelaDoMes(Object.keys(fotos), mes);
  if (!janela) return null;
  const { inicio, fim, datas } = janela;
  const naJanela = (d: string) => d > inicio && d <= fim;
  const comOps = governados(operacoes).rf;
  const semOperacao = rendaFixa.filter(t => !comOps.has(t.id)).map(t => ({ data: t.data, aplicado: t.aplicado }));
  const negocios = fluxosDasOperacoes(operacoes, [], semOperacao).filter(f => naJanela(f.data));
  const aportes = negocios.filter(f => f.valor > 0).reduce((s, f) => s + f.valor, 0);
  const retiradas = negocios.filter(f => f.valor < 0).reduce((s, f) => s - f.valor, 0);
  const recebidos = proventos.filter(p => naJanela(p.data)).reduce((s, p) => s + p.valor, 0);
  const valorInicio = fotos[inicio].i, valorFim = fotos[fim].i;
  const valorizacao = valorFim - valorInicio - aportes + retiradas;
  const separavel = operacoes.length > 0;
  const twr = separavel
    ? rentabilidade(datas.map(d => ({ data: d, valor: fotos[d].i })), fluxosDasOperacoes(operacoes, proventos, semOperacao)).total
    : null;

  const alertas: string[] = [];
  // Operação registrada depois da foto que já deveria contê-la (ou que ficou de fora dela) distorce o rendimento
  const antes = Date.parse(fotos[inicio].takenAt ?? ""), depois = Date.parse(fotos[fim].takenAt ?? "");
  if (!isNaN(antes) && !isNaN(depois)) {
    const validas = efetivas(operacoes).filter(o => ["compra", "venda", "aplicacao", "resgate"].includes(o.tipo) && o.registrado);
    const entre = (o: Operacao) => Date.parse(o.registrado!) > antes && Date.parse(o.registrado!) <= depois;
    const iniciais = validas.filter(o => o.tipo === "compra" && o.inicial && entre(o));
    if (iniciais.length) alertas.push(`Saldo inicial lançado neste período (${nomes(iniciais.map(o => o.ativo))}). Se o ativo ainda não aparecia no painel, o valor dele entrou como valorização.`);
    const retroativas = validas.filter(o => !(o.tipo === "compra" && o.inicial) && o.data <= inicio && entre(o));
    if (retroativas.length) alertas.push(`Operações com data até ${dataBR(inicio)} lançadas depois da foto desse dia (${nomes(retroativas.map(o => o.ativo))}). Se elas mudaram a carteira, a diferença aparece como valorização.`);
    const tardias = validas.filter(o => naJanela(o.data) && Date.parse(o.registrado!) > depois);
    if (tardias.length) alertas.push(`Operações do período lançadas depois da foto de ${dataBR(fim)} (${nomes(tardias.map(o => o.ativo))}): elas entram na conta de aportes, mas ainda não estão no valor final.`);
  }
  for (const d of [inicio, fim]) {
    const f = fotos[d], falhas = [...(f.stale ?? []).map(s => s.asset), ...(f.missing ?? [])];
    if (falhas.length) alertas.push(`Na foto de ${dataBR(d)} faltou a cotação de ${nomes(falhas)}: o valor desse dia é aproximado.`);
  }

  return { ...janela, valorInicio, valorFim, aportes, retiradas, proventos: recebidos, valorizacao, rendimento: valorizacao + recebidos, twr, separavel, alertas };
}

// ---------- Quem mais puxou o mês ----------
export type DiaDePosicoes = { date: string; positions: { key: string; asset: string; pnl: number | null }[] };
export type Contribuicao = { key: string; ativo: string; pnl: number };
// Soma o PnL diário (só variação de preço) de cada ativo
export function contribuicoes(dias: DiaDePosicoes[]): { altas: Contribuicao[]; baixas: Contribuicao[] } {
  const mapa = new Map<string, Contribuicao>();
  for (const d of dias) {
    for (const l of d.positions) {
      if (l.pnl == null) continue;
      const c = mapa.get(l.key) ?? { key: l.key, ativo: l.asset, pnl: 0 };
      c.pnl += l.pnl;
      mapa.set(l.key, c);
    }
  }
  const todos = [...mapa.values()];
  return {
    altas: todos.filter(c => c.pnl >= 0.005).sort((a, b) => b.pnl - a.pnl).slice(0, 5),
    baixas: todos.filter(c => c.pnl <= -0.005).sort((a, b) => a.pnl - b.pnl).slice(0, 5),
  };
}

// ---------- Poupança e gastos ----------
export type MesOrcamento = { month: string; income: number; expenses: number; areas?: Record<string, number> };
export const MESES_DE_COMPARACAO = 6;
// Área acima do padrão: pelo menos 20% e R$ 100 acima da média
export const ACIMA_PCT = 0.20, ACIMA_MIN = 100;

export type AreaNoMes = { area: string; gasto: number; media: number | null; acima: boolean };
export type Poupanca = {
  renda: number; despesas: number; sobra: number; taxa: number | null; // sobra ÷ renda (%)
  comparacao: { meses: number; despesas: number; taxa: number | null } | null;
  serie: { mes: string; taxa: number | null; sobra: number }[];
  areas: AreaNoMes[];
};

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const taxaDe = (renda: number, despesas: number) => renda > 0 ? (renda - despesas) / renda * 100 : null;

export function poupancaDoMes(resumos: MesOrcamento[], mes: string): Poupanca {
  const atual = resumos.find(r => r.month === mes) ?? { month: mes, income: 0, expenses: 0, areas: {} };
  const anteriores = resumos.filter(r => r.month < mes && (r.income > 0 || r.expenses > 0)).sort((a, b) => a.month.localeCompare(b.month)).slice(-MESES_DE_COMPARACAO);
  // taxa média ponderada: só os meses com renda lançada
  const comRenda = anteriores.filter(r => r.income > 0);
  const comGasto = anteriores.filter(r => r.expenses > 0);
  const comparacao = comGasto.length ? {
    meses: comGasto.length, despesas: media(comGasto.map(r => r.expenses)),
    taxa: taxaDe(comRenda.reduce((s, r) => s + r.income, 0), comRenda.reduce((s, r) => s + r.expenses, 0)),
  } : null;
  const ids = [...new Set([...Object.keys(atual.areas ?? {}), ...comGasto.flatMap(r => Object.keys(r.areas ?? {}))])];
  const areas = ids.map(area => {
    const gasto = atual.areas?.[area] ?? 0;
    const m = comGasto.length ? media(comGasto.map(r => r.areas?.[area] ?? 0)) : null;
    // com um mês só de comparação não há padrão para fugir dele
    const acima = m != null && comGasto.length >= 2 && gasto - m >= ACIMA_MIN && gasto >= m * (1 + ACIMA_PCT);
    return { area, gasto, media: m, acima };
  }).filter(a => a.gasto > 0 || (a.media ?? 0) > 0);
  return {
    renda: atual.income, despesas: atual.expenses, sobra: atual.income - atual.expenses, taxa: taxaDe(atual.income, atual.expenses), comparacao,
    serie: [...anteriores, atual].filter(r => r.income > 0 || r.expenses > 0).map(r => ({ mes: r.month, taxa: taxaDe(r.income, r.expenses), sobra: r.income - r.expenses })),
    areas,
  };
}

// Aporte líquido do mês do calendário, pelas operações (compras e aplicações menos vendas e resgates)
export function investidoNoMes(operacoes: Operacao[], mes: string): number {
  return fluxosDasOperacoes(operacoes, []).filter(f => f.data.startsWith(mes)).reduce((s, f) => s + f.valor, 0);
}
