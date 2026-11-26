// Históricos da carteira e do mercado num período (/api/benchmarks e /api/data) e as séries calculadas.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "./api";
import { calcularComparativo, pedidoComparativo, type Benchmarks, type Comparativo } from "./comparativo";
import type { Composicao, ItemAtivo } from "./composicao";

const ERRO = "Não consegui carregar os dados de comparação agora.";

// itensProntos: cotações do mesmo período que a página já tem; sem eles, busca em /api/data
export function useComparativo(c: Composicao, range: string, ativo: boolean, itensProntos?: ItemAtivo[]) {
  const { fx, coins, tickers } = pedidoComparativo(c);
  const q = useQuery({
    queryKey: ["comparativo", range, fx.join(","), coins.join(","), tickers.join(","), itensProntos ? "sem-dados" : "com-dados"],
    enabled: ativo,
    staleTime: Infinity, // busca uma vez por período, até recarregar a página
    retry: false,
    queryFn: async () => {
      const [bench, dados] = await Promise.all([
        getJson<Benchmarks>(`/api/benchmarks?range=${range}&fx=${fx.join(",")}&crypto=${coins.join(",")}`),
        !itensProntos && tickers.length ? getJson<{ items?: ItemAtivo[] }>(`/api/data?range=${range}&symbols=${encodeURIComponent(tickers.join(","))}`) : { items: [] },
      ]);
      return { bench, items: dados.items || [] };
    },
  });
  // A conta usa os pesos de agora: mudar uma quantidade já muda o resultado
  const pesos = JSON.stringify([c.rv.map(r => [r.t, r.value, r.cur, r.type]), c.cr.map(r => [r.t, r.value]), c.mo.map(r => [r.c, r.value]),
    c.rf.map(r => [r.id, r.calc?.liquido, r.idx, r.taxa]), itensProntos?.map(i => [i.ticker, i.points?.length, i.points?.at(-1)?.[1]])]);
  const calc = useMemo((): { d: Comparativo | null; erro: string | null } => {
    if (!q.data) return { d: null, erro: q.isError ? ERRO : null };
    try { return { d: calcularComparativo(q.data.bench, itensProntos ?? q.data.items, c), erro: null }; }
    catch { return { d: null, erro: ERRO }; }
    // c muda junto com pesos; a conta só refaz quando os pesos ou os dados mudam
  }, [q.data, q.isError, pesos]);
  return { ...calc, carregando: ativo && !calc.d && !calc.erro, versao: `${range}|${q.dataUpdatedAt}|${pesos}` };
}
