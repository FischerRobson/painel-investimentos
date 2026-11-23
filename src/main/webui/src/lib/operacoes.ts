// Operações e proventos ficam no documento da carteira (/api/carteira: operacoes e proventos). Toda mudança nas operações
// recalcula, na mesma gravação, a quantidade dos ativos que têm operações (acoesFiis e cripto), então a foto diária e a
// página Carteira continuam lendo as quantidades de sempre. Ativos sem operações ficam como estão.
import { carteiraStore, useCarteira, type DocCarteira } from "./carteira";
import { quantidadesDaCarteira, type Operacao, type Provento } from "../motor";

type Pos = { t: string; q: number };

export function comOperacoes(doc: DocCarteira, operacoes: Operacao[]): DocCarteira {
  const antes = new Set((doc.operacoes ?? []).map(o => o.ativo));
  const { acoesFiis, cripto } = quantidadesDaCarteira(operacoes);
  const comOps = new Set(operacoes.map(o => o.ativo));
  const ajusta = (lista: Pos[], alvo: Record<string, number>) => {
    // ativo que perdeu todas as operações sai da carteira (a quantidade dele vinha das operações)
    const resto = lista.filter(p => !(p.t in alvo) && !(antes.has(p.t) && !comOps.has(p.t)));
    const novos = Object.entries(alvo).filter(([, q]) => q > 0).map(([t, q]) => ({ t, q }));
    // mantém a ordem de antes e põe os novos no fim
    const ordem = lista.map(p => p.t);
    return [...resto, ...novos].sort((a, b) => (ordem.indexOf(a.t) + 1 || 1e9) - (ordem.indexOf(b.t) + 1 || 1e9));
  };
  return {
    ...doc, operacoes,
    acoesFiis: ajusta((doc.acoesFiis ?? []) as Pos[], acoesFiis),
    cripto: ajusta((doc.cripto ?? []) as Pos[], cripto),
  };
}

export const novoIdOp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const operacoesStore = {
  mudar(fn: (ops: Operacao[]) => Operacao[]): void {
    carteiraStore.atualizar(d => comOperacoes(d, fn(d.operacoes ?? [])));
  },
  mudarProventos(fn: (ps: Provento[]) => Provento[]): void {
    carteiraStore.atualizar(d => ({ ...d, proventos: fn(d.proventos ?? []) }));
  },
};

export function useOperacoes() {
  const c = useCarteira();
  return { ...c, operacoes: c.doc?.operacoes ?? [], proventos: c.doc?.proventos ?? [] };
}
