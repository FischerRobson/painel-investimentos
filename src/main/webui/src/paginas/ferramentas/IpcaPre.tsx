// IPCA+ × Prefixado: inflação de equilíbrio, quem ganha com a inflação escolhida e cenários. Conta em Motor.ipcaVsPre.
// As duas taxas podem vir do Tesouro Direto (/api/tesouro): os títulos com vencimento mais perto do prazo.
import { Link } from "react-router";
import { hojeISO, isoBR, useRendaFixa, useTesouro } from "../../lib/dados";
import { usePreferencia } from "../../lib/preferencia";
import { big, brl, money, pct, signCls } from "../../lib/formato";
import { aliqIR, daquiAnos, fatorIpca, fatorPre, ipcaEquilibrio, ipcaVsPre, tesouroMaisProximo } from "../../motor";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda, Num } from "../../componentes/Campos";

type Cfg = { valor?: number; anos?: number; pre?: number; real?: number; ipca?: number };

export function IpcaPre() {
  const { atuais: cur } = useRendaFixa();
  const tesouro = useTesouro().data;
  const [ipCfg, setIpCfg] = usePreferencia<Cfg>("ipcaPre", {});
  const cfg = { valor: 10000, anos: 5, pre: 12, real: 6.5, ...ipCfg } as Required<Cfg>;
  if (cfg.ipca == null) cfg.ipca = cur ? +cur.ipca.toFixed(2) : 4.5;
  // campo vazio sai da preferência (volta ao padrão)
  const campo = (n: keyof Cfg) => (v: number | null) => setIpCfg(c => { const x = { ...c }; if (v == null) delete x[n]; else x[n] = v; return x; });
  const setIpca = (v: number) => setIpCfg({ ipca: Math.round(v * 1e4) / 1e4 });
  const alvo = daquiAnos(hojeISO(), cfg.anos || 1);
  const tdPre = tesouroMaisProximo(tesouro, "Tesouro Prefixado", alvo), tdIpca = tesouroMaisProximo(tesouro, "Tesouro IPCA+", alvo);
  const usaTesouro = tdPre && tdIpca && cfg.pre === tdPre.taxaCompra && cfg.real === tdIpca.taxaCompra;

  return (
    <div className="panel">
      <h2>IPCA+ × Prefixado</h2>
      <div className="hint">Um <Link to="/glossario#tesouro-prefixado">Prefixado</Link> paga uma taxa fixa; um <Link to="/glossario#tesouro-ipca">IPCA+</Link> paga a inflação mais um juro real.
        {" "}Qual dos dois rende mais depende da inflação média até o vencimento. Arraste a inflação e veja quem ganha.</div>
      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <Num rotulo="Valor investido (R$)" min="0" step="100" valor={cfg.valor} onValor={campo("valor")} aoDigitar />
        <Num rotulo="Prazo até o vencimento (anos)" min="0.5" max="40" step="0.5" valor={cfg.anos} onValor={campo("anos")} aoDigitar />
        <Num rotulo="Prefixado (% a.a.)" min="0" step="0.01" valor={cfg.pre} onValor={campo("pre")} aoDigitar />
        <Num rotulo="IPCA+: juro real (% a.a.)" min="0" step="0.01" valor={cfg.real} onValor={campo("real")} aoDigitar />
        <label className="ip-slider">Inflação média que você espera (IPCA % a.a.): <b>{brl(cfg.ipca)}%</b>
          <input type="range" min="0" max="15" step="0.01" value={cfg.ipca} onChange={e => campo("ipca")(Number(e.target.value))} />
        </label>
        <div className="quick">
          {[1, 2, 5, 10, 20].map(a => <button key={a} type="button" onClick={() => setIpCfg({ anos: a })}>{a} ano{a > 1 ? "s" : ""}</button>)}
          <button type="button" onClick={() => setIpca(ipcaEquilibrio(cfg.pre, cfg.real))}>Inflação de equilíbrio</button>
          {cur && <button type="button" title="IPCA acumulado nos últimos 12 meses" onClick={() => setIpca(cur.ipca)}>IPCA atual ({brl(cur.ipca)}%)</button>}
          {tdPre && tdIpca && <button type="button" title="Taxas de compra do Tesouro Direto com vencimento mais perto do prazo"
            onClick={() => setIpCfg({ pre: tdPre.taxaCompra!, real: tdIpca.taxaCompra! })}>Taxas do Tesouro hoje</button>}
        </div>
      </form>
      {usaTesouro && <div className="hint">Taxas do Tesouro Direto em {isoBR(tesouro!.data)}: {tdPre.tipo} {tdPre.vencimento.slice(0, 4)} e {tdIpca.tipo} {tdIpca.vencimento.slice(0, 4)}
        {tdPre.vencimento !== tdIpca.vencimento ? " (vencimentos diferentes: o Tesouro não tem os dois no mesmo ano)" : ""}.</div>}
      <Resultado cfg={cfg} />
    </div>
  );
}

