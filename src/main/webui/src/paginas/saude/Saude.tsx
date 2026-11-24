// Saúde da carteira: nota geral e subnotas, onde aportar, quem está compensando, sinais para reduzir, trocas com o custo de IR,
// metas por classe e histórico mensal. Contas em motor/saude.ts e lib/saude.ts; esta página busca os dados e mostra.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTitulo } from "../../lib/useTitulo";
import { apiFetch, getJson } from "../../lib/api";
import { useCarteira } from "../../lib/carteira";
import { useCambio } from "../../lib/cambio";
import { hojeISO } from "../../lib/dados";
import { usePrefCarteira } from "../../lib/preferencia";
import { montarComposicao, type ItemAtivo, type Posicao, type PrecoCripto } from "../../lib/composicao";
import { calcularSaude, mesDaData, PREF_SAUDE, type ItemFund, type Saude } from "../../lib/saude";
import { ErroCarteira } from "../../componentes/ErroCarteira";
import { Resumo } from "./Resumo";
import { Aportar } from "./Aportar";
import { Ranking } from "./Ranking";
import { Sinais } from "./Sinais";
import { Metas } from "./Metas";
import { HistoricoSaude } from "./HistoricoSaude";
import type { TaxasBCB } from "../../motor";

type ResumoMes = { month: string; expenses: number; areas?: Record<string, number> };

// Custo fixo mensal: média dos até 3 últimos meses fechados com gasto em Custos fixos
async function custoFixoMedio(): Promise<number | null> {
  const mes = hojeISO().slice(0, 7);
  const r = await apiFetch(`/api/budget/summary?to=${mes}&months=4`);
  if (!r.ok) return null;
  const v = ((await r.json()) as ResumoMes[]).filter(m => m.month < mes && (m.areas?.fixedCosts ?? 0) > 0).slice(-3);
  return v.length ? v.reduce((s, m) => s + m.areas!.fixedCosts, 0) / v.length : null;
}

export function Saude() {
  useTitulo("Saúde da carteira");
  const carteira = useCarteira();
  const doc = carteira.doc;
  const [prefs, setPrefs] = usePrefCarteira("saude", PREF_SAUDE);
  const acoes = (doc?.acoesFiis ?? []) as Posicao[], criptoW = (doc?.cripto ?? []) as Posicao[];
  const candidatos = (prefs?.candidatos ?? "").split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
  const tickers = [...new Set([...acoes.map(a => a.t), ...candidatos])];

  const dados = useQuery({
    queryKey: ["saude-data", tickers.join(",")], enabled: tickers.length > 0, placeholderData: prev => prev,
    queryFn: () => getJson<{ items: (ItemAtivo & ItemFund)[] }>(`/api/data?range=1mo&symbols=${encodeURIComponent(tickers.join(","))}`),
  });
  const coins = criptoW.map(c => c.t).join(",");
  const cripto = useQuery({
    queryKey: ["crypto", coins], enabled: !!coins, placeholderData: prev => prev, retry: false,
    queryFn: async () => (await (await apiFetch(`/api/crypto?coins=${coins}`)).json()) as { prices?: Record<string, PrecoCripto> },
  });
  const precisaFx = !!doc?.moedas?.length || (dados.data?.items ?? []).some(it => it.currency && it.currency !== "BRL");
  const cambio = useCambio(30, precisaFx);
  // CDI desde a aplicação ou operação mais antiga (para comparar cada ativo com o CDI no mesmo período)
  const desde = [...(doc?.operacoes ?? []).map(o => o.data), ...((doc?.rendaFixa ?? []) as { data: string }[]).map(t => t.data)].sort()[0] ?? null;
  const taxas = useQuery({
    queryKey: ["rates", "saude", desde], enabled: !!desde, retry: false,
    queryFn: async () => {
      const j = await (await apiFetch(`/api/rates?from=${desde}`)).json() as TaxasBCB & { error?: string };
      if (j.error) throw new Error(j.error);
      return j;
    },
  });
  const orc = useQuery({ queryKey: ["saude-custo-fixo"], queryFn: custoFixoMedio, retry: false });

  const itens = useMemo(() => Object.fromEntries((dados.data?.items ?? []).map(it => [it.ticker, it])), [dados.data]);
  const pronto = !!doc && !!prefs && !(tickers.length && dados.isPending) && !(coins && cripto.isPending) && !(precisaFx && cambio.isPending)
    && !(desde && taxas.isPending && !taxas.isError) && !orc.isPending;
  const hoje = hojeISO();
  const saude: Saude | null = useMemo(() => {
    if (!pronto || !doc || !prefs) return null;
    const comp = montarComposicao({ doc, ativos: itens as Record<string, ItemAtivo>, cripto: cripto.data?.prices ?? {}, fx: cambio.data, rates: taxas.data ?? null, hoje, valorBem: () => null });
    return calcularSaude({ comp, itens, rates: taxas.data ?? null, hoje, custoFixo: orc.data ?? null, prefs, operacoes: doc.operacoes ?? [], proventos: doc.proventos ?? [] });
    // prefs vem de doc.preferencias: muda junto com doc
  }, [pronto, doc, itens, cripto.data, cambio.data, taxas.data, orc.data, hoje]);

  // Grava a nota do mês (uma por mês, atualizada se mudar) para o histórico e para saber há quantos meses um ativo está fraco
  useEffect(() => {
    if (!saude || !prefs || saude.geral == null) return;
    const mes = mesDaData(hoje), atual = prefs.hist[mes];
    if (atual && atual.geral === saude.registro.geral && JSON.stringify(atual.ativos) === JSON.stringify(saude.registro.ativos)) return;
    setPrefs(p => ({ ...p, hist: { ...p.hist, [mes]: saude.registro } }));
    // só reage a um cálculo novo; prefs é lido da mesma versão do documento
  }, [saude]);

  if (carteira.erro) return <ErroCarteira msg={carteira.erro} />;
  if (!doc || !prefs) return <div className="panel muted">Carregando sua carteira…</div>;
  if (!acoes.length && !criptoW.length && !(doc.rendaFixa ?? []).length) {
    return <div className="panel"><h2>Saúde da carteira</h2><div className="hint" style={{ margin: 0 }}>Adicione ativos em Carteira para ver a análise.</div></div>;
  }
  if (!saude) return <div className="panel muted">Calculando a saúde da carteira…</div>;

  const avisos = [
    dados.isError && "Não consegui as cotações e os indicadores agora: as notas dos ativos podem estar incompletas.",
    taxas.isError && "Não consegui o CDI do Banco Central: a comparação com o CDI fica de fora.",
  ].filter(Boolean) as string[];

  return <>
    <Resumo saude={saude} avisos={avisos} />
    <Aportar saude={saude} prefs={prefs} setPrefs={setPrefs} />
    <Ranking saude={saude} />
    <Sinais saude={saude} prefs={prefs} setPrefs={setPrefs} />
    <Metas saude={saude} prefs={prefs} setPrefs={setPrefs} />
    <HistoricoSaude hist={prefs.hist} />
  </>;
}
