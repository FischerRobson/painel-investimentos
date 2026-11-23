// Proventos recebidos: lançados à mão ou aceitos das sugestões (histórico de pagamentos × quantidade na data-ex).
import { useState } from "react";
import { money } from "../../lib/formato";
import { hojeISO, isoBR } from "../../lib/dados";
import { operacoesStore, novoIdOp } from "../../lib/operacoes";
import { sugerirProventos, type Operacao, type Provento, type TipoProvento } from "../../motor";

const NOME: Record<TipoProvento, string> = { dividendo: "Dividendo", jcp: "JCP", rendimento: "Rendimento (FII)", outro: "Outro" };

export function Proventos({ operacoes, proventos, historico }: {
  operacoes: Operacao[]; proventos: Provento[]; historico: Record<string, { date: string; amount: number }[]>;
}) {
  const anos = [...new Set([...proventos.map(p => +p.data.slice(0, 4)), new Date().getFullYear()])].sort((a, b) => b - a);
  const [ano, setAno] = useState(anos[0]);
  const [f, setF] = useState({ data: hojeISO(), ativo: "", tipo: "dividendo" as TipoProvento, valor: "", irRetido: "" });
  const doAno = proventos.filter(p => p.data.startsWith(String(ano))).sort((a, b) => b.data.localeCompare(a.data));
  const total = (t?: TipoProvento) => doAno.filter(p => !t || p.tipo === t).reduce((s, p) => s + p.valor, 0);
  const sugestoes = sugerirProventos(operacoes, historico, proventos).filter(s => s.data <= hojeISO());

  const lancar = (e: React.FormEvent) => {
    e.preventDefault();
    const ativo = f.ativo.trim().toUpperCase(), valor = Number(f.valor);
    if (!ativo || !(valor > 0)) return;
    operacoesStore.mudarProventos(ps => [...ps, { id: novoIdOp(), data: f.data, ativo, tipo: f.tipo, valor, ...(f.irRetido ? { irRetido: Number(f.irRetido) } : {}) }]);
    setF({ ...f, ativo: "", valor: "", irRetido: "" });
  };
  const aceitar = (s: Provento) => operacoesStore.mudarProventos(ps => [...ps, { ...s, id: novoIdOp() }]);
  const remover = (p: Provento) => { if (confirm(`Remover o provento de ${p.ativo} de ${isoBR(p.data)} (${money(p.valor)})?`)) operacoesStore.mudarProventos(ps => ps.filter(x => x.id !== p.id)); };

  return (
    <div className="panel">
      <div className="w-head">
        <div><h2>Proventos recebidos</h2><div className="hint" style={{ margin: 0 }}>O que caiu na conta: entra na declaração e na rentabilidade. Confira os valores com o extrato da corretora.</div></div>
        <label className="status">Ano <select value={ano} onChange={e => setAno(+e.target.value)} aria-label="Ano dos proventos">{anos.map(a => <option key={a}>{a}</option>)}</select></label>
      </div>
      <div className="tiles">
        <div className="tile"><div className="k">Total em {ano}</div><div className="v">{money(total())}</div><div className="s">{doAno.length} pagamentos</div></div>
        <div className="tile"><div className="k">Dividendos e FIIs</div><div className="v">{money(total("dividendo") + total("rendimento"))}</div><div className="s">isentos</div></div>
        <div className="tile"><div className="k">JCP</div><div className="v">{money(total("jcp"))}</div><div className="s">líquido (15% retido na fonte)</div></div>
      </div>

      {sugestoes.length > 0 && <>
        <h3>Sugestões a partir do histórico de pagamentos</h3>
        <div className="hint">Valor por ação × a quantidade que você tinha na véspera da data-ex. O Yahoo não separa JCP de dividendo: ajuste depois se precisar.</div>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th>Data-ex</th><th>Ativo</th><th>Tipo</th><th>Valor</th><th></th></tr></thead>
          <tbody>{sugestoes.slice(0, 12).map(s => (
            <tr key={s.id}><td>{isoBR(s.data)}</td><td><span className="tk">{s.ativo}</span></td><td>{NOME[s.tipo]}</td><td>{money(s.valor)}</td>
              <td><button type="button" className="link" onClick={() => aceitar(s)}>Adicionar</button></td></tr>
          ))}</tbody>
        </table></div>
        {sugestoes.length > 12 && <div className="status">Mais {sugestoes.length - 12} sugestões aparecem conforme você adiciona estas.</div>}
      </>}

      <h3>Lançar provento</h3>
      <form className="w-add rf-form" onSubmit={lancar}>
        <label>Data<input type="date" required max={hojeISO()} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
        <label>Ativo<input required placeholder="Ex.: ITSA4" style={{ textTransform: "uppercase" }} value={f.ativo} onChange={e => setF({ ...f, ativo: e.target.value })} /></label>
        <label>Tipo<select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as TipoProvento })}>{(Object.keys(NOME) as TipoProvento[]).map(t => <option key={t} value={t}>{NOME[t]}</option>)}</select></label>
        <label>Valor recebido (R$)<input type="number" step="0.01" min="0.01" required value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></label>
        {f.tipo === "jcp" && <label>IR retido (R$)<input type="number" step="0.01" min="0" value={f.irRetido} onChange={e => setF({ ...f, irRetido: e.target.value })} /></label>}
        <button className="primary" type="submit">Lançar</button>
      </form>

      {doAno.length > 0 ? <div className="table-wrap" style={{ marginTop: 10 }}><table className="w-table">
        <thead><tr><th>Data</th><th>Ativo</th><th>Tipo</th><th>Valor</th><th>IR retido</th><th></th></tr></thead>
        <tbody>{doAno.map(p => (
          <tr key={p.id}><td>{isoBR(p.data)}</td><td><span className="tk">{p.ativo}</span></td><td>{NOME[p.tipo]}</td><td>{money(p.valor)}</td><td>{p.irRetido ? money(p.irRetido) : "—"}</td>
            <td><button className="x" title="Remover" aria-label={`Remover provento de ${p.ativo}`} onClick={() => remover(p)}>×</button></td></tr>
        ))}</tbody>
      </table></div> : <div className="hint" style={{ marginTop: 8 }}>Nenhum provento lançado em {ano}.</div>}
    </div>
  );
}
