// Monte Carlo: milhares de futuros de inflação e juros, e como pós-fixado, IPCA+ e prefixado se saem neles (motor/montecarlo.ts).
// As preferências ficam na carteira (preferencias.montecarlo), no servidor.
import { useMemo, useState } from "react";
import { useRendaFixa } from "../../lib/dados";
import { usePrefCarteira } from "../../lib/preferencia";
import { big, brl, money } from "../../lib/formato";
import { ESTRATEGIAS, juroReal, monteCarlo, type CfgMonteCarlo, type Estrategia } from "../../motor";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda, Num } from "../../componentes/Campos";
import { ErroCarteira } from "../../componentes/ErroCarteira";

type Cfg = {
  inicial?: number | null; aporte?: number | null; anos?: number | null; meta?: number | null;
  pctCdi?: number | null; taxaIpca?: number | null; taxaPre?: number | null;
  infHoje?: number | null; infMedia?: number | null; infDesvio?: number | null; infPersist?: number | null;
  realHoje?: number | null; realMedia?: number | null; realDesvio?: number | null; realPersist?: number | null;
};
const NOMES: Record<Estrategia, string> = { pos: "Pós-fixado (CDI)", ipca: "IPCA+", pre: "Prefixado" };
const pc = (v: number) => Math.round(v * 100) + "%";

