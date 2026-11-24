// Operações e proventos ficam no documento da carteira (/api/carteira: operacoes e proventos). A carteira só muda por
// operações: lançar acrescenta, estornar acrescenta um estorno (nada é editado ou apagado, o servidor recusa). Cada mudança
// recalcula, na mesma gravação, as listas da carteira (acoesFiis, cripto, rendaFixa e moedas) dos ativos que têm operações,
// então a foto diária e a página Carteira continuam lendo as listas de sempre. Ativos sem operações ficam como estão.
import { carteiraStore, useCarteira, type DocCarteira, type Moeda } from "./carteira";
import {
  estorno, governados, moedasDaCarteira, quantidadesDaCarteira, titulosDaCarteira, valorDaOperacao, valorPresenteAntes,
  type Operacao, type Provento, type TituloRF,
} from "../motor";
import { hojeISO } from "./dados";

type Pos = { t: string; q: number };

// Mantém a ordem de antes, troca o que vem das operações e põe os novos no fim
function junta<T>(lista: T[], chave: (x: T) => string, governado: Set<string>, calculado: Map<string, T>): T[] {
  const out: T[] = [], postos = new Set<string>();
  for (const x of lista) {
    const k = chave(x);
    if (!governado.has(k)) out.push(x);
    else if (calculado.has(k) && !postos.has(k)) { out.push(calculado.get(k)!); postos.add(k); }
  }
  for (const [k, v] of calculado) if (!postos.has(k)) out.push(v);
  return out;
}

export function comOperacoes(doc: DocCarteira, operacoes: Operacao[]): DocCarteira {
  const g = governados(operacoes);
  const { acoesFiis, cripto } = quantidadesDaCarteira(operacoes);
  const pos = (alvo: Record<string, number>) => new Map(Object.entries(alvo).filter(([, q]) => q > 0).map(([t, q]) => [t, { t, q }]));
  return {
    ...doc, operacoes,
    acoesFiis: junta((doc.acoesFiis ?? []) as Pos[], p => p.t, g.rv, pos(acoesFiis)),
    cripto: junta((doc.cripto ?? []) as Pos[], p => p.t, g.rv, pos(cripto)),
    rendaFixa: junta((doc.rendaFixa ?? []) as TituloRF[], t => t.id, g.rf, new Map(titulosDaCarteira(operacoes).map(t => [t.id, t]))),
    moedas: junta((doc.moedas ?? []) as Moeda[], m => m.c, g.moedas, new Map(Object.entries(moedasDaCarteira(operacoes)).map(([c, q]) => [c, { c, q }]))),
  };
}

export const novoIdOp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const arred2 = (v: number) => Math.round(v * 100) / 100;

// Compra e venda guardam o valor em reais e o valor presente da posição (logo antes) se a página não informou
export function completar(o: Operacao, ops: Operacao[]): Operacao {
  if (o.tipo !== "compra" && o.tipo !== "venda") return o;
  return { ...o, valor: o.valor ?? arred2(valorDaOperacao(o)), valorPresente: o.valorPresente ?? (o.inicial ? 0 : valorPresenteAntes(ops, o)) };
}

export const operacoesStore = {
  // Acrescenta operações (na ordem dada; cada uma vê as anteriores para o valor presente)
  lancar(...novas: Operacao[]): void {
    carteiraStore.atualizar(d => {
      let ops = d.operacoes ?? [];
      // registrado aqui é só para a tela: o servidor grava a hora dele
      for (const o of novas) ops = [...ops, { ...completar(o, ops), registrado: new Date().toISOString() }];
      return comOperacoes(d, ops);
    });
  },
  estornar(o: Operacao, motivo?: string): void {
    carteiraStore.atualizar(d => comOperacoes(d, [...(d.operacoes ?? []), { ...estorno(o, { id: novoIdOp(), data: hojeISO(), motivo }), registrado: new Date().toISOString() }]));
  },
  // Converte os títulos antigos (idempotente: olha o documento do momento)
  migrarTitulos(): void {
    const d = carteiraStore.get().doc;
    if (!d || !aplicacoesDosTitulosAntigos(d).length) return;
    carteiraStore.atualizar(doc => comOperacoes(doc, [...(doc.operacoes ?? []), ...aplicacoesDosTitulosAntigos(doc)]));
  },
  mudarProventos(fn: (ps: Provento[]) => Provento[]): void {
    carteiraStore.atualizar(d => ({ ...d, proventos: fn(d.proventos ?? []) }));
  },
};

// Títulos de renda fixa de antes das operações viram uma aplicação (saldo inicial) com os mesmos dados: nada se perde, e
// daí em diante o título só muda por resgate. Devolve as operações a acrescentar (vazio se não há o que migrar).
export function aplicacoesDosTitulosAntigos(doc: DocCarteira): Operacao[] {
  const g = governados(doc.operacoes ?? []);
  return ((doc.rendaFixa ?? []) as TituloRF[])
    .filter(t => !g.rf.has(t.id) && /^[A-Za-z0-9^=\-._]{1,40}$/.test(t.id))
    .map(t => ({
      id: ("rf-" + t.id).slice(0, 40), data: t.data, tipo: "aplicacao", classe: "rf", ativo: t.id, qtd: t.aplicado, valor: t.aplicado,
      valorPresente: 0, inicial: true, obs: "título que já estava na carteira",
      titulo: {
        nome: t.nome, tipo: t.tipo, idx: t.idx, taxa: t.taxa, venc: t.venc || null, isento: !!t.isento,
        instituicao: t.instituicao || null, liquidezDiaria: !!t.liquidezDiaria,
      },
    }));
}

export function useOperacoes() {
  const c = useCarteira();
  return { ...c, operacoes: c.doc?.operacoes ?? [], proventos: c.doc?.proventos ?? [] };
}
