// Carteira × CDI, Ibovespa e IFIX (/api/benchmarks): como a composição de HOJE (cada ativo pesando pelo valor atual) teria se
// saído no período. Bens ficam de fora; compras, vendas e aportes não entram.
import type { Composicao, ItemAtivo } from "./composicao";

type Serie = [number, number][];
export type Benchmarks = {
  indices?: Record<string, Serie | undefined>;
  fx?: Record<string, Serie | undefined>;
  crypto?: Record<string, Serie | undefined>;
  ipca?: [string, number][];
  warnings?: string[];
};
export type ChaveSerie = "carteira" | "CDI" | "IBOV" | "IFIX";
export type Comparativo = {
  series: Record<ChaveSerie, Serie>;
  ret: Record<ChaveSerie, number | null>;
  fora: string[]; avisos: string[]; vazia: boolean;
};

// Valor da série no instante t: o último ponto até t (ou o primeiro, se t vier antes da série)
export function valorEm(serie: Serie, t: number): number {
  let lo = 0, hi = serie.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (serie[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return serie[ans][1];
}
const multiplica = (a: Serie, b: Serie): Serie => a.map(([t, v]) => [t, v * valorEm(b, t)]);
// Cada fonte marca o dia num horário diferente (Yahoo B3 13h, EUA 13h30, cripto 0h, CDI 21h UTC):
// todos os pontos passam a valer como "fim daquele dia", para comparar dia com dia.
const fimDoDia = (t: number) => Math.floor(t / 864e5) * 864e5 + 864e5 - 1;
const porDia = (s: Serie | undefined): Serie => (s || []).map(([t, v]) => [fimDoDia(t), v]);

// Moedas, ações do exterior e criptos que o /api/benchmarks precisa trazer
export function pedidoComparativo(c: Composicao) {
  const exterior = c.rv.filter(r => r.value && r.cur && r.cur !== "BRL").map(r => r.cur);
  return {
    fx: [...new Set([...c.mo.filter(m => m.value).map(m => m.c), ...exterior])],
    coins: c.cr.filter(x => x.value).map(x => x.t),
    tickers: c.rv.filter(r => r.value).map(r => r.t),
  };
}

export function calcularComparativo(bench: Benchmarks, items: ItemAtivo[], c: Composicao): Comparativo {
  const ind = Object.fromEntries(Object.entries(bench.indices || {}).map(([k, s]) => [k, porDia(s)])) as Record<string, Serie | undefined>;
  const cdi = ind.CDI || [];
  const fxDia = Object.fromEntries(Object.entries(bench.fx || {}).map(([k, s]) => [k, porDia(s)])) as Record<string, Serie | undefined>;
  const grade = (cdi.length ? cdi : ind.IBOV || []).map(p => p[0]);
  if (grade.length < 2) throw new Error("sem dados");
  // o CDI de hoje só sai amanhã: o período vai até o dado mais recente das outras séries
  const ultimo = Math.max(...[ind.IBOV, ind.IFIX].filter((s): s is Serie => !!s?.length).map(s => s[s.length - 1][0]));
  if (ultimo > grade[grade.length - 1]) grade.push(ultimo);
  const ativos: { peso: number; serie: Serie }[] = [], fora: string[] = [];

  for (const r of c.rv.filter(r => r.value)) {
    const it = items.find(i => i.ticker === r.t);
    let pts = porDia(it?.points);
    if (pts.length && r.cur && r.cur !== "BRL") pts = fxDia[r.cur] ? multiplica(pts, fxDia[r.cur]!) : [];
    if (pts.length > 1) ativos.push({ peso: r.value!, serie: pts }); else fora.push(r.t);
  }
  for (const x of c.cr.filter(x => x.value)) {
    const s = porDia(bench.crypto?.[x.t]);
    if (s.length > 1) ativos.push({ peso: x.value!, serie: s }); else fora.push(x.t);
  }
  for (const m of c.mo.filter(m => m.value)) {
    const s = fxDia[m.c];
    if (s && s.length > 1) ativos.push({ peso: m.value!, serie: s }); else fora.push(m.c);
  }
  // renda fixa refeita dia a dia com o CDI e o IPCA do período
  const ipcaMes = Object.fromEntries((bench.ipca || []).map(([d, v]) => [d.slice(0, 7), v]));
  for (const r of c.rf.filter(r => r.calc?.liquido)) {
    if (cdi.length < 2) { fora.push(r.nome); continue; }
    const serie: Serie = [[cdi[0][0], 1]];
    let f = 1;
    for (let i = 1; i < cdi.length; i++) {
      const diaCdi = cdi[i][1] / cdi[i - 1][1] - 1;
      if (r.idx === "cdi") f *= 1 + diaCdi * r.taxa / 100;
      else f *= Math.pow(1 + r.taxa / 100, 1 / 252);
      if (r.idx === "ipca") {
        const mes = new Date(cdi[i][0]).toISOString().slice(0, 7), mesAnt = new Date(cdi[i - 1][0]).toISOString().slice(0, 7);
        if (mes !== mesAnt && ipcaMes[mesAnt] != null) f *= 1 + ipcaMes[mesAnt] / 100; // IPCA do mês que terminou
      }
      serie.push([cdi[i][0], f]);
    }
    ativos.push({ peso: r.calc!.liquido, serie });
  }

  const pesoTotal = ativos.reduce((a, x) => a + x.peso, 0);
  const t0 = grade[0];
  const carteira: Serie = pesoTotal
    ? grade.map(t => [t, ativos.reduce((a, x) => a + x.peso * valorEm(x.serie, t) / valorEm(x.serie, t0), 0) / pesoTotal])
    : [];
  const norm = (s: Serie | undefined): Serie => s?.length ? grade.map(t => [t, valorEm(s, t) / valorEm(s, t0)]) : [];
  const series: Record<ChaveSerie, Serie> = { carteira, CDI: norm(cdi), IBOV: norm(ind.IBOV), IFIX: norm(ind.IFIX) };
  const ret = Object.fromEntries(Object.entries(series).map(([k, s]) => [k, s.length ? (s[s.length - 1][1] - 1) * 100 : null])) as Record<ChaveSerie, number | null>;
  return { series, ret, fora, avisos: bench.warnings || [], vazia: !ativos.length };
}