export function MonteCarlo() {
  const rf = useRendaFixa();
  const [salvo, setCfg] = usePrefCarteira<Cfg>("montecarlo", {});
  const [vista, setVista] = useState<Estrategia>("pos");
  const cur = rf.atuais;
  const def = {
    inicial: 10_000, aporte: 1000, anos: 10, meta: 170_000, pctCdi: 100, taxaIpca: 6.5, taxaPre: 12,
    infHoje: cur ? +cur.ipca.toFixed(2) : 4.5, infMedia: 4.5, infDesvio: 1.5, infPersist: 0.6,
    realHoje: cur ? +juroReal(cur.cdi, cur.ipca).toFixed(2) : 6, realMedia: 5, realDesvio: 2, realPersist: 0.7,
  };
  const c = { ...def };
  for (const k of Object.keys(def) as (keyof typeof def)[]) if (salvo?.[k] != null) c[k] = salvo[k]!;
  const entrada: CfgMonteCarlo = {
    inicial: c.inicial, aporte: c.aporte, anos: c.anos, meta: c.meta, pctCdi: c.pctCdi, taxaIpca: c.taxaIpca, taxaPre: c.taxaPre,
    inflacao: { hoje: c.infHoje, media: c.infMedia, desvio: c.infDesvio, persistencia: c.infPersist },
    juroReal: { hoje: c.realHoje, media: c.realMedia, desvio: c.realDesvio, persistencia: c.realPersist },
  };
  const chave = JSON.stringify(entrada);
  // só refaz os sorteios quando uma premissa muda
  const r = useMemo(() => monteCarlo(entrada), [chave]);
  if (rf.erroCarteira) return <ErroCarteira msg={rf.erroCarteira} />;
  if (!salvo) return null;

  const campo = (n: keyof Cfg) => (v: number | null) => setCfg({ [n]: v });
  const inicio = new Date(); inicio.setDate(1);
  const tx = (ano: number) => { const d = new Date(inicio); d.setFullYear(d.getFullYear() + ano); return d.getTime(); };
  const v = r.estrategias[vista];
  const serie = (k: "p10" | "p50" | "p90") => [{ x: tx(0), y: c.inicial }, ...v.anos.map(a => ({ x: tx(a.ano), y: a[k] }))];

  return (
    <div className="panel">
      <h2>Monte Carlo</h2>
      <div className="hint">Ninguém sabe a inflação e os juros dos próximos anos. Em vez de um cenário só, esta ferramenta sorteia {r.simulacoes.toLocaleString("pt-BR")} e mostra a faixa de resultados. Tudo em reais de hoje, já sem IR.</div>
      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <Num rotulo="Valor inicial (R$)" min="0" step="1000" valor={c.inicial} onValor={campo("inicial")} />
        <Num rotulo="Aporte mensal, corrigido pela inflação (R$)" min="0" step="100" valor={c.aporte} onValor={campo("aporte")} />
        <Num rotulo="Prazo (anos)" min="1" max="50" step="1" valor={r.anos} onValor={campo("anos")} />
        <Num rotulo="Meta em reais de hoje (R$)" min="0" step="10000" valor={c.meta} onValor={campo("meta")} />
        <Num rotulo="Pós-fixado (% do CDI)" min="0" step="1" valor={c.pctCdi} onValor={campo("pctCdi")} />
        <Num rotulo="IPCA+: juro real (% a.a.)" step="0.1" valor={c.taxaIpca} onValor={campo("taxaIpca")} />
        <Num rotulo="Prefixado (% a.a.)" step="0.1" valor={c.taxaPre} onValor={campo("taxaPre")} />
      </form>
      <div className="hint">As taxas do IPCA+ e do prefixado são só exemplos: use as das ofertas que você está comparando, porque são elas que mais decidem qual se sai melhor.</div>
      <details>
        <summary>Premissas de inflação e juros</summary>
        <div className="hint">“Hoje” vem do Banco Central. Média, variação e persistência são pontos de partida, não previsões: mude e veja quanto o resultado depende deles. Persistência perto de 1 faz um ano ruim puxar os seguintes.</div>
        <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
          <Num rotulo="Inflação hoje (% a.a.)" step="0.1" valor={c.infHoje} onValor={campo("infHoje")} />
          <Num rotulo="Inflação média no longo prazo (%)" step="0.1" valor={c.infMedia} onValor={campo("infMedia")} />
          <Num rotulo="Variação da inflação (p.p.)" min="0" step="0.1" valor={c.infDesvio} onValor={campo("infDesvio")} />
          <Num rotulo="Persistência da inflação (0 a 0,99)" min="0" max="0.99" step="0.05" valor={c.infPersist} onValor={campo("infPersist")} />
          <Num rotulo="Juro real hoje (% a.a.)" step="0.1" valor={c.realHoje} onValor={campo("realHoje")} />
          <Num rotulo="Juro real médio no longo prazo (%)" step="0.1" valor={c.realMedia} onValor={campo("realMedia")} />
          <Num rotulo="Variação do juro real (p.p.)" min="0" step="0.1" valor={c.realDesvio} onValor={campo("realDesvio")} />
          <Num rotulo="Persistência do juro real (0 a 0,99)" min="0" max="0.99" step="0.05" valor={c.realPersist} onValor={campo("realPersist")} />
          <div className="quick"><button type="button" onClick={() => setCfg({ infHoje: null, infMedia: null, infDesvio: null, infPersist: null, realHoje: null, realMedia: null, realDesvio: null, realPersist: null })}>Restaurar premissas</button></div>
        </form>
      </details>
      <div className="table-wrap" style={{ marginTop: 12 }}><table className="w-table">
        <thead><tr><th className="txt-sm">Em {r.anos} ano{r.anos > 1 ? "s" : ""}</th><th>Ruim (10%)</th><th>Do meio (50%)</th><th>Bom (90%)</th><th>Chance de bater a meta</th><th>Chance de perder da inflação</th><th>Foi o melhor dos três</th></tr></thead>
        <tbody>{ESTRATEGIAS.map(e => { const x = r.estrategias[e]; return (
          <tr key={e}><td className="txt-sm">{NOMES[e]}</td><td>{money(x.fim.p10)}</td><td><b>{money(x.fim.p50)}</b></td><td>{money(x.fim.p90)}</td>
            <td>{x.chanceMeta != null ? pc(x.chanceMeta) : "—"}</td><td>{pc(x.chancePerder)}</td><td>{pc(x.chanceMelhor)}</td></tr>
        ); })}</tbody>
      </table></div>
      <div className="status">Aplicado no período, em reais de hoje: {money(r.investidoReal)}. Em 10% dos futuros o resultado fica abaixo da coluna “Ruim”, e em outros 10% acima da “Bom”.
        {" "}Nos sorteios, a inflação média do período ficou entre {brl(r.inflacao.p10, 1)}% e {brl(r.inflacao.p90, 1)}% ao ano, e o CDI entre {brl(r.cdi.p10, 1)}% e {brl(r.cdi.p90, 1)}% (8 em cada 10 casos).</div>
      <div className="seg" role="group" aria-label="Investimento no gráfico" style={{ marginTop: 12 }}>
        {ESTRATEGIAS.map(e => <button key={e} type="button" className={vista === e ? "on" : ""} aria-pressed={vista === e} onClick={() => setVista(e)}>{NOMES[e]}</button>)}
      </div>
      <Legenda itens={[["Do meio", css("--s1")], ["Bom (90%)", css("--s2"), true], ["Ruim (10%)", css("--s3"), true]]} />
      <div className="proj-box">
        <Grafico rotulo="Faixa de resultados ao longo dos anos" deps={[chave, vista]} config={canvas => configLinha(canvas, [
          { label: "Do meio", color: css("--s1"), data: serie("p50") },
          { label: "Bom", color: css("--s2"), dash: [5, 4], data: serie("p90") },
          { label: "Ruim", color: css("--s3"), dash: [5, 4], data: serie("p10") },
        ], { fmtY: x => "R$ " + big(x), fmtTip: x => money(x), height: 230, fill: false })} />
      </div>
      <div className="status">Limites: os sorteios não preveem crises, a taxa do IPCA+ e a do prefixado valem o prazo todo (sem vender antes nem marcar a mercado), não há risco de calote e o IR é o do prazo total. Os sorteios são fixos: as mesmas premissas sempre dão o mesmo resultado.</div>
    </div>
  );
}
