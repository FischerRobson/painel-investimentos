// Projeção da renda fixa: quanto os títulos da carteira vão valer numa data futura, líquido de IR.
// Contas em Motor.rfCalc e Motor.projectOne. Preferências na carteira (preferencias.projecao).
import { Link } from "react-router";
import { hojeISO, isoBR, useRendaFixa } from "../../lib/dados";
import { usePrefCarteira } from "../../lib/preferencia";
import { big, brl, money, pct } from "../../lib/formato";
import { addDays, addMonths, daysBetween, projectOne, rfCalc, type TaxasBCB, type TituloRF } from "../../motor";
import { crosshair, css, gridOpts, tickOpts, timeTicks, tooltipOpts } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Num, Texto } from "../../componentes/Campos";
import { ErroCarteira } from "../../componentes/ErroCarteira";

type Cfg = { target?: string | null; cdi?: number | null; ipca?: number | null; reinvest?: boolean; only?: string | null };

export const rfTaxa = (e: { idx: string; taxa: number }) =>
  e.idx === "cdi" ? `${brl(e.taxa, e.taxa % 1 ? 1 : 0)}% do CDI` : e.idx === "pre" ? `${brl(e.taxa)}% a.a.` : `IPCA + ${brl(e.taxa)}%`;

export function ProjecaoRF() {
  const rf = useRendaFixa();
  const [projCfg, setProjCfg] = usePrefCarteira<Cfg>("projecao", { reinvest: true });
  if (rf.erroCarteira) return <ErroCarteira msg={rf.erroCarteira} />;
  if (!projCfg) return null;
  const rfW = rf.titulos;
  if (!rfW.length) return (
    <div className="panel"><h2>Projeção da renda fixa</h2>
      <div className="hint" style={{ marginTop: 8 }}>Você ainda não cadastrou títulos de renda fixa. Cadastre na página <Link to="/carteira">Carteira</Link> (aba "Renda fixa") para ver a projeção deles.</div></div>
  );
  if (!rf.rates) return (
    <div className="panel"><h2>Projeção da renda fixa</h2>
      <div className={rf.ratesErr ? "err" : "hint"} style={{ marginTop: 8 }}>{rf.ratesErr || "Carregando as taxas do Banco Central…"}</div></div>
  );
  return <>
    {rf.ratesErr && <div className="panel err">{rf.ratesErr}</div>}
    <Projecao rfW={rfW} rates={rf.rates} cur={rf.atuais!} projCfg={projCfg} setProjCfg={setProjCfg} />
  </>;
}

