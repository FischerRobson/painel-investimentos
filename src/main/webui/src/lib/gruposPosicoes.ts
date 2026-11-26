// Posições de um dia separadas por tipo. A foto só diz "stock" para ações, FIIs e ativos do exterior: a divisão vem da classe
// das operações, depois do tipo da cotação de hoje e, por fim, da moeda do ativo.
import type { Classe } from "../motor";
import type { LinhaPosicao } from "./dados";

export type Grupo = { id: string; nome: string; linhas: LinhaPosicao[]; pv: number; ppv: number; pnl: number | null };
const GRUPOS: [string, string][] = [["rf", "Renda fixa"], ["acao", "Ações"], ["fii", "FIIs"], ["etf", "ETFs e BDRs"], ["exterior", "Exterior"], ["cripto", "Cripto"], ["moeda", "Moedas"]];

export function grupoDa(l: LinhaPosicao, classes: Record<string, Classe | undefined>, tipos: Record<string, string | undefined>): string {
  if (l.kind === "fixedIncome") return "rf";
  if (l.kind === "crypto") return "cripto";
  if (l.kind === "fx") return "moeda";
  const classe = classes[l.asset];
  if (classe && classe !== "cripto") return classe === "bdr" ? "etf" : classe;
  if (tipos[l.asset] === "FII") return "fii";
  return l.currency || tipos[l.asset] === "Exterior" ? "exterior" : "acao";
}

export function agrupaPosicoes(linhas: LinhaPosicao[], classes: Record<string, Classe | undefined>, tipos: Record<string, string | undefined>): Grupo[] {
  return GRUPOS.flatMap(([id, nome]) => {
    const g = linhas.filter(l => grupoDa(l, classes, tipos) === id).sort((a, b) => b.pv - a.pv);
    if (!g.length) return [];
    const comPnl = g.filter(l => l.pnl != null);
    return [{ id, nome, linhas: g, pv: g.reduce((s, l) => s + l.pv, 0), ppv: g.reduce((s, l) => s + l.ppv, 0),
      pnl: comPnl.length ? comPnl.reduce((s, l) => s + l.pnl!, 0) : null }];
  });
}
