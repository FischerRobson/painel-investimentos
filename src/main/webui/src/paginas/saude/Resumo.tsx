// Nota geral, subnotas e o que fazer primeiro.
import { money } from "../../lib/formato";
import type { Saude } from "../../lib/saude";

const cor = (n: number | null) => n == null ? "" : n >= 70 ? "up" : n >= 50 ? "" : "down";
const faixa = (n: number | null) => n == null ? "sem dados" : n >= 70 ? "boa" : n >= 50 ? "regular" : "pede atenção";

export function Resumo({ saude: s, avisos }: { saude: Saude; avisos: string[] }) {
  const prioridades = [
    ...s.sinais.filter(x => x.severidade === "alta"),
    ...s.subs.filter(x => x.nota != null && x.nota < 50 && x.acao).map(x => ({ id: x.id, ativo: undefined, titulo: x.nome, detalhe: x.acao! })),
    ...s.sinais.filter(x => x.severidade === "media"),
  ].slice(0, 5);
  return (
    <div className="panel">
      <div className="w-head">
        <div><h2>Saúde da carteira</h2><div className="hint" style={{ margin: 0 }}>Sinais com o número e a regra de cada um, não ordens de compra ou venda. Queda de preço, sozinha, nunca vira alerta.</div></div>
      </div>
      {avisos.map(a => <div key={a} className="status" role="status">{a}</div>)}
      <div className="tiles">
        <div className="tile"><div className="k">Nota geral</div><div className={`v ${cor(s.geral)}`}>{s.geral ?? "—"}<span className="muted" style={{ fontSize: 13 }}> / 100</span></div><div className="s">{faixa(s.geral)}</div></div>
        <div className="tile"><div className="k">Investido</div><div className="v">{money(s.total)}</div><div className="s">renda fixa, variável e cripto</div></div>
        <div className="tile"><div className="k">Proventos (12 meses)</div><div className="v">{money(s.renda.proventos12m)}</div><div className="s">{s.renda.dyCarteira != null ? `${s.renda.dyCarteira.toFixed(1).replace(".", ",")}% da renda variável` : "—"}</div></div>
        <div className="tile"><div className="k">Reserva</div><div className="v">{s.reserva.atual != null ? s.reserva.atual.toFixed(1).replace(".", ",") + " meses" : "—"}</div><div className="s">meta: {s.reserva.meses} meses · {money(s.reserva.liquidez)} em liquidez diária</div></div>
      </div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th className="txt-sm">Critério</th><th>Nota</th><th className="txt">Situação</th><th className="txt">O que fazer</th></tr></thead>
        <tbody>{s.subs.map(x => (
          <tr key={x.id}><td className="txt-sm">{x.nome}</td><td className={cor(x.nota)}><b>{x.nota ?? "—"}</b></td><td className="txt">{x.resumo}</td><td className="txt muted">{x.acao ?? "—"}</td></tr>
        ))}</tbody>
      </table></div>
      <div className="status" style={{ marginTop: 6 }}>Pesos da nota geral: reserva 20, concentração 20, qualidade 20, metas 15, FGC 15, vencimentos 10. O que não tem dado sai da média.</div>
      {prioridades.length > 0 && <>
        <h3>Para olhar primeiro</h3>
        <ul className="saude-lista">{prioridades.map(p => (
          <li key={p.id}><b>{p.ativo ? `${p.ativo}: ` : ""}{p.titulo}.</b> <span className="muted">{p.detalhe}</span></li>
        ))}</ul>
      </>}
    </div>
  );
}
