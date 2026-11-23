// Composição da carteira: o valor de cada ativo e os totais por classe.
// Função pura: recebe o documento da carteira e as cotações já buscadas, e devolve o que a página Carteira mostra.
import { rfCalc, type TaxasBCB, type TituloRF, type ValorRF } from "../motor";
import type { Bem, DocCarteira, Moeda } from "./carteira";
import type { Cambio } from "./cambio";

// Item de /api/data (cotação da brapi, proventos e histórico do Yahoo)
export type ItemAtivo = {
  ticker: string; price?: number | null; change?: number | null; changePct?: number | null;
  currency?: string; type?: string; div12m?: number | null; error?: string; points?: [number, number][];
};
export type PrecoCripto = { price: number; changePct?: number | null };
export type Posicao = { t: string; q: number };

export type LinhaRV = {
  kind: "rv" | "cr"; t: string; q: number; type: string; cur: string; ok: boolean; err?: string;
  price: number | null; value: number | null; dayChg: number | null; div12: number | null;
};
export type LinhaRF = TituloRF & { calc: ValorRF | null };
export type LinhaMoeda = Moeda & { ok: boolean; rate?: number; value: number | null; dayChg: number | null };
export type LinhaBem = Bem & { value: number | null };

export type Composicao = {
  rv: LinhaRV[]; cr: LinhaRV[]; rf: LinhaRF[]; mo: LinhaMoeda[]; bens: LinhaBem[];
  vAcoes: number; vFiis: number; vCripto: number; vRf: number; vFx: number; vBens: number; vExt: number;
  total: number; patrimonio: number; dayTotal: number; dayPct: number | null; div12: number; rfRend: number; rfAplic: number;
  vazia: boolean;
};

const soma = <T,>(arr: T[], f: (x: T) => number | null | undefined) => arr.reduce((a, x) => a + (f(x) || 0), 0);

export function montarComposicao({ doc, ativos, cripto, fx, rates, hoje, valorBem }: {
  doc: DocCarteira;
  ativos: Record<string, ItemAtivo>;
  cripto: Record<string, PrecoCripto | undefined>;
  fx: Cambio | null | undefined;
  rates: TaxasBCB | null;
  hoje: string;
  valorBem: (b: Bem) => number | null;
}): Composicao {
  const acoes = (doc.acoesFiis ?? []) as Posicao[], criptoW = (doc.cripto ?? []) as Posicao[];
  const rfW = (doc.rendaFixa ?? []) as TituloRF[], moedasW = doc.moedas ?? [], bensW = doc.bens ?? [];
  const fxRate = (c: string) => !c || c === "BRL" ? 1 : fx?.quotes?.[c]?.bid ?? null;

  // Ações e FIIs (ações do exterior convertidas para reais)
  const rv: LinhaRV[] = acoes.map(w => {
    const it = ativos[w.t];
    const cur = it?.currency || "BRL", rate = fxRate(cur);
    const ok = !!it && !it.error && it.price != null && rate != null;
    const price = it && !it.error ? it.price ?? null : null;
    const chg = !ok ? null : it.change != null ? it.change : it.changePct != null ? price! - price! / (1 + it.changePct / 100) : null;
    return {
      kind: "rv", t: w.t, q: w.q, type: it?.type || "", cur, ok, err: it?.error, price,
      value: ok ? w.q * price! * rate! : null, dayChg: chg != null ? chg * w.q * rate! : null,
      div12: ok ? (it.div12m || 0) * w.q * rate! : null,
    };
  });
  const cr: LinhaRV[] = criptoW.map(c => {
    const p = cripto[c.t];
    const chg = p && p.changePct != null ? p.price - p.price / (1 + p.changePct / 100) : null;
    return {
      kind: "cr", t: c.t, q: c.q, type: "Cripto", cur: "BRL", ok: !!p, price: p?.price ?? null,
      value: p ? c.q * p.price : null, dayChg: chg != null ? chg * c.q : null, div12: null,
    };
  });
  const rf: LinhaRF[] = rfW.map(e => ({ ...e, calc: rates ? rfCalc(e, rates, hoje) : null }));
  const mo: LinhaMoeda[] = moedasW.map(m => {
    const q = fx?.quotes?.[m.c], value = q ? m.q * q.bid : null;
    return { ...m, ok: !!q, rate: q?.bid, value, dayChg: q && value != null ? value - value / (1 + q.pct / 100) : null };
  });
  const bens: LinhaBem[] = bensW.map(b => ({ ...b, value: valorBem(b) }));

  const vAcoes = soma(rv.filter(r => r.type !== "FII"), r => r.value);
  const vFiis = soma(rv.filter(r => r.type === "FII"), r => r.value);
  const vCripto = soma(cr, r => r.value);
  const vRf = soma(rf, r => r.calc?.liquido);
  const vFx = soma(mo, r => r.value);
  const vBens = soma(bens, r => r.value);
  const vExt = soma(rv.filter(r => r.type === "Exterior"), r => r.value);
  const total = vAcoes + vFiis + vCripto + vRf + vFx; // investimentos
  const dayTotal = soma<LinhaRV | LinhaMoeda>([...rv, ...cr, ...mo], r => r.dayChg);
  const varBase = vAcoes + vFiis + vCripto + vFx - dayTotal;
  return {
    rv, cr, rf, mo, bens, vAcoes, vFiis, vCripto, vRf, vFx, vBens, vExt, total, patrimonio: total + vBens,
    dayTotal, dayPct: varBase ? dayTotal / varBase * 100 : null,
    div12: soma(rv, r => r.div12),
    rfRend: soma(rf, r => r.calc ? r.calc.liquido - r.aplicado : 0),
    rfAplic: soma(rf, r => r.aplicado),
    vazia: !acoes.length && !criptoW.length && !rfW.length && !moedasW.length && !bensW.length,
  };
}
