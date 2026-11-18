// Simulador de aportes: quanto se terá aportando todo mês e quando chega na meta de patrimônio ou de renda.
// Conta em Motor.simulate. As preferências ficam na carteira (preferencias.simulador), no servidor, como no app atual.
import { useHistorico, useRendaFixa, fmtPrazo, isoBR, mesAno } from "../../lib/dados";
import { usePrefCarteira } from "../../lib/preferencia";
import { big, brl, money } from "../../lib/formato";
import { nominalParaReal, PREMISSA_REAL, simulate } from "../../motor";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda, Num } from "../../componentes/Campos";
import { ErroCarteira } from "../../componentes/ErroCarteira";

type Cfg = { inicial?: number | null; aporte?: number | null; taxa?: number | null; inflacao?: number | null; meta?: number | null; renda?: number | null; real?: boolean };
const SIM_DEFAULT: Cfg = { aporte: 1000, meta: 1000000, renda: 5000, real: true };

export function Simulador() {
  const rf = useRendaFixa();
  const hist = useHistorico();
  const [simCfg, setSimCfg] = usePrefCarteira<Cfg>("simulador", SIM_DEFAULT);
  const [proj] = usePrefCarteira<{ cdi?: number | null }>("projecao", {});
  if (rf.erroCarteira) return <ErroCarteira msg={rf.erroCarteira} />;
  if (!simCfg || !hist.data && !hist.isError) return null;

  const histW = hist.data ?? {};
  const lastSnap = Object.keys(histW).sort().pop();
  const cur = rf.atuais;
  // rentabilidade padrão = o CDI que a projeção da renda fixa usa (o projetado, se o usuário mudou lá; senão o atual)
  const projCdi = cur ? proj?.cdi ?? +cur.cdi.toFixed(2) : null;
  const def = { inicial: lastSnap ? Math.round(histW[lastSnap].i) : 0, taxa: projCdi != null ? +projCdi.toFixed(2) : 12, inflacao: cur ? +cur.ipca.toFixed(2) : 4.5 };
  const cfg = { aporte: 1000, meta: 1000000, renda: 5000, real: true, ...simCfg } as Cfg;
  for (const k of ["inicial", "taxa", "inflacao"] as const) if (cfg[k] == null) cfg[k] = def[k];
  const c = cfg as { inicial: number; aporte: number; taxa: number; inflacao: number; meta: number; renda: number; real: boolean };
  const sim = simulate(c);
  const horizon = Math.min(600, Math.max(120, Math.max(sim.mMeta || 0, sim.mRenda || 0) + 24));
  const rows = sim.rows.slice(0, horizon + 1);
  const unit = c.real ? " (em reais de hoje)" : "";
  const marcos = [1, 5, 10, 15, 20, 25, 30, 40, 50].filter(a => a * 12 <= horizon);
  const start = new Date(); start.setDate(1);
  const tx = (m: number) => { const d = new Date(start); d.setMonth(d.getMonth() + m); return d.getTime(); };
  const campo = (n: keyof Cfg) => (v: number | null) => setSimCfg({ [n]: v });

  return (
    <div className="panel">
      <h2>Simulador de aportes</h2>
      <div className="hint">Quanto você terá aportando todo mês, e quando chega na sua meta de patrimônio ou de renda mensal.</div>
      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <Num rotulo="Valor inicial (R$)" min="0" step="100" valor={c.inicial} onValor={campo("inicial")} />
        <Num rotulo="Aporte mensal (R$)" min="0" step="50" valor={c.aporte} onValor={campo("aporte")} />
        <Num rotulo="Rentabilidade (% a.a.)" step="0.1" valor={c.taxa} onValor={campo("taxa")} />
        <Num rotulo="Inflação (% a.a.)" step="0.1" valor={c.inflacao} onValor={campo("inflacao")} />
        <Num rotulo="Meta de patrimônio (R$)" min="0" step="1000" valor={c.meta} onValor={campo("meta")} />
        <Num rotulo="Renda mensal desejada (R$)" min="0" step="100" valor={c.renda} onValor={campo("renda")} />
        <label className="chk"><input type="checkbox" checked={c.real} onChange={e => setSimCfg({ real: e.target.checked })} /> Mostrar em reais de hoje (descontando a inflação)</label>
        <div className="quick">
          <button type="button" title="Volta valor inicial, rentabilidade e inflação para os valores atuais" onClick={() => setSimCfg({ inicial: null, taxa: null, inflacao: null })}>Usar valores atuais</button>
          <button type="button" title="Rentabilidade que entrega 8% acima da inflação informada, em reais de hoje"
            onClick={() => setSimCfg(s => ({ ...s, taxa: +nominalParaReal(PREMISSA_REAL, s.inflacao ?? def.inflacao).toFixed(2), real: true }))}>Premissa AUVP: 8% reais</button>
        </div>
      </form>
      <div className="hint">Padrões: valor inicial = seus investimentos {lastSnap ? `(${isoBR(lastSnap)})` : "(abra a Carteira para preencher)"}, rentabilidade = CDI atual, inflação = IPCA dos últimos 12 meses. Rendimento mensal {c.real ? "real" : "nominal"} usado: {brl(sim.r * 100, 3)}%.</div>
      <div className="tiles">
        <div className="tile"><div className="k">Meta de {money(c.meta)}</div><div className="v">{sim.mMeta != null ? fmtPrazo(sim.mMeta) : "—"}</div><div className="s">{sim.mMeta != null ? "em " + mesAno(sim.mMeta) : "não atinge em 50 anos"}</div></div>
        <div className="tile"><div className="k">Renda de {money(c.renda)}/mês</div><div className="v">{sim.mRenda != null ? fmtPrazo(sim.mRenda) : "—"}</div><div className="s">{sim.mRenda != null ? `em ${mesAno(sim.mRenda)}, com ${money(sim.rows[sim.mRenda].saldo)}` : "não atinge em 50 anos"}</div></div>
        <div className="tile"><div className="k">Em 10 anos{unit}</div><div className="v">{money(sim.rows[120].saldo)}</div><div className="s">aportado {money(sim.rows[120].aportado)} · rendimentos {money(sim.rows[120].saldo - sim.rows[120].aportado)}</div></div>
      </div>
      <Legenda itens={[["Patrimônio" + unit, css("--s1")], ["Total aportado", css("--s2"), true]]} />
      <div className="proj-box">
        <Grafico rotulo="Evolução simulada do patrimônio" deps={[JSON.stringify(c), horizon]} config={canvas => configLinha(canvas, [
          { label: "Patrimônio", color: css("--s1"), data: rows.map(r => ({ x: tx(r.m), y: r.saldo })) },
          { label: "Total aportado", color: css("--s2"), dash: [5, 4], data: rows.map(r => ({ x: tx(r.m), y: r.aportado })) },
        ], { fmtY: v => "R$ " + big(v), fmtTip: v => money(v), height: 230 })} />
      </div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Prazo</th><th>Quando</th><th>Patrimônio</th><th>Total aportado</th><th>Rendimentos</th><th>Renda mensal possível</th></tr></thead>
        <tbody>{marcos.map(a => { const x = sim.rows[a * 12]; return (
          <tr key={a}><td>{a} ano{a > 1 ? "s" : ""}</td><td>{mesAno(a * 12)}</td><td><b>{money(x.saldo)}</b></td><td>{money(x.aportado)}</td><td>{money(x.saldo - x.aportado)}</td><td>{money(x.saldo * sim.r * (1 - sim.margem))}</td></tr>
        ); })}</tbody>
      </table></div>
      <div className="status">Simulação com rentabilidade constante, aporte no fim de cada mês e sem IR. "Renda mensal possível" = juros do mês{c.real ? " acima da inflação" : ""} menos 25% de margem para impostos e reinvestimento (regra do AUVP). Para uma simulação séria de longo prazo, o AUVP usa 8% ao ano acima da inflação.</div>
    </div>
  );
}
