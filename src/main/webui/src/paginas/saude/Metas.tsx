// Metas por classe e reserva de emergência: o que você quer, o que tem e quanto aportar para corrigir sem vender.
import { money } from "../../lib/formato";
import { CLASSES_META, METAS_PADRAO, NOME_META, type ClasseMeta } from "../../motor";
import type { PrefSaude, Saude } from "../../lib/saude";
import { Entrada, Campo } from "../../componentes/Campos";

export function Metas({ saude: s, prefs, setPrefs }: { saude: Saude; prefs: PrefSaude; setPrefs: (m: Partial<PrefSaude>) => void }) {
  const soma = CLASSES_META.reduce((a, c) => a + (prefs.metas[c] || 0), 0);
  const muda = (c: ClasseMeta, v: string) => setPrefs({ metas: { ...prefs.metas, [c]: Math.max(0, Number(v) || 0) } });
  return (
    <div className="panel">
      <h2>Metas por classe</h2>
      <div className="hint">O padrão é só um ponto de partida: ajuste ao seu perfil e prazo. Se a soma não der 100%, as metas são proporcionais.</div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Classe</th><th>Valor</th><th>Hoje</th><th>Meta (%)</th><th>Desvio</th><th>Aportar para chegar</th></tr></thead>
        <tbody>{s.linhas.map(l => (
          <tr key={l.classe}>
            <td>{NOME_META[l.classe]}</td><td>{money(l.valor)}</td><td>{l.pct.toFixed(1).replace(".", ",")}%</td>
            <td><Entrada type="number" min="0" max="100" step="1" value={prefs.metas[l.classe]} onChange={e => muda(l.classe, e.target.value)} aria-label={`Meta de ${NOME_META[l.classe]}`} /></td>
            <td className={Math.abs(l.desvio) < 3 ? "" : l.desvio > 0 ? "muted" : "down"}>{(l.desvio > 0 ? "+" : "") + l.desvio.toFixed(1).replace(".", ",")} p.p.</td>
            <td>{l.falta > 0.5 ? money(l.falta) : "—"}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="w-head" style={{ marginTop: 8 }}>
        <span className="status">Soma das metas: {soma}%{soma !== 100 && " (proporcional)"} · <button type="button" className="link" onClick={() => setPrefs({ metas: METAS_PADRAO })}>Restaurar padrão</button></span>
        <Campo inline rotulo="Reserva de emergência (meses de custos fixos)"><Entrada type="number" min="1" max="24" step="1" value={prefs.meses} onChange={e => setPrefs({ meses: Math.max(1, Number(e.target.value) || 6) })} style={{ width: 70 }} /></Campo>
      </div>
      <div className="status">Moedas e bens ficam fora das metas. A coluna “Aportar para chegar” é o que cada classe precisa para atingir a meta sem vender nada.</div>
    </div>
  );
}