function Projecao({ rfW, rates, cur, projCfg, setProjCfg }: {
  rfW: TituloRF[]; rates: TaxasBCB; cur: { cdi: number; ipca: number }; projCfg: Cfg; setProjCfg: (m: Partial<Cfg>) => void;
}) {
  const hoje = hojeISO();
  const only = projCfg.only && rfW.some(x => x.id === projCfg.only) ? projCfg.only : null;
  const cfg = {
    target: projCfg.target && projCfg.target > hoje ? projCfg.target : addMonths(hoje, 12),
    cdi: projCfg.cdi ?? +cur.cdi.toFixed(2), ipca: projCfg.ipca ?? +cur.ipca.toFixed(2),
    reinvest: projCfg.reinvest !== false,
  };
  const rf = (only ? rfW.filter(r => r.id === only) : rfW).map(e => ({ ...e, calc: rfCalc(e, rates, hoje) }));
  const nowLiq = rf.reduce((a, r) => a + (r.calc?.liquido || 0), 0);
  const per = rf.map(r => ({ r, p: projectOne(r, cfg.target, cfg, rates, hoje) }));
  const totLiq = per.reduce((a, x) => a + x.p.liquido, 0);
  const totIr = per.reduce((a, x) => a + x.p.ir, 0);
  // pontos do gráfico: semanal até 4 meses, mensal até 10 anos, trimestral acima
  const span = daysBetween(hoje, cfg.target);
  const pts: string[] = [];
  for (let i = 0, d = hoje; d < cfg.target; i++) {
    pts.push(d);
    d = span <= 120 ? addDays(hoje, 7 * (i + 1)) : addMonths(hoje, (span <= 3650 ? 1 : 3) * (i + 1));
  }
  pts.push(cfg.target);
  const serie = pts.map(d => ({ x: new Date(d + "T12:00:00").getTime(), y: d === hoje ? nowLiq : rf.reduce((a, r) => a + projectOne(r, d, cfg, rates, hoje).liquido, 0) }));
  const yrs = span / 365;

  return (
    <div className="panel">
      <h2>Projeção da renda fixa</h2>
      <div className="hint">Quanto seus títulos de renda fixa vão valer numa data futura.</div>
      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <label>Títulos<select value={only ?? ""} onChange={e => setProjCfg({ only: e.target.value || null })}>
          <option value="">Todos os títulos ({rfW.length})</option>
          {rfW.map(x => <option key={x.id} value={x.id}>{x.nome} · {x.tipo}</option>)}
        </select></label>
        <Texto rotulo="Quanto terei em" type="date" min={addDays(hoje, 1)} valor={cfg.target} onValor={v => setProjCfg({ target: v || null })} />
        <Num rotulo="CDI projetado (% a.a.)" step="0.01" valor={cfg.cdi} onValor={v => setProjCfg({ cdi: v })} />
        <Num rotulo="IPCA projetado (% a.a.)" step="0.01" valor={cfg.ipca} onValor={v => setProjCfg({ ipca: v })} />
        <label className="chk"><input type="checkbox" checked={cfg.reinvest} onChange={e => setProjCfg({ reinvest: e.target.checked })} /> Reaplicar títulos que vencerem a 100% do CDI</label>
        <div className="quick">
          {([[6, "6 meses"], [12, "1 ano"], [24, "2 anos"], [60, "5 anos"]] as const).map(([m, l]) => (
            <button key={m} type="button" onClick={() => setProjCfg({ target: addMonths(hojeISO(), m) })}>{l}</button>
          ))}
          <button type="button" title="Volta CDI e IPCA para os valores atuais" onClick={() => setProjCfg({ cdi: null, ipca: null })}>Usar taxas atuais</button>
        </div>
      </form>
      <div className="hint">Premissas atuais: CDI {brl(cur.cdi)}% a.a. (taxa do último dia útil) e IPCA {brl(cur.ipca)}% nos últimos 12 meses. "Líquido" = o que você receberia resgatando nessa data, já descontado o IR.</div>
      <div className="tiles">
        <div className="tile"><div className="k">Em {isoBR(cfg.target)} você terá</div><div className="v">{money(totLiq)}</div><div className="s">líquido de IR · hoje {money(nowLiq)}</div></div>
        <div className="tile"><div className="k">Vai render até lá</div><div className="v up">+{money(totLiq - nowLiq)}</div>
          <div className="s">{nowLiq ? pct((totLiq / nowLiq - 1) * 100) : "—"} em {yrs >= 1 ? brl(yrs, 1) + " ano" + (yrs >= 2 ? "s" : "") : span + " dias"}</div></div>
        <div className="tile"><div className="k">IR estimado</div><div className="v">{money(totIr)}</div><div className="s">total descontado no resgate</div></div>
      </div>
      <div className="proj-box">
        <Grafico rotulo="Evolução projetada da renda fixa" deps={[JSON.stringify(serie)]} config={canvas => configProjecao(canvas, serie)} />
      </div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Título</th><th>Rentabilidade</th><th>Vencimento</th><th>Líquido hoje</th><th>Bruto em {isoBR(cfg.target)}</th><th>IR</th><th>Líquido em {isoBR(cfg.target)}</th><th>Observação</th></tr></thead>
        <tbody>{[...per].sort((a, b) => b.p.liquido - a.p.liquido).map(({ r, p }) => (
          <tr key={r.id}>
            <td><span className="tk">{r.nome}</span> <span className="muted">{r.tipo}</span></td>
            <td>{rfTaxa(r)}</td><td>{r.venc ? isoBR(r.venc) : "—"}</td>
            <td>{money(r.calc.liquido)}</td><td>{money(p.bruto)}</td>
            <td>{r.isento && !p.venceAntes ? <span className="muted">isento</span> : money(p.ir)}</td>
            <td><b>{money(p.liquido)}</b></td>
            <td className="muted">{p.venceAntes ? (cfg.reinvest ? `vence em ${isoBR(p.end)}, reaplicado a 100% CDI` : `vence em ${isoBR(p.end)}, valor parado`) : ""}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="status">É uma estimativa: supõe CDI e IPCA constantes até a data e não desconta feriados. Ações, FIIs e cripto não entram na projeção.</div>
    </div>
  );
}

// Gráfico de área com o líquido projetado
function configProjecao(canvas: HTMLCanvasElement, series: { x: number; y: number }[]) {
  const min = series[0].x, max = series[series.length - 1].x;
  const c = css("--s2");
  const grad = canvas.getContext("2d")?.createLinearGradient(0, 0, 0, 220);
  grad?.addColorStop(0, c + "33"); grad?.addColorStop(1, c + "00");
  return {
    type: "line" as const,
    data: { datasets: [{ data: series, borderColor: c, backgroundColor: grad ?? c, fill: true, borderWidth: 2, pointRadius: 0,
      pointHoverRadius: 4, pointHoverBackgroundColor: c, pointHoverBorderColor: css("--surface"), pointHoverBorderWidth: 2, tension: 0.2 }] },
    options: {
      maintainAspectRatio: false, animation: false as const, parsing: false as const,
      interaction: { mode: "index" as const, intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...tooltipOpts(), displayColors: false,
        callbacks: { title: (i: { parsed: { x: number | null } }[]) => new Date(i[0].parsed.x ?? 0).toLocaleDateString("pt-BR"), label: (i: { parsed: { y: number | null } }) => money(i.parsed.y ?? 0) + " líquido" } } },
      scales: {
        x: { type: "linear" as const, min, max, grid: { display: false }, border: { color: css("--border") }, ticks: { ...tickOpts(), maxTicksLimit: 6, callback: timeTicks(min, max) } },
        y: { grid: gridOpts(), border: { display: false }, ticks: { ...tickOpts(), maxTicksLimit: 5, callback: (v: string | number) => "R$ " + big(Number(v)) } },
      },
    },
    plugins: [crosshair],
  };
}
