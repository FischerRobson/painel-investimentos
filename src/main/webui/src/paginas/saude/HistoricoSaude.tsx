// Nota geral mês a mês (gravada quando você abre a página).
import type { RegistroMes } from "../../lib/saude";
import { tituloMes } from "../../lib/orcamento";

export function HistoricoSaude({ hist }: { hist: Record<string, RegistroMes> }) {
  const meses = Object.keys(hist).sort().slice(-12);
  if (meses.length < 1) return null;
  return (
    <div className="panel">
      <h2>Histórico da saúde</h2>
      <div className="hint">A nota do mês é gravada quando você abre esta página (uma por mês, atualizada se mudar). Serve para ver se a carteira melhora e há quantos meses um ativo está fraco.</div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Mês</th><th>Nota geral</th><th>Variação</th><th>Ativos com nota</th></tr></thead>
        <tbody>{[...meses].reverse().map((m, i, arr) => {
          const ant = arr[i + 1] ? hist[arr[i + 1]].geral : null, g = hist[m].geral;
          const d = g != null && ant != null ? g - ant : null;
          return <tr key={m}><td>{tituloMes(m)}</td><td><b>{g ?? "—"}</b></td><td className={d == null ? "muted" : d > 0 ? "up" : d < 0 ? "down" : "muted"}>{d == null ? "—" : (d > 0 ? "+" : "") + d}</td><td className="muted">{Object.keys(hist[m].ativos).length}</td></tr>;
        })}</tbody>
      </table></div>
    </div>
  );
}
