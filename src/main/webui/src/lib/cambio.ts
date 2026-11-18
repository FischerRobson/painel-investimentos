// Cotações de moedas (/api/fx, AwesomeAPI): cotação de compra em reais e histórico diário.
import { useQuery } from "@tanstack/react-query";
import { brl } from "./formato";
import { ErroApi, getJson } from "./api";

export const FX_CODES = ["USD", "EUR", "GBP", "ARS", "JPY"] as const;
export const FX_SYM: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£", ARS: "AR$", JPY: "¥" };

export type Cotacao = { bid: number; low: number; high: number; pct: number; name: string; time: number };
export type Cambio = { quotes: Record<string, Cotacao | undefined>; history: Record<string, [number, number][] | undefined>; fetchedAt: number; stale?: boolean };

export function useCambio(dias: number) {
  return useQuery({
    queryKey: ["fx", dias],
    queryFn: () => getJson<Cambio>(`/api/fx?days=${dias}`),
    placeholderData: prev => prev, // ao trocar o período, mostra o anterior até chegar o novo
  });
}

export const erroCambio = (e: unknown) => e instanceof ErroApi ? e.message : "Não consegui as cotações das moedas agora.";

// Valor em outra moeda: "US$ 18,45", "¥ 1.234"
export const moneyC = (v: number | null | undefined, c = "BRL") =>
  v == null ? "—" : (FX_SYM[c] || c) + " " + brl(v, c === "JPY" || c === "ARS" ? 0 : 2);

// Casas decimais da cotação: moedas baratas (iene, peso) precisam de mais
export const fxDec = (fx: Cambio, c: string) => (fx.quotes[c]?.bid ?? 1) < 0.1 ? 5 : 4;
