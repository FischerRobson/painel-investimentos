// Onde aportar: a reserva de emergência primeiro, depois as classes abaixo da meta e, em ações e FIIs, os ativos de melhor nota.
import { brl, money } from "../../lib/formato";
import { NOME_META, type ClasseMeta } from "../../motor";
import type { PrefSaude, Saude } from "../../lib/saude";

export function Aportar({ saude: s, prefs, setPrefs }: { saude: Saude; prefs: PrefSaude; setPrefs: (m: Partial<PrefSaude>) => void }) {
  const a = s.aporte;
  const dica: Partial<Record<ClasseMeta, string>> = { rf: "Tesouro Selic ou CDB de liquidez diária se a reserva está incompleta; senão compare na ferramenta Comparador.", exterior: "ETF ou BDR de índice amplo, em vários aportes.", cripto: "Parcela pequena e fixa; é a classe mais volátil." };
  return (
    <div className="panel">
      <h2>Onde aportar</h2>
      <div className="hint">Ordem: 1) completar a reserva de emergência; 2) classes mais abaixo da meta; 3) em ações e FIIs, ativos com nota ≥ 60, sem alerta grave, abaixo de 15% da carteira, e preço atraente (Graham, P/VP).</div>
      <label className="status">Aporte deste mês (R$) <input type="number" min="0" step="50" value={prefs.aporte} onChange={e => setPrefs({ aporte: e.target.value })} style={{ width: 120 }} placeholder="Ex.: 2000" /></label>
      {!a && <div className="hint" style={{ marginTop: 8 }}>Informe o valor para ver a divisão.</div>}
      {a && <>
        <div className="table-wrap" style={{ marginTop: 10 }}><table className="w-table">
          <thead><tr><th className="txt-sm">Classe</th><th>Aportar</th><th className="txt">Por quê</th><th className="txt">Como</th></tr></thead>
          <tbody>{a.partes.filter(p => p.valor > 0.5).map(p => (
            <tr key={p.classe}><td className="txt-sm">{NOME_META[p.classe]}</td><td><b>{money(p.valor)}</b>{p.reserva > 0 && <div className="muted">{money(p.reserva)} na reserva</div>}</td><td className="txt">{p.motivo}</td>
              <td className="txt">{a.compras[p.classe]?.length
                ? a.compras[p.classe].map(c => <div key={c.ticker}><span className="tk">{c.ticker}</span> {c.qtd} cota{c.qtd > 1 ? "s" : ""} ≈ {money(c.valor)} <span className="muted">({c.motivo})</span></div>)
                : <span className="muted">{a.compras[p.classe] ? "Nenhum ativo passa nos filtros agora: espere ou acrescente candidatos em “Trocas”." : dica[p.classe] ?? "—"}</span>}</td></tr>
          ))}</tbody>
        </table></div>
        {s.reserva.falta > 0 && <div className="status" style={{ marginTop: 6 }}>Reserva incompleta: faltam {money(s.reserva.falta)} (R$ {brl(s.reserva.liquidez, 0)} de {money(s.reserva.liquidez + s.reserva.falta)}).</div>}
      </>}
    </div>
  );
}
