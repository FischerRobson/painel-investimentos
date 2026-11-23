// Declaração anual (IRPF): bens e direitos em 31/12 pelo custo e os rendimentos isentos e de tributação exclusiva.
import { useState } from "react";
import { money } from "../../lib/formato";
import { bensEDireitos, rendimentosDoAno, type Operacao, type Provento, type Realizado } from "../../motor";

export function Declaracao({ operacoes, proventos, realizados }: { operacoes: Operacao[]; proventos: Provento[]; realizados: Realizado[] }) {
  const atual = new Date().getFullYear();
  const anos = [...new Set([...operacoes.map(o => +o.data.slice(0, 4)), atual - 1, atual])].sort((a, b) => b - a);
  // até abril vale a declaração do ano anterior
  const [ano, setAno] = useState(new Date().getMonth() < 5 ? atual - 1 : atual);
  const bens = bensEDireitos(operacoes, ano);
  const r = rendimentosDoAno(proventos, realizados, ano);
  const copiar = (t: string) => { void navigator.clipboard?.writeText(t); };
  const Lista = ({ titulo, itens, extra }: { titulo: string; itens: { ativo: string; valor: number; irRetido?: number }[]; extra?: string }) => itens.length ? <>
    <h3>{titulo}</h3>
    <div className="table-wrap"><table className="w-table"><thead><tr><th>Ativo (fonte pagadora)</th><th>Valor</th>{extra && <th>{extra}</th>}</tr></thead>
      <tbody>{itens.map(i => <tr key={i.ativo}><td><span className="tk">{i.ativo}</span> <span className="muted">CNPJ: ____</span></td><td>{money(i.valor)}</td>{extra && <td>{money(i.irRetido ?? 0)}</td>}</tr>)}</tbody>
    </table></div></> : null;

  return (
    <div className="panel">
      <div className="w-head">
        <div><h2>Declaração do imposto de renda</h2><div className="hint" style={{ margin: 0 }}>Para preencher o IRPF. Os CNPJs e a corretora vêm do informe de rendimentos; confira os códigos no programa da Receita.</div></div>
        <label className="status">Ano-calendário <select value={ano} onChange={e => setAno(+e.target.value)} aria-label="Ano-calendário">{anos.map(a => <option key={a}>{a}</option>)}</select></label>
      </div>

      <h3>Bens e direitos</h3>
      {bens.length ? <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Ativo</th><th>Grupo</th><th>Código</th><th>Situação em 31/12/{ano - 1}</th><th>Situação em 31/12/{ano}</th><th>Discriminação</th></tr></thead>
        <tbody>{bens.map(b => (
          <tr key={b.ativo}>
            <td><span className="tk">{b.ativo}</span></td><td>{b.grupo}</td><td>{b.codigo}</td>
            <td>{money(b.custoAntes)}</td><td>{money(b.custo)}</td>
            <td style={{ whiteSpace: "normal", minWidth: 220 }}>{b.discriminacao} <button type="button" className="link" onClick={() => copiar(b.discriminacao)}>copiar</button></td>
          </tr>
        ))}</tbody>
      </table></div> : <div className="hint">Nenhum ativo com operações em 31/12/{ano - 1} ou 31/12/{ano}.</div>}

      <h3>Rendimentos isentos e não tributáveis</h3>
      <div className="tiles">
        <div className="tile"><div className="k">Lucros e dividendos</div><div className="v">{money(r.dividendos.reduce((s, i) => s + i.valor, 0))}</div><div className="s">{r.dividendos.length} fontes</div></div>
        <div className="tile"><div className="k">Rendimentos de FII</div><div className="v">{money(r.rendimentosFii.reduce((s, i) => s + i.valor, 0))}</div><div className="s">{r.rendimentosFii.length} fundos</div></div>
        <div className="tile"><div className="k">Lucro em ações (vendas até R$ 20 mil/mês)</div><div className="v">{money(r.lucroIsentoAcoes)}</div><div className="s">ganhos líquidos isentos</div></div>
        {r.lucroIsentoCripto > 0 && <div className="tile"><div className="k">Lucro em cripto (vendas até R$ 35 mil/mês)</div><div className="v">{money(r.lucroIsentoCripto)}</div><div className="s">ganho de capital isento</div></div>}
      </div>
      <Lista titulo="Lucros e dividendos recebidos" itens={r.dividendos} />
      <Lista titulo="Rendimentos de FII" itens={r.rendimentosFii} />
      <Lista titulo="Tributação exclusiva: juros sobre capital próprio (JCP)" itens={r.jcp} extra="IR retido" />
      <Lista titulo="Outros proventos" itens={r.outros} />
      <div className="status" style={{ marginTop: 8 }}>Ganhos tributáveis de renda variável vão mês a mês na ficha "Renda variável" (veja a apuração acima); o ganho do exterior, na ficha de aplicações no exterior.</div>
    </div>
  );
}
