// Quando reduzir (sinais objetivos, com o IR da venda) e quando trocar (substituto do mesmo setor, com o custo da troca).
import { money } from "../../lib/formato";
import type { Troca } from "../../motor";
import type { PrefSaude, Saude } from "../../lib/saude";

const COR = { alta: "down", media: "", info: "muted" } as const;
const NOME = { alta: "Atenção", media: "Revisar", info: "Informação" } as const;
const VEREDICTO: Record<Troca["veredicto"], [string, string]> = { vale: ["Vale trocar", "up"], avaliar: ["Avaliar", ""], "nao-vale": ["Não vale agora", "down"] };

export function Sinais({ saude: s, prefs, setPrefs }: { saude: Saude; prefs: PrefSaude; setPrefs: (m: Partial<PrefSaude>) => void }) {
  const por = new Map(s.ativos.map(a => [a.ticker, a]));
  return <>
    <div className="panel">
      <h2>Quando reduzir ou sair</h2>
      <div className="hint">Só aparece com motivo objetivo: nota baixa que persiste, armadilha de FII, concentração, rendimento abaixo do CDI, título que já entregou o ganho ou vence logo. Queda de preço não entra. Vender é decisão sua: confira a tese de compra antes.</div>
      {s.sinais.length === 0 ? <div className="hint" style={{ margin: 0 }}>Nenhum sinal agora.</div> : (
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th className="txt-sm">Ativo</th><th className="txt">Sinal</th><th className="txt">Detalhe</th><th>IR de vender tudo</th></tr></thead>
          <tbody>{s.sinais.map(x => {
            const a = x.ativo ? por.get(x.ativo) : undefined;
            return <tr key={x.id}>
              <td className="txt-sm"><span className="tk">{x.ativo ?? "—"}</span></td>
              <td className={"txt " + COR[x.severidade]}><b>{NOME[x.severidade]}:</b> {x.titulo}</td>
              <td className="txt muted">{x.detalhe}</td>
              <td>{a && a.liquidoVenda != null && a.kind !== "rf" ? money(a.valor - a.liquidoVenda) : a?.semOperacoes ? <span className="muted">sem operações</span> : "—"}</td>
            </tr>;
          })}</tbody>
        </table></div>
      )}
    </div>
    <div className="panel">
      <h2>Trocas</h2>
      <div className="hint">Para cada ação ou FII fraco (nota abaixo de 50, ou abaixo do CDI com nota abaixo de 60), procura um substituto do mesmo setor (ações) ou tipo (FIIs) com nota pelo menos 15 pontos maior. O veredicto compara o IR da venda com a renda extra em proventos do substituto.</div>
      <label className="status">Outros ativos para considerar (separe por vírgula) <input value={prefs.candidatos} onChange={e => setPrefs({ candidatos: e.target.value })} style={{ width: 260 }} placeholder="Ex.: BBAS3, KNCR11, HGLG11" /></label>
      {s.trocas.length === 0 ? <div className="hint" style={{ marginTop: 8 }}>Nenhuma troca a sugerir: nenhum ativo fraco tem um substituto claramente melhor.</div> : (
        <div className="table-wrap" style={{ marginTop: 10 }}><table className="w-table">
          <thead><tr><th className="txt-sm">Sair de</th><th className="txt-sm">Entrar em</th><th>Notas</th><th>IR da troca</th><th className="txt-sm">Veredicto</th><th className="txt">Por quê</th></tr></thead>
          <tbody>{s.trocas.map(t => {
            const [txt, cor] = VEREDICTO[t.veredicto];
            return <tr key={t.de}>
              <td className="txt-sm"><span className="tk">{t.de}</span></td><td className="txt-sm"><span className="tk">{t.para}</span></td><td>{t.notaDe} → {t.notaPara}</td>
              <td>{t.custo.isento ? "isento" : t.custo.prejuizo ? "prejuízo (sem IR)" : money(t.custo.ir)}</td>
              <td className={"txt-sm " + cor}><b>{txt}</b></td><td className="txt muted">{t.motivos.join("; ")}.</td>
            </tr>;
          })}</tbody>
        </table></div>
      )}
      <div className="status" style={{ marginTop: 6 }}>Cálculo sem taxas de corretagem e com a isenção de R$ 20 mil/mês em ações só se as vendas do mês permitirem. Mudar de ativo também troca o risco: confira o substituto no Analisador antes.</div>
    </div>
  </>;
}
