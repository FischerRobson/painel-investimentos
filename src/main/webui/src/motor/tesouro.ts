// Títulos do Tesouro Direto (/api/tesouro, CSV oficial do Tesouro Transparente): qual título usar como referência de taxa.
export type TituloTesouro = {
  tipo: string; vencimento: string; indexador: "selic" | "ipca" | "pre" | "igpm"; jurosSemestrais: boolean;
  taxaCompra: number | null; taxaVenda: number | null; puCompra: number | null; puVenda: number | null; puBase: number | null;
};
export type Tesouro = { data: string; titulos: TituloTesouro[]; stale?: string };

const dia = (iso: string) => new Date(iso + "T12:00:00").getTime();

// Data AAAA-MM-DD daqui a `anos` anos (fração em meses)
export function daquiAnos(hoje: string, anos: number): string {
  const d = new Date(hoje + "T12:00:00");
  d.setMonth(d.getMonth() + Math.round(anos * 12));
  return d.toLocaleDateString("sv-SE");
}

// O título do tipo pedido com vencimento mais perto do alvo. Só os que vencem depois da data base e têm a taxa do lado
// pedido: "compra" é a taxa para quem aplica; "venda", a de quem resgata antes do vencimento (é a que vale na marcação).
export function tesouroMaisProximo(t: Tesouro | null | undefined, tipo: string, alvo: string, lado: "compra" | "venda" = "compra"): TituloTesouro | null {
  if (!t) return null;
  const taxa = (x: TituloTesouro) => lado === "compra" ? x.taxaCompra : x.taxaVenda;
  let melhor: TituloTesouro | null = null, dist = Infinity;
  for (const x of t.titulos) {
    const tx = taxa(x);
    if (x.tipo !== tipo || x.vencimento <= t.data || tx == null || !(tx > 0)) continue;
    const d = Math.abs(dia(x.vencimento) - dia(alvo));
    if (d < dist) { melhor = x; dist = d; }
  }
  return melhor;
}
