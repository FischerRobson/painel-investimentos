// Imposto de renda do ano: mês a mês (renda variável e cripto), DARFs a pagar e o ganho anual do exterior.
import { useState } from "react";
import { money, signCls } from "../../lib/formato";
import { hojeISO, isoBR } from "../../lib/dados";
import { LIMITE_ACOES, LIMITE_CRIPTO, apurarExterior, apurarIR, type Realizado } from "../../motor";
import { Selecao, Campo } from "../../componentes/Campos";

const nomeMes = (mes: string) => { const s = new Date(mes + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "long" }); return s[0].toUpperCase() + s.slice(1); };
const Valor = ({ v }: { v: number }) => <span className={signCls(v)}>{v < 0 ? "−" : ""}{money(Math.abs(v))}</span>;

export function Impostos({ realizados }: { realizados: Realizado[] }) {
  const todos = apurarIR(realizados);
  const anos = [...new Set([...todos.map(m => +m.mes.slice(0, 4)), new Date().getFullYear()])].sort((a, b) => b - a);
  const [ano, setAno] = useState(anos[0]);
  const meses = todos.filter(m => m.mes.startsWith(String(ano)));
  const exterior = apurarExterior(realizados).find(a => a.ano === ano);
  const hoje = hojeISO();
  const darfs = meses.flatMap(m => [
    ...(m.darfRV ? [{ mes: m.mes, codigo: "6015", valor: m.darfRV, vencimento: m.vencimento }] : []),
    ...(m.darfCripto ? [{ mes: m.mes, codigo: "4600", valor: m.darfCripto, vencimento: m.vencimento }] : []),
  ]);
  const aVencer = darfs.filter(d => d.vencimento >= hoje);
  const ultimo = todos.at(-1);

  return (
    <div className="panel">
      <div className="w-head">
        <div><h2>Imposto de renda</h2><div className="hint" style={{ margin: 0 }}>Apuração mensal das vendas (renda variável e cripto). Confira com o informe da corretora antes de pagar.</div></div>
        <Campo inline rotulo="Ano"><Selecao value={ano} onChange={e => setAno(+e.target.value)} aria-label="Ano do imposto">{anos.map(a => <option key={a}>{a}</option>)}</Selecao></Campo>
      </div>
      <div className="tiles">
        <div className="tile"><div className="k">DARFs de {ano}</div><div className="v">{money(darfs.reduce((s, d) => s + d.valor, 0))}</div><div className="s">{darfs.length} {darfs.length === 1 ? "guia" : "guias"}</div></div>
        <div className="tile"><div className="k">A vencer</div><div className={"v" + (aVencer.length ? " down" : "")}>{money(aVencer.reduce((s, d) => s + d.valor, 0))}</div>
          <div className="s">{aVencer.length ? `próximo em ${isoBR(aVencer[0].vencimento)} (código ${aVencer[0].codigo})` : "nada a pagar"}</div></div>
        <div className="tile"><div className="k">Prejuízo a compensar</div><div className="v">{money(ultimo ? ultimo.prejuizoComum + ultimo.prejuizoDayTrade + ultimo.prejuizoFii : 0)}</div>
          <div className="s">{ultimo ? `comum ${money(ultimo.prejuizoComum)} · day trade ${money(ultimo.prejuizoDayTrade)} · FII ${money(ultimo.prejuizoFii)}` : "nenhuma venda ainda"}</div></div>
      </div>
      {meses.length ? <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Mês</th><th>Vendas de ações</th><th>Ações</th><th>ETF/BDR</th><th>Day trade</th><th>FII</th><th>Cripto</th><th>IRRF</th><th>DARF 6015</th><th>DARF 4600</th><th>Vencimento</th></tr></thead>
        <tbody>{meses.map(m => (
          <tr key={m.mes}>
            <td>{nomeMes(m.mes)}</td>
            <td>{money(m.vendasAcoes)}{m.vendasAcoes > 0 && <> <span className="muted">{m.acoesIsentas ? "isento" : "tributável"}</span></>}</td>
            <td><Valor v={m.lucroAcoes} /></td>
            <td><Valor v={m.lucroEtfBdr} /></td>
            <td><Valor v={m.lucroDayTrade} /></td>
            <td><Valor v={m.lucroFii} /></td>
            <td>{m.vendasCripto ? <><Valor v={m.lucroCripto} /> <span className="muted">{m.criptoIsenta ? "isento" : "tributável"}</span></> : "—"}</td>
            <td>{money(m.irrf)}</td>
            <td>{m.darfRV ? <b>{money(m.darfRV)}</b> : m.acumuladoRV ? <span className="muted" title="Abaixo de R$ 10: soma no próximo DARF">acumula {money(m.acumuladoRV)}</span> : "—"}</td>
            <td>{m.darfCripto ? <b>{money(m.darfCripto)}</b> : m.acumuladoCripto ? <span className="muted">acumula {money(m.acumuladoCripto)}</span> : "—"}</td>
            <td>{m.darfRV || m.darfCripto ? isoBR(m.vencimento) : "—"}</td>
          </tr>
        ))}</tbody>
      </table></div> : <div className="hint" style={{ marginTop: 8 }}>Nenhuma venda em {ano}.</div>}
      {exterior && <div className="hint" style={{ marginTop: 10 }}>
        <b>Exterior em {ano}:</b> resultado de <Valor v={exterior.lucro} />{exterior.base > 0 ? <>; imposto de {money(exterior.imposto)} (15% sobre {money(exterior.base)}), pago na declaração de ajuste.</> : "; nada a pagar."}
        {exterior.prejuizo > 0 && ` Prejuízo de ${money(exterior.prejuizo)} para compensar nos próximos anos.`}
      </div>}
      <div className="status" style={{ marginTop: 8 }}>
        Ações: isenção quando as vendas do mês (sem day trade) somam até {money(LIMITE_ACOES)}; acima, 15%. ETF e BDR: 15%, sem isenção, compensando prejuízo com ações.
        Day trade: 20%. FII: 20%, prejuízo só com FII. Cripto: isenção até {money(LIMITE_CRIPTO)} de vendas no mês; acima, 15% do ganho.
        O IRRF (0,005% das vendas e 1% do lucro de day trade) abate o imposto. DARF abaixo de R$ 10 soma no mês seguinte.
      </div>
    </div>
  );
}
