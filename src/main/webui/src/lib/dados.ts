// Dados compartilhados pelas ferramentas: taxas do BCB para a renda fixa da carteira, Termômetro (IPCA, Selic, CDI e Focus),
// histórico do patrimônio e orçamento.
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getJson } from "./api";
import { useCarteira } from "./carteira";
import { acumulado12, cenarioFocus, currentRates, type LinhaFocus, type ModoCenario, type TaxasBCB, type Tesouro, type TituloRF } from "../motor";

export const hojeISO = (): string => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
export const isoBR = (d?: string | null): string => d ? d.split("-").reverse().join("/") : "—";

// ---------- Renda fixa da carteira e taxas do BCB (/api/rates) ----------
type RespostaTaxas = TaxasBCB & { stale?: string; error?: string };

// Títulos da carteira e as séries do BCB desde a aplicação mais antiga. Sem títulos, não há taxas.
export function useRendaFixa() {
  const carteira = useCarteira();
  const titulos = (carteira.doc?.rendaFixa ?? []) as TituloRF[];
  const desde = titulos.map(e => e.data).sort()[0] ?? null;
  const q = useQuery({
    queryKey: ["rates", desde],
    enabled: !!desde,
    queryFn: async () => {
      // O backend responde 200 com {error} quando o BCB falha e não há cópia salva
      const j = await (await apiFetch(`/api/rates?from=${desde}`)).json() as RespostaTaxas;
      if (j.error) throw new Error(j.error + " Tentando de novo em 1 minuto.");
      return j;
    },
    retry: false,
    refetchInterval: q => q.state.status === "error" ? 60_000 : false,
  });
  const rates = q.data ?? null;
  const ratesErr = q.error ? q.error.message
    : rates?.stale ? `Banco Central fora do ar agora: usando as taxas salvas em ${rates.stale}.` : null;
  return {
    carregada: !!carteira.doc, erroCarteira: carteira.erro, titulos, rates, ratesErr,
    atuais: rates ? currentRates(rates) : null, // CDI e IPCA atuais (% a.a.); null sem renda fixa
  };
}

// ---------- Termômetro (/api/termometro) ----------
export type Termometro = {
  ipca: [string, number][]; selic?: [string, number][]; cdi?: [string, number][];
  focus?: LinhaFocus[]; focusData?: string; focusErro?: string;
};

export function useTermometro() {
  return useQuery({
    queryKey: ["termometro"],
    queryFn: async () => {
      let j: Termometro & { error?: string };
      try { j = await (await apiFetch("/api/termometro")).json(); }
      catch { throw new Error("Não consegui os dados do Banco Central agora."); }
      if (j.error) throw new Error(j.error);
      return j as Termometro;
    },
    staleTime: Infinity, // o servidor guarda por 6 h; na página vale a primeira resposta
    retry: false,
  });
}

// ---------- Tesouro Direto (/api/tesouro) ----------
// Taxas e preços do último dia publicado pelo Tesouro (sai com alguns dias de atraso). Se falhar, as ferramentas seguem com
// as taxas digitadas: o erro só esconde os botões.
export function useTesouro() {
  return useQuery({
    queryKey: ["tesouro"],
    queryFn: async () => {
      const j = await (await apiFetch("/api/tesouro")).json() as Tesouro & { error?: string };
      if (j.error) throw new Error(j.error);
      return j as Tesouro;
    },
    staleTime: Infinity, // o servidor guarda por 6 h
    retry: false,
  });
}

// Cenário de Selic e IPCA médios: Focus quando disponível; senão, o último dado realizado
export function cenarioDoTermometro(t: Termometro | undefined, anos: number, modo: ModoCenario) {
  if (t?.focus?.length) return { ...cenarioFocus(t.focus, new Date().getFullYear(), anos, modo), semFocus: false };
  return {
    selic: t?.selic?.at(-1)?.[1] ?? null,
    ipca: t?.ipca ? acumulado12(t.ipca.map(([date, value]) => ({ date, value }))).at(-1)?.value ?? null : null,
    semFocus: true,
  };
}

// ---------- Histórico do patrimônio (/api/historico) ----------
export type FotoPatrimonio = { t: number; i: number; [k: string]: number };
export function useHistorico() {
  return useQuery({ queryKey: ["historico"], queryFn: () => getJson<Record<string, FotoPatrimonio>>("/api/historico") });
}

// ---------- Posições do dia (/api/positions) ----------
// Montadas pela foto das 18h nos dias de pregão da B3. pnl = quantidade do dia anterior × variação do preço (null sem preço).
export type TipoPosicao = "stock" | "crypto" | "fx" | "fixedIncome";
export type LinhaPosicao = {
  kind: TipoPosicao; key: string; asset: string; notional: number; price: number; pv: number; ppv: number; pnl: number | null;
  currency?: string; gross?: number; taxRate?: number; staleSince?: string; missing?: boolean;
};
export type DiaPosicoes = { date: string; previousDate?: string; takenAt: string; positions: LinhaPosicao[]; totals: { pv: number; ppv: number; pnl: number } };

// Dias com posições salvas (do mais antigo ao mais recente)
export function useDatasPosicoes() {
  return useQuery({ queryKey: ["positions"], queryFn: () => getJson<string[]>("/api/positions") });
}

export function usePosicoes(data: string | null | undefined) {
  return useQuery({
    queryKey: ["positions", data], enabled: !!data, retry: false, staleTime: Infinity, // um dia salvo não muda
    queryFn: () => getJson<DiaPosicoes>(`/api/positions/${data}`),
  });
}

// ---------- Datas para tabelas ----------
// "2 anos e 3 meses"; "mai. de 2027" (m meses a partir de hoje)
export const fmtPrazo = (m: number): string => {
  const a = Math.floor(m / 12), mm = m % 12;
  return [a ? `${a} ano${a > 1 ? "s" : ""}` : "", mm ? `${mm} ${mm > 1 ? "meses" : "mês"}` : ""].filter(Boolean).join(" e ") || "agora";
};
export const mesAno = (m: number): string => {
  const d = new Date(); d.setMonth(d.getMonth() + m);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
};
