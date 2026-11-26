// Cotações de moedas (/api/fx): cotação de compra em reais e histórico diário. Fonte: AwesomeAPI; quando ela limita as
// chamadas, a taxa de referência do BCE (source "bce"); se as duas caem, a última resposta boa (stale = quando foi buscada).
import { useQuery } from "@tanstack/react-query";
import { brl } from "./formato";
import { ErroApi, getJson } from "./api";

export const FX_CODES = ["USD", "EUR", "GBP", "ARS", "JPY"] as const;
export const FX_SYM: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€", GBP: "£", ARS: "AR$", JPY: "¥" };

export type Cotacao = { bid: number; low: number; high: number; pct: number; name: string; time: number };
export type Cambio = { quotes: Record<string, Cotacao | undefined>; history: Record<string, [number, number][] | undefined>; source?: "bce"; stale?: string };

export function useCambio(dias: number, ativo = true) {
  return useQuery({
    queryKey: ["fx", dias],
    enabled: ativo,
    queryFn: () => getJson<Cambio>(`/api/fx?days=${dias}`),
    placeholderData: prev => prev, // ao trocar o período, mostra o anterior até chegar o novo
  });
}

// Aviso para quando a cotação não é a comercial do momento
export const avisoCambio = (fx: Cambio) =>
  fx.stale ? `Fontes de câmbio fora do ar: cotações de ${fx.stale}.`
    : fx.source === "bce" ? "AwesomeAPI limitou as consultas agora: cotação de referência do Banco Central Europeu (fechamento do dia útil)." : null;

export const erroCambio = (e: unknown) => e instanceof ErroApi ? e.message : "Não consegui as cotações das moedas agora.";

// Valor em outra moeda: "US$ 18,45", "¥ 1.234"
export const moneyC = (v: number | null | undefined, c = "BRL") =>
  v == null ? "—" : (FX_SYM[c] || c) + " " + brl(v, c === "JPY" || c === "ARS" ? 0 : 2);

// Casas decimais da cotação: moedas baratas (iene, peso) precisam de mais
export const fxDec = (fx: Cambio, c: string) => (fx.quotes[c]?.bid ?? 1) < 0.1 ? 5 : 4;
