// Formatação em pt-BR (números, dinheiro, porcentagem, valores grandes e datas).

export const brl = (v: number | null | undefined, d = 2): string =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const money = (v: number | null | undefined): string => v == null ? "—" : "R$ " + brl(v);

export const pct = (v: number | null | undefined, d = 2): string =>
  v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + brl(v, d) + "%";

// Valores grandes abreviados: 1,23 mi, 4,5 mil
export function big(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return brl(v / 1e12, 2) + " tri";
  if (a >= 1e9) return brl(v / 1e9, 2) + " bi";
  if (a >= 1e6) return brl(v / 1e6, 2) + " mi";
  if (a >= 1e3) return brl(v / 1e3, 1) + " mil";
  return brl(v, 0);
}

export const fmtDate = (ms: number, comAno = true): string =>
  new Date(ms).toLocaleDateString("pt-BR", comAno ? { day: "2-digit", month: "2-digit", year: "2-digit" } : { day: "2-digit", month: "short" });

export const signCls = (v: number): "up" | "down" | "muted" => v > 0 ? "up" : v < 0 ? "down" : "muted";
export const arrow = (v: number): string => v > 0 ? "▲" : v < 0 ? "▼" : "•";

// Fundamentus usa 0 quando não tem o dado
export const nz = (v: number | null | undefined): number | null => v == null || v === 0 ? null : v;
