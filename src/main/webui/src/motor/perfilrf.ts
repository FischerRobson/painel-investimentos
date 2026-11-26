// Liquidez e risco de crédito de um produto de renda fixa, para ordenar o comparador além do retorno.
// Notas menores são melhores. Classificação simples (regras do AUVP): o Tesouro é risco soberano; CDB, LCI e LCA têm o FGC
// até R$ 250 mil por instituição; o "outro" (debênture, CRI, CRA, LC...) é crédito privado sem FGC.

export type NivelLiquidez = 0 | 1 | 2;
export type NivelRisco = 0 | 1 | 2;

export const TESOURO = (tipo: string) => tipo.startsWith("Tesouro");
export const FGC = (tipo: string) => ["CDB", "LCI", "LCA"].includes(tipo);
export const LIMITE_FGC = 250000;

/** 0 = resgate a qualquer dia sem perda; 1 = resgate a qualquer dia, mas pelo preço de mercado; 2 = só no vencimento. */
export function liquidezRF(p: { tipo: string; liquidezDiaria?: boolean }): NivelLiquidez {
  if (p.tipo === "Tesouro Selic") return 0;
  if (TESOURO(p.tipo)) return 1; // o Tesouro recompra todo dia útil, pela marcação a mercado
  if (FGC(p.tipo) && p.liquidezDiaria) return 0;
  return 2;
}

/** 0 = soberano (Tesouro); 1 = coberto pelo FGC; 2 = sem garantia (crédito privado, ou FGC acima do limite). */
export function riscoRF(p: { tipo: string }, valor: number): NivelRisco {
  if (TESOURO(p.tipo)) return 0;
  if (FGC(p.tipo)) return valor <= LIMITE_FGC ? 1 : 2;
  return 2;
}

export const LIQUIDEZ_TXT: Record<NivelLiquidez, string> = { 0: "diária", 1: "diária, a preço de mercado", 2: "no vencimento" };
export const RISCO_TXT: Record<NivelRisco, string> = { 0: "Tesouro (soberano)", 1: "banco, com FGC", 2: "sem FGC" };

export type OrdemRF = "liquido" | "real" | "liquidez" | "risco";

/** Ordena os resultados: pelo critério escolhido e, no empate, pelo maior líquido. */
export function ordenarRF<R extends { tipo: string; liquidezDiaria?: boolean; liquido: number | null; real: number | null }>(
  rs: R[], ordem: OrdemRF, valor: number): R[] {
  const liq = (r: R) => r.liquido ?? -Infinity;
  const chave = (r: R) => ordem === "liquidez" ? liquidezRF(r) : ordem === "risco" ? riscoRF(r, valor) : 0;
  return [...rs].sort((a, b) => ordem === "real" ? (b.real ?? -Infinity) - (a.real ?? -Infinity)
    : chave(a) - chave(b) || liq(b) - liq(a));
}
