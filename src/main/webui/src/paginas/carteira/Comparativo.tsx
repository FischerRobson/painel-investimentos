// Carteira × CDI, Ibovespa e IFIX: painel recolhível (fechado por padrão, acc_cmp) que só busca os históricos quando aberto.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "../../lib/api";
import { store } from "../../lib/store";
import { brl, pct, signCls } from "../../lib/formato";
import { calcularComparativo, pedidoComparativo, type Benchmarks, type ChaveSerie, type Comparativo as Resultado } from "../../lib/comparativo";
import type { Composicao, ItemAtivo } from "../../lib/composicao";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda } from "../../componentes/Campos";
import { useAberto } from "../../lib/useAberto";

const RANGES: [string, string][] = [["6mo", "6 meses"], ["1y", "1 ano"], ["5y", "5 anos"]];
const SERIES: [ChaveSerie, string, string, boolean?][] = [["carteira", "Sua carteira", "--s1"], ["CDI", "CDI", "--s2", true], ["IBOV", "Ibovespa", "--s3"], ["IFIX", "IFIX", "--s4"]];
const ERRO = "Não consegui carregar os dados de comparação agora.";

export function Comparativo({ c, pronta }: { c: Composicao; pronta: boolean }) {
  const [aberto, setAberto] = useAberto("acc_cmp", "0");
  const [range, setRangeState] = useState(() => store.get("cmpRange", "1y"));
  const setRange = (r: string) => { setRangeState(r); store.set("cmpRange", r); };
  const { fx, coins, tickers } = pedidoComparativo(c);

  const q = useQuery({
    queryKey: ["comparativo", range, fx.join(","), coins.join(","), tickers.join(",")],
    enabled: aberto && pronta,
    staleTime: Infinity, // busca uma vez por período, até recarregar a página
    retry: false,
    queryFn: async () => {
      const [bench, dados] = await Promise.all([
        getJson<Benchmarks>(`/api/benchmarks?range=${range}&fx=${fx.join(",")}&crypto=${coins.join(",")}`),
        tickers.length ? getJson<{ items?: ItemAtivo[] }>(`/api/data?range=${range}&symbols=${encodeURIComponent(tickers.join(","))}`) : { items: [] },
      ]);
      return { bench, items: dados.items || [] };
    },
  });
  // A conta usa os pesos de agora: mudar uma quantidade já muda o resultado
  const pesos = JSON.stringify([c.rv.map(r => [r.t, r.value, r.cur]), c.cr.map(r => [r.t, r.value]), c.mo.map(r => [r.c, r.value]),
    c.rf.map(r => [r.id, r.calc?.liquido, r.idx, r.taxa])]);
  const calc = useMemo((): { d: Resultado | null; erro: string | null } => {
    if (!q.data) return { d: null, erro: q.isError ? ERRO : null };
    try { return { d: calcularComparativo(q.data.bench, q.data.items, c), erro: null }; }
    catch { return { d: null, erro: ERRO }; }
    // c muda junto com pesos; a conta só refaz quando os pesos ou os dados mudam
  }, [q.data, q.isError, pesos]);
  const { d, erro } = calc;
  const carregando = aberto && !d && !erro;

  const pctCdi = d && d.ret.CDI != null && d.ret.CDI > 0 && d.ret.carteira != null ? d.ret.carteira / d.ret.CDI * 100 : null;
  const comDados = d ? SERIES.filter(([k]) => d.series[k].length) : [];
  return (
    <div className="panel">
      <details className="acc" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
        <summary><span className="acc-t">Carteira × CDI, Ibovespa e IFIX</span>
          <span className="acc-s">{d && !d.vazia ? `${RANGES.find(r => r[0] === range)?.[1]}: carteira ${pct(d.ret.carteira, 1)} · CDI ${pct(d.ret.CDI, 1)}` : "toque para calcular"}</span></summary>
        <div>
          <div className="cmp-top"><div className="seg">
            {RANGES.map(([k, l]) => <button key={k} className={range === k ? "on" : undefined} onClick={() => { if (k !== range) setRange(k); }}>{l}</button>)}
          </div></div>
          {carregando ? <div className="status" style={{ margin: "12px 0" }}>Buscando históricos…</div>
            : erro ? <div className="err" style={{ margin: "12px 0" }}>{erro}</div>
            : d?.vazia ? <div className="hint" style={{ margin: "12px 0" }}>Cadastre ativos na carteira para comparar.</div>
            : d && <>
              <div className="tiles">{SERIES.map(([k, nome, cor]) => (
                <div className="tile" key={k}>
                  <div className="k"><span className="dot" style={{ background: `var(${cor})` }} /> {nome}{k === "IFIX" && <> <span className="muted">(XFIX11)</span></>}</div>
                  <div className={"v " + signCls(d.ret[k] ?? 0)}>{pct(d.ret[k])}</div>
                  {k === "carteira" && pctCdi != null && <div className="s">{brl(pctCdi, 0)}% do CDI</div>}
                </div>
              ))}</div>
              <Legenda itens={comDados.map(([, nome, cor, dash]) => [nome, css(cor), dash])} />
              <div className="proj-box">
                <Grafico rotulo="Carteira comparada com CDI, Ibovespa e IFIX" deps={[range, q.dataUpdatedAt, pesos]}
                  config={canvas => configLinha(canvas, comDados.map(([k, nome, cor, dash]) => ({
                    label: nome, color: css(cor), dash: dash ? [5, 4] : [], data: d.series[k].map(([x, y]) => ({ x, y: (y - 1) * 100 })),
                  })), { fill: false, height: 230, fmtY: v => brl(v, 0) + "%", fmtTip: v => pct(v) })} />
              </div>
            </>}
          <div className="status">Simulação: como a sua composição de hoje (cada ativo pesando pelo valor atual) teria se saído no período.
            Não considera compras, vendas nem aportes; bens ficam de fora. IFIX aproximado pelo ETF XFIX11, que o replica.
            {d?.fora.length ? ` Sem histórico no período: ${d.fora.join(", ")}.` : ""}{d?.avisos.length ? " " + d.avisos.join("; ") + "." : ""}</div>
        </div>
      </details>
    </div>
  );
}
