// Carteira × CDI, Ibovespa e IFIX: como a composição de hoje teria se saído no período (contas em lib/comparativo.ts).
import { useState } from "react";
import { store } from "../../lib/store";
import { brl, pct, signCls } from "../../lib/formato";
import type { ChaveSerie } from "../../lib/comparativo";
import { useComparativo } from "../../lib/useComparativo";
import { useComposicao } from "../../lib/useComposicao";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda } from "../../componentes/Campos";
import { ErroCarteira } from "../../componentes/ErroCarteira";
import type { Composicao } from "../../lib/composicao";

const RANGES: [string, string][] = [["6mo", "6 meses"], ["1y", "1 ano"], ["5y", "5 anos"]];
const SERIES: [ChaveSerie, string, string, boolean?][] = [["carteira", "Sua carteira", "--s1"], ["CDI", "CDI", "--s2", true], ["IBOV", "Ibovespa", "--s3"], ["IFIX", "IFIX", "--s4"]];

export function CarteiraMercado() {
  const { carteira, composicao, pronta } = useComposicao();
  if (carteira.erro) return <ErroCarteira msg={carteira.erro} />;
  if (!composicao) return <div className="panel muted">Carregando sua carteira…</div>;
  return <Painel c={composicao} pronta={pronta} />;
}

function Painel({ c, pronta }: { c: Composicao; pronta: boolean }) {
  const [range, setRangeState] = useState(() => store.get("cmpRange", "1y"));
  const setRange = (r: string) => { setRangeState(r); store.set("cmpRange", r); };
  const { d, erro, carregando, versao } = useComparativo(c, range, pronta && !c.vazia);

  const pctCdi = d && d.ret.CDI != null && d.ret.CDI > 0 && d.ret.carteira != null ? d.ret.carteira / d.ret.CDI * 100 : null;
  const comDados = d ? SERIES.filter(([k]) => d.series[k].length) : [];
  return (
    <div className="panel">
      <h2>Carteira × CDI, Ibovespa e IFIX</h2>
      <div className="cmp-top"><div className="seg">
        {RANGES.map(([k, l]) => <button key={k} type="button" className={range === k ? "on" : undefined} aria-pressed={range === k} onClick={() => { if (k !== range) setRange(k); }}>{l}</button>)}
      </div></div>
      {c.vazia || d?.vazia ? <div className="hint" style={{ margin: "12px 0" }}>Cadastre ativos na carteira para comparar.</div>
        : erro ? <div className="err" style={{ margin: "12px 0" }}>{erro}</div>
        : carregando || !d ? <div className="status" style={{ margin: "12px 0" }}>Buscando históricos…</div>
        : <>
              <div className="tiles">{SERIES.map(([k, nome, cor]) => (
                <div className="tile" key={k}>
                  <div className="k"><span className="dot" style={{ background: `var(${cor})` }} /> {nome}{k === "IFIX" && <> <span className="muted">(XFIX11)</span></>}</div>
                  <div className={"v " + signCls(d.ret[k] ?? 0)}>{pct(d.ret[k])}</div>
                  {k === "carteira" && pctCdi != null && <div className="s">{brl(pctCdi, 0)}% do CDI</div>}
                </div>
              ))}</div>
              <Legenda itens={comDados.map(([, nome, cor, dash]) => [nome, css(cor), dash])} />
              <div className="proj-box">
                <Grafico rotulo="Carteira comparada com CDI, Ibovespa e IFIX" deps={[versao]}
                  config={canvas => configLinha(canvas, comDados.map(([k, nome, cor, dash]) => ({
                    label: nome, color: css(cor), dash: dash ? [5, 4] : [], data: d.series[k].map(([x, y]) => ({ x, y: (y - 1) * 100 })),
                  })), { fill: false, height: 230, fmtY: v => brl(v, 0) + "%", fmtTip: v => pct(v) })} />
              </div>
        </>}
          <div className="status">Simulação: como a sua composição de hoje (cada ativo pesando pelo valor atual) teria se saído no período.
            Não considera compras, vendas nem aportes; bens ficam de fora. IFIX aproximado pelo ETF XFIX11, que o replica.
            {d?.fora.length ? ` Sem histórico no período: ${d.fora.join(", ")}.` : ""}{d?.avisos.length ? " " + d.avisos.join("; ") + "." : ""}</div>
    </div>
  );
}
