// Rebalancear vendendo: o que vender das classes acima da meta, o IR dessas vendas e onde colocar o dinheiro.
import { money } from "../../lib/formato";
import { NOME_META, planejarRebalanceamento, type Operacao } from "../../motor";
import type { PrefSaude, Saude } from "../../lib/saude";
import { Entrada, Campo } from "../../componentes/Campos";

const p1 = (v: number) => v.toFixed(1).replace(".", ",") + "%";
const quantidade = (q: number) => q.toLocaleString("pt-BR", { maximumFractionDigits: 8 });

export function Rebalancear({ saude: s, prefs, setPrefs, operacoes, hoje }: {
  saude: Saude; prefs: PrefSaude; setPrefs: (m: Partial<PrefSaude>) => void; operacoes: Operacao[]; hoje: string;
}) {
  const aporte = Math.max(0, Number(prefs.aporte.replace(",", ".")) || 0);
  const plano = s.semCotacao.length || !s.total ? null : planejarRebalanceamento({
    ativos: s.vendaveis, valores: s.valores, metas: prefs.metas, aporte, banda: prefs.banda, reservaAlvo: s.reserva.alvo, operacoes, hoje,
  });
  return (
    <div className="panel">
      <h2>Rebalancear vendendo</h2>
      <div className="hint">Aportar na classe atrasada é o jeito mais barato de voltar à meta, porque não paga IR. Vender vale quando o desvio é grande e o aporte demora demais para corrigir.
        {" "}Aqui só são vendidas as classes que passam da meta além da tolerância, e a reserva de emergência fica de fora.</div>
      <Campo inline rotulo="Tolerância (pontos percentuais acima da meta)"><Entrada type="number" min="0" max="50" step="1" value={prefs.banda} onChange={e => setPrefs({ banda: Math.min(50, Math.max(0, Number(e.target.value) || 0)) })} style={{ width: 70 }} /></Campo>
      {s.semCotacao.length > 0 && <div className="status down" role="status">Sem o valor de {s.semCotacao.join(", ")} agora. O plano fica suspenso, porque sem esses ativos as classes sairiam erradas.</div>}
      {plano && !plano.vendas.length && <>
        <div className="status" style={{ marginTop: 8 }}>{plano.naoVendido.length ? "Há classe acima da tolerância, mas nada pode ser vendido agora." : "Nada a vender: nenhuma classe passa da meta além da tolerância."}
          {aporte > 0 && " O aporte informado em “Onde aportar” já entra nessa conta."}
          {plano.aporteSemVender > 0.5 && ` Para chegar exatamente nas metas só aportando, seriam ${money(plano.aporteSemVender)}.`}</div>
      </>}
      {plano && plano.vendas.length > 0 && <>
        <div className="tiles">
          <div className="tile"><div className="k">Vender</div><div className="v">{money(plano.vendido)}</div><div className="s">{plano.vendas.length} ativo{plano.vendas.length > 1 ? "s" : ""}</div></div>
          <div className="tile"><div className="k">IR a pagar (DARF ou declaração)</div><div className="v">{money(plano.impostoAPagar)}</div>
            <div className="s">{plano.semIR.length ? "sem contar " + plano.semIR.join(", ") : "ações, FIIs, cripto e exterior"}{plano.irRetido > 0.5 && ` · na renda fixa, ${money(plano.irRetido)} já retidos`}</div></div>
          <div className="tile"><div className="k">Para reinvestir</div><div className="v">{money(plano.caixa)}</div><div className="s">{aporte > 0 ? `com o aporte de ${money(aporte)}` : "vendas menos o IR"}</div></div>
          <div className="tile"><div className="k">Sem vender</div><div className="v">{money(plano.aporteSemVender)}</div><div className="s">de aporte para chegar nas metas</div></div>
        </div>
        <h3>1. Vender</h3>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th className="txt-sm">Ativo</th><th>Quantidade</th><th>Valor</th><th>Lucro ou prejuízo</th><th className="txt">Atenção</th></tr></thead>
          <tbody>{plano.vendas.map(v => (
            <tr key={v.id}><td className="txt-sm"><span className="tk">{v.nome}</span> <span className="muted">{NOME_META[v.classe]}</span></td>
              <td>{v.qtd != null ? quantidade(v.qtd) : "resgate"}{v.total && <span className="muted"> (tudo)</span>}</td>
              <td><b>{money(v.valor)}</b></td>
              <td className={v.lucro == null ? "muted" : v.lucro >= 0 ? "up" : "down"}>{v.lucro != null ? money(v.lucro) : v.classeIR == null ? "—" : "IR desconhecido"}</td>
              <td className="txt muted">{[v.classeIR != null && v.lucro == null ? "sem operações lançadas: lance as compras em Operações" : null, v.aviso].filter(Boolean).join("; ") || "—"}</td></tr>
          ))}</tbody>
        </table></div>
        {plano.avisoIsencao && <div className="status">{plano.avisoIsencao}</div>}
        <h3>2. Reinvestir e conferir</h3>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th className="txt-sm">Classe</th><th>Hoje</th><th>Comprar</th><th>Depois</th><th>Meta</th></tr></thead>
          <tbody>{plano.depois.linhas.map((l, i) => (
            <tr key={l.classe}><td className="txt-sm">{NOME_META[l.classe]}</td><td>{p1(plano.antes.linhas[i].pct)}</td>
              <td>{plano.compras[i].valor > 0.5 ? <b>{money(plano.compras[i].valor)}</b> : "—"}</td><td>{p1(l.pct)}</td><td>{p1(l.meta)}</td></tr>
          ))}</tbody>
        </table></div>
      </>}
      {plano?.naoVendido.map(n => <div key={n.classe} className="status">{NOME_META[n.classe]}: ficam {money(n.valor)} acima da meta ({n.motivo}).</div>)}
      <div className="status">Dentro da classe, saem primeiro os ativos com IR conhecido, de menor nota e menor ganho. O IR considera as vendas já feitas no mês e os prejuízos acumulados, sem o IRRF retido pela corretora.
        {" "}Não entram spread, corretagem nem IOF. É um plano para conferir, não uma ordem de venda.</div>
    </div>
  );
}
