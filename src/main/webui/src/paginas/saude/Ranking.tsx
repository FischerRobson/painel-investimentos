// Quem está compensando: retorno de cada ativo desde a compra contra o CDI líquido de IR no mesmo período, com a nota de hoje ao lado.
import { brl, money, pct, signCls } from "../../lib/formato";
import type { Veredicto } from "../../motor";
import type { LinhaAtivo, Saude } from "../../lib/saude";

const TEXTO: Record<Veredicto, string> = { compensando: "Compensando", "no-cdi": "No ritmo do CDI", abaixo: "Abaixo do CDI", cedo: "Pouco tempo (< 6 meses)", "sem-dados": "Sem dados" };
const COR: Record<Veredicto, string> = { compensando: "up", "no-cdi": "", abaixo: "down", cedo: "muted", "sem-dados": "muted" };
const sm = (v: number) => (v < 0 ? "−" : v > 0 ? "+" : "") + money(Math.abs(v));
const KIND: Record<LinhaAtivo["kind"], string> = { acao: "Ação", fii: "FII", cripto: "Cripto", exterior: "Exterior", rf: "Renda fixa" };

export function Ranking({ saude: s }: { saude: Saude }) {
  const linhas = [...s.ativos].sort((a, b) => (b.av?.spread ?? -999) - (a.av?.spread ?? -999));
  return (
    <div className="panel">
      <h2>Quem está compensando</h2>
      <div className="hint">Retorno anual de cada ativo (preço, proventos e taxas) contra o CDI líquido de IR nos mesmos aportes e datas. Renda variável já desconta o IR de vender hoje. É o que aconteceu, não uma previsão: leia junto da nota, que mostra os fundamentos de hoje.</div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th className="txt-sm">Ativo</th><th>Valor</th><th>Peso</th><th>Retorno a.a.</th><th>CDI líq. a.a.</th><th>Diferença</th><th>Ganho vs CDI</th><th>Nota</th><th className="txt-sm">Situação</th></tr></thead>
        <tbody>{linhas.map(a => {
          const av = a.av;
          return <tr key={a.ticker + a.kind}>
            <td className="txt-sm"><span className="tk">{a.ticker}</span><div className="muted">{KIND[a.kind]}</div></td>
            <td>{money(a.valor)}</td><td>{(a.peso * 100).toFixed(1).replace(".", ",")}%</td>
            <td>{av?.anual != null ? brl(av.anual, 1) + "%" : "—"}</td>
            <td>{av?.cdiAnual != null ? brl(av.cdiAnual, 1) + "%" : "—"}</td>
            <td className={av?.spread != null ? signCls(av.spread) : ""}>{av?.spread != null ? pct(av.spread, 1).replace("%", " p.p.") : "—"}</td>
            <td className={av?.vsCdi != null ? signCls(av.vsCdi) : ""}>{av?.vsCdi != null ? sm(av.vsCdi) : "—"}</td>
            <td>{a.nota ?? "—"}{a.cobertura != null && a.cobertura < 0.7 && <div className="muted">cobertura {Math.round(a.cobertura * 100)}%</div>}</td>
            <td className={"txt-sm " + (av ? COR[av.veredicto] : "muted")}>{av ? TEXTO[av.veredicto] : a.semOperacoes ? "Sem operações lançadas" : "—"}
              {a.incompleto && <div className="muted">saldo inicial: data e preço aproximados</div>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="status" style={{ marginTop: 6 }}>Compensando: pelo menos 2 p.p. ao ano acima do CDI líquido. Abaixo: 2 p.p. ou mais abaixo. Lance as compras em Operações para ativos sem histórico. A nota só existe para ações e FIIs com indicadores no Fundamentus.</div>
    </div>
  );
}
