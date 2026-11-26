// Carteira com o valor de cada ativo: busca as cotações, o câmbio, as taxas e os preços de bens e monta a composição.
// Usada pela página Carteira e pelas ferramentas que olham para a carteira inteira.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getJson } from "./api";
import { useCarteira } from "./carteira";
import { useCambio } from "./cambio";
import { usePrecosBens } from "./bens";
import { hojeISO, useRendaFixa } from "./dados";
import { montarComposicao, type Composicao, type ItemAtivo, type Posicao, type PrecoCripto } from "./composicao";

const ERRO_CRIPTO = "Não consegui o preço das criptos agora (CoinGecko).";

export function useComposicao() {
  const carteira = useCarteira();
  const doc = carteira.doc;
  const acoes = (doc?.acoesFiis ?? []) as Posicao[];
  const criptoW = (doc?.cripto ?? []) as Posicao[];

  // Cotações de 1 mês (só a brapi, a consulta mais barata). Remover um ativo não busca de novo; um ticker novo busca todos.
  const tickers = acoes.map(w => w.t);
  const [pedidos, setPedidos] = useState<string[]>([]);
  const faltaTicker = tickers.some(t => !pedidos.includes(t));
  useEffect(() => { if (faltaTicker) setPedidos(tickers); }, [faltaTicker, tickers.join(",")]);
  const dados = useQuery({
    queryKey: ["data", "1mo", pedidos.join(",")],
    enabled: pedidos.length > 0,
    queryFn: () => getJson<{ items: ItemAtivo[] }>(`/api/data?range=1mo&symbols=${encodeURIComponent(pedidos.join(","))}`),
    placeholderData: prev => prev, // ticker novo: os outros continuam na tela até chegar a resposta
  });
  const ativos = Object.fromEntries((dados.data?.items ?? []).map(it => [it.ticker, it]));

  const coins = criptoW.map(c => c.t).join(",");
  const cripto = useQuery({
    queryKey: ["crypto", coins],
    enabled: !!coins,
    queryFn: async () => (await (await apiFetch(`/api/crypto?coins=${coins}`)).json()) as { prices?: Record<string, PrecoCripto>; error?: string },
    placeholderData: prev => prev,
    retry: false,
  });
  const erroCripto = cripto.isError || cripto.data?.error ? ERRO_CRIPTO : null;

  const precisaFx = !!doc?.moedas?.length || Object.values(ativos).some(it => it.currency && it.currency !== "BRL");
  const cambio = useCambio(30, precisaFx);
  const rf = useRendaFixa();
  const bens = usePrecosBens();

  const composicao: Composicao | null = doc ? montarComposicao({
    doc, ativos, cripto: cripto.data?.prices ?? {}, fx: cambio.data, rates: rf.rates, hoje: hojeISO(), valorBem: bens.valor,
  }) : null;
  // Tudo o que entra no valor da carteira já chegou (ou falhou): só então os gráficos buscam os históricos
  const pronta = !(tickers.length && (!pedidos.length || dados.isPending)) && !(coins && cripto.isPending)
    && !(rf.titulos.length && !rf.rates && !rf.ratesErr) && !(precisaFx && cambio.isPending);

  // itens: as cotações de 1 mês já buscadas, que os gráficos de 30 dias reaproveitam sem gastar a brapi de novo
  return { carteira, doc, composicao, pronta, erroCripto, rf, itens: dados.data?.items ?? [] };
}
