// Próximos meses: o que já está comprometido, somando as parcelas do cartão já lançadas (vindas das importações), os
// recorrentes (lançados ou previstos pelas regras) e outros lançamentos. Âncora é o mês de hoje, não o mês aberto.
import { useQueries } from "@tanstack/react-query";
import { money, signCls } from "../../lib/formato";
import { api, comprometidoDoMes, mesDe, somaMeses, tituloMes, type DocRecorrentes } from "../../lib/orcamento";
import { EsqueletoPainel } from "../../componentes/Esqueleto";

const MESES = 6;
const sinal = (v: number) => v > 0 ? "+" : v < 0 ? "−" : "";

export function Proximos({ doc }: { doc: DocRecorrentes }) {
  const hoje = mesDe(new Date());
  const meses = Array.from({ length: MESES }, (_, i) => somaMeses(hoje, i + 1));
  const consultas = useQueries({
    queries: meses.map(m => ({ queryKey: ["orcamento-futuro", m], queryFn: () => api.lerMes(m), staleTime: 60_000, retry: false })),
  });
  if (consultas.some(c => c.isPending)) return <EsqueletoPainel tiles={0} linhas={6} colunas={4} texto="Calculando os próximos meses…" />;
  const linhas = meses.map((m, i) => comprometidoDoMes(m, consultas[i].data ?? { incomes: [], expenses: [] }, doc));
  if (!linhas.some(l => l.total > 0 || l.entradas > 0)) return null;
  const parcelas = linhas.reduce((s, l) => s + l.parcelas, 0), total = linhas.reduce((s, l) => s + l.total, 0);
  const erro = consultas.some(c => c.isError);

  return (
    <div className="panel">
      <h2>Próximos meses</h2>
      <div className="hint">O que já está comprometido: parcelas do cartão lançadas nas importações, lançamentos recorrentes (previstos pelas regras até serem criados) e outros lançamentos já feitos nesses meses.</div>
      <div className="tiles">
        <div className="tile"><div className="k">Comprometido em {MESES} meses</div><div className="v">{money(total)}</div><div className="s">{money(total / MESES)} por mês, em média</div></div>
        <div className="tile"><div className="k">Só em parcelas do cartão</div><div className="v">{money(parcelas)}</div>
          <div className="s">{linhas[0].qtdParcelas ? `${linhas[0].qtdParcelas} em ${tituloMes(linhas[0].mes).toLowerCase()}` : "nenhuma parcela lançada"}</div></div>
      </div>
      <div className="table-wrap"><table className="w-table b-table">
        <thead><tr><th className="b-left">Mês</th><th>Parcelas</th><th>Recorrentes</th><th>Outros</th><th>Comprometido</th><th>Entradas previstas</th><th>Sobra prevista</th></tr></thead>
        <tbody>{linhas.map(l => {
          const sobra = l.entradas - l.total;
          return (
            <tr key={l.mes}>
              <td className="b-left">{tituloMes(l.mes)}</td>
              <td>{money(l.parcelas)}{l.qtdParcelas > 0 && <> <span className="muted">({l.qtdParcelas})</span></>}</td>
              <td>{money(l.recorrentes)}</td><td>{money(l.outros)}</td>
              <td><strong>{money(l.total)}</strong></td>
              <td>{l.entradas ? money(l.entradas) : <span className="muted">—</span>}</td>
              <td>{l.entradas ? <span className={signCls(sobra)}>{sinal(sobra)}{money(Math.abs(sobra))}</span> : <span className="muted">—</span>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="status">{erro ? "Não consegui ler algum dos meses; o total pode estar menor. " : ""}
        Entradas previstas são só as que você já lançou ou configurou como recorrentes (salário, por exemplo).</div>
    </div>
  );
}