function Resultado({ cfg }: { cfg: Required<Cfg> }) {
  if (!(cfg.valor > 0) || !(cfg.anos > 0) || cfg.pre < 0 || cfg.real < 0) {
    return <div className="hint" style={{ marginTop: 10 }}>Preencha valor, prazo e as duas taxas para ver a comparação.</div>;
  }
  const r = ipcaVsPre(cfg);
  const eq = r.equilibrio;
  // a inflação vem arredondada (slider de 0,01): até meio centésimo do equilíbrio conta como empate
  const perto = (ipca: number) => Math.abs(ipca - eq) < 0.006;
  const vencedor = perto(cfg.ipca) ? "empate" : r.vencedor;
  const nomePre = `Prefixado ${brl(cfg.pre)}%`, nomeIpca = `IPCA + ${brl(cfg.real)}%`;
  const prazo = cfg.anos === 1 ? "1 ano" : brl(cfg.anos, cfg.anos % 1 ? 1 : 0) + " anos";
  const ganha = { pre: "Prefixado", ipca: "IPCA+", empate: "Empate" }[vencedor];
  const base = Math.min(r.pre.liquido, r.ipca.liquido);
  // cenários de inflação: fixos + equilíbrio + o escolhido
  // o equilíbrio entra com o valor exato (arredondado mostraria uma diferença de centavos num "empate")
  const ipcas = [...new Set([3, 4, 6, 8, cfg.ipca].map(v => Math.round(v * 100) / 100))].filter(v => !perto(v)).concat(eq).sort((a, b) => a - b);

  const meses = Math.max(1, Math.round(cfg.anos * 12));
  const start = new Date(); start.setDate(1);
  const tx = (m: number) => { const d = new Date(start); d.setMonth(d.getMonth() + m); return d.getTime(); };
  const pts = (f: (anos: number) => number) => Array.from({ length: meses + 1 }, (_, m) => ({ x: tx(m), y: cfg.valor * f(m / 12) }));

  return <>
    <div className="tiles">
      <div className="tile"><div className="k">Inflação de equilíbrio</div><div className="v">{brl(eq)}% a.a.</div><div className="s">acima disso o IPCA+ ganha; abaixo, o Prefixado</div></div>
      <div className="tile"><div className="k">{nomePre} em {prazo}</div><div className="v">{money(r.pre.liquido)}</div><div className="s">líquido de IR · {money(r.pre.real)} em reais de hoje</div></div>
      <div className="tile"><div className="k">{nomeIpca} com IPCA de {brl(cfg.ipca)}%</div><div className="v">{money(r.ipca.liquido)}</div><div className="s">líquido de IR · {money(r.ipca.real)} em reais de hoje</div></div>
      <div className="tile"><div className="k">Com IPCA de {brl(cfg.ipca)}%, quem ganha</div><div className={"v " + (vencedor === "empate" ? "" : "up")}>{ganha}</div>
        <div className="s">{vencedor === "empate" ? "os dois rendem o mesmo" : `+${money(Math.abs(r.dif))} líquido (${pct(Math.abs(r.dif) / base * 100)})`}</div></div>
    </div>
    <Legenda itens={[[nomePre, css("--s1")], [`${nomeIpca} com IPCA de ${brl(cfg.ipca)}%`, css("--s2")], ["Valor investido", css("--text-3"), true]]} />
    <div className="proj-box">
      <Grafico rotulo="Valor bruto acumulado do Prefixado e do IPCA+ até o vencimento" deps={[cfg.valor, cfg.anos, cfg.pre, cfg.real, cfg.ipca]} config={canvas => configLinha(canvas, [
        { label: nomePre, color: css("--s1"), data: pts(a => fatorPre(cfg.pre, a)) },
        { label: `${nomeIpca} (IPCA ${brl(cfg.ipca)}%)`, color: css("--s2"), data: pts(a => fatorIpca(cfg.real, cfg.ipca, a)) },
        { label: "Valor investido", color: css("--text-3"), dash: [5, 4], data: pts(() => 1) },
      ], { fill: false, fmtY: v => "R$ " + big(v), fmtTip: v => money(v), height: 230 })} />
    </div>
    <h3>Cenários de inflação</h3>
    <div className="table-wrap"><table className="w-table">
      <thead><tr><th>IPCA médio (a.a.)</th><th>{nomePre}</th><th>{nomeIpca}</th><th>IPCA+ − Prefixado</th><th>Quem ganha</th></tr></thead>
      <tbody>{ipcas.map(ipca => {
        const x = ipcaVsPre({ ...cfg, ipca });
        const isEq = perto(ipca), on = perto(cfg.ipca) ? isEq : ipca === Math.round(cfg.ipca * 100) / 100;
        const quem = isEq ? "Empate" : x.vencedor === "ipca" ? "IPCA+" : "Prefixado";
        return (
          <tr key={ipca} className={on ? "on-row" : ""}>
            <td>{brl(ipca)}%{isEq && <> <span className="muted">equilíbrio</span></>}{on && !isEq && <> <span className="muted">sua escolha</span></>}</td>
            <td>{money(x.pre.liquido)}</td><td>{money(x.ipca.liquido)}</td>
            <td className={isEq ? "muted" : signCls(x.dif)}>{isEq ? "—" : (x.dif > 0 ? "+" : "−") + money(Math.abs(x.dif))}</td>
            <td><b>{quem}</b></td>
          </tr>
        );
      })}</tbody>
    </table></div>
    <div className="status">Valores no vencimento, líquidos de IR ({brl(aliqIR(Math.round(cfg.anos * 365)) * 100, 1)}% para {prazo}). O gráfico mostra o valor bruto.
      {" "}Como os dois títulos pagam a mesma alíquota no mesmo prazo, o IR não muda a inflação de equilíbrio.
      {" "}Conta simplificada: inflação constante (média geométrica), capitalização anual, sem a taxa de custódia da B3 e sem as convenções de dias úteis e de VNA do Tesouro.
      {" "}Vender antes do vencimento muda tudo: o preço passa a depender da taxa de mercado do dia (<Link to="/glossario#marcacao-a-mercado">marcação a mercado</Link>).</div>
  </>;
}
