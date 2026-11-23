// Operações: compras, vendas e eventos de ações, FIIs, ETFs, BDRs, exterior e cripto. Daqui saem o preço médio, o lucro
// realizado, o imposto de renda mensal, os proventos e a declaração anual (contas em motor/operacoes.ts).
// Ativos que já estavam na carteira antes das operações pedem um saldo inicial (data e preço médio).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTitulo } from "../../lib/useTitulo";
import { apiFetch, getJson } from "../../lib/api";
import { useCambio } from "../../lib/cambio";
import { hojeISO, isoBR } from "../../lib/dados";
import { brl, money, pct, signCls } from "../../lib/formato";
import { operacoesStore, useOperacoes } from "../../lib/operacoes";
import { NOME_CLASSE, NOME_TIPO, processar, type Classe, type Operacao } from "../../motor";
import type { ItemAtivo, PrecoCripto } from "../../lib/composicao";
import { ErroCarteira } from "../../componentes/ErroCarteira";
import { FormOperacao } from "./FormOperacao";
import { Impostos } from "./Impostos";
import { Proventos } from "./Proventos";
import { Declaracao } from "./Declaracao";

type Pos = { t: string; q: number };
type ItemComProventos = ItemAtivo & { dividends?: { date: number; amount: number }[] };

export function Operacoes() {
  useTitulo("Operações");
  const { doc, erro, operacoes, proventos } = useOperacoes();
  const [editando, setEditando] = useState<Operacao | null>(null);
  const [anoLista, setAnoLista] = useState<number | "todos">("todos");

  const acoes = (doc?.acoesFiis ?? []) as Pos[], cripto = (doc?.cripto ?? []) as Pos[];
  const tickers = [...new Set([...acoes.map(p => p.t), ...operacoes.filter(o => o.classe !== "cripto").map(o => o.ativo)])];
  const coins = [...new Set([...cripto.map(p => p.t), ...operacoes.filter(o => o.classe === "cripto").map(o => o.ativo)])];
  const cotas = useQuery({
    queryKey: ["data", "1mo", tickers.join(",")], enabled: tickers.length > 0,
    queryFn: () => getJson<{ items: ItemComProventos[] }>(`/api/data?range=1mo&symbols=${encodeURIComponent(tickers.join(","))}`),
    placeholderData: prev => prev,
  });
  const precoCripto = useQuery({
    queryKey: ["crypto", coins.join(",")], enabled: coins.length > 0, retry: false,
    queryFn: async () => (await (await apiFetch(`/api/crypto?coins=${coins.join(",")}`)).json()) as { prices?: Record<string, PrecoCripto> },
  });
  const cambio = useCambio(30);

  if (erro) return <ErroCarteira msg={erro} />;
  if (!doc) return <div className="panel muted">Carregando as operações…</div>;

  const itens = Object.fromEntries((cotas.data?.items ?? []).map(i => [i.ticker, i]));
  const fx = (cur?: string) => !cur || cur === "BRL" ? 1 : cambio.data?.quotes[cur]?.bid;
  const precoAtual = (classe: Classe, ativo: string): number | null => {
    if (classe === "cripto") return precoCripto.data?.prices?.[ativo]?.price ?? null;
    const it = itens[ativo], r = fx(it?.currency);
    return it?.price != null && r != null ? it.price * r : null;
  };
  const { posicoes, realizados, alertas } = processar(operacoes);
  const comOps = new Set(operacoes.map(o => o.ativo));
  const pendentes = [...acoes.map(p => ({ ...p, cripto: false })), ...cripto.map(p => ({ ...p, cripto: true }))].filter(p => p.q > 0 && !comOps.has(p.t));
  const classeDe = (ativo: string): Classe | undefined => {
    const ult = [...operacoes].reverse().find(o => o.ativo === ativo);
    if (ult) return ult.classe;
    const t = itens[ativo]?.type;
    return t === "FII" ? "fii" : t === "Exterior" ? "exterior" : undefined;
  };
  const historico = Object.fromEntries(Object.values(itens).map(i => [i.ticker, (i.dividends ?? []).map(d => ({ date: new Date(d.date).toLocaleDateString("sv-SE"), amount: d.amount }))]));

  const salvar = (o: Operacao) => {
    operacoesStore.mudar(ops => ops.some(x => x.id === o.id) ? ops.map(x => x.id === o.id ? o : x) : [...ops, o]);
    setEditando(null);
  };
  const remover = (o: Operacao) => {
    if (!confirm(`Remover ${NOME_TIPO[o.tipo].toLowerCase()} de ${o.ativo} de ${isoBR(o.data)}?`)) return;
    if (editando?.id === o.id) setEditando(null);
    operacoesStore.mudar(ops => ops.filter(x => x.id !== o.id));
  };

  const linhas = Object.values(posicoes).filter(p => p.qtd > 0 || p.realizado);
  const recebido = (ativo: string) => proventos.filter(p => p.ativo === ativo).reduce((s, p) => s + p.valor, 0);
  const lista = [...operacoes].filter(o => anoLista === "todos" || o.data.startsWith(String(anoLista))).sort((a, b) => b.data.localeCompare(a.data) || a.ativo.localeCompare(b.ativo));
  const anos = [...new Set(operacoes.map(o => +o.data.slice(0, 4)))].sort((a, b) => b - a);
  const totais = linhas.reduce((t, p) => {
    const atual = precoAtual(p.classe, p.ativo);
    return { custo: t.custo + p.custo, valor: t.valor + (atual != null ? atual * p.qtd : p.custo), realizado: t.realizado + p.realizado };
  }, { custo: 0, valor: 0, realizado: 0 });

  return <>
    <div className="panel">
      <div className="w-head">
        <div><h2>Operações</h2><div className="hint" style={{ margin: 0 }}>Compras, vendas e eventos (desdobramento, grupamento, bonificação). A quantidade de cada ativo na Carteira passa a vir daqui.</div></div>
      </div>
      {alertas.map(a => <div key={a} className="err" style={{ marginTop: 8 }}>{a}</div>)}
      {operacoes.length > 0 && <div className="tiles">
        <div className="tile"><div className="k">Custo das posições</div><div className="v">{money(totais.custo)}</div><div className="s">pelo preço médio</div></div>
        <div className="tile"><div className="k">Resultado em aberto</div><div className={"v " + signCls(totais.valor - totais.custo)}>{money(totais.valor - totais.custo)}</div>
          <div className="s">{totais.custo ? pct((totais.valor / totais.custo - 1) * 100) : "—"} sobre o custo</div></div>
        <div className="tile"><div className="k">Lucro realizado</div><div className={"v " + signCls(totais.realizado)}>{money(totais.realizado)}</div><div className="s">vendas, líquido de taxas</div></div>
      </div>}
      {pendentes.length > 0 && <SaldosIniciais pendentes={pendentes} classeDe={classeDe} />}
      <h3>{editando ? "Editar operação" : "Lançar operação"}</h3>
      <FormOperacao key={editando?.id ?? "nova"} editando={editando} classeDe={classeDe}
        cambioDe={(_c, a) => fx(itens[a]?.currency ?? "USD") ?? undefined}
        pendente={a => pendentes.some(p => p.t === a)} onSalvar={salvar} onCancelar={() => setEditando(null)} />
    </div>

    {linhas.length > 0 && <div className="panel">
      <h2>Posições e preço médio</h2>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Ativo</th><th>Quantidade</th><th>Preço médio</th><th>Custo</th><th>Preço atual</th><th>Valor</th><th>Resultado</th><th>Lucro realizado</th><th>Proventos</th></tr></thead>
        <tbody>{linhas.sort((a, b) => b.custo - a.custo).map(p => {
          const atual = precoAtual(p.classe, p.ativo), valor = atual != null ? atual * p.qtd : null, res = valor != null ? valor - p.custo : null;
          return (
            <tr key={p.ativo}>
              <td><span className="tk">{p.ativo}</span> <span className="muted">{NOME_CLASSE[p.classe]}</span></td>
              <td>{qtd(p.qtd)}</td><td>{p.qtd ? money(p.pm) : "—"}</td><td>{money(p.custo)}</td>
              <td>{atual != null && p.qtd ? money(atual) : <span className="muted">—</span>}</td><td>{p.qtd ? money(valor) : "—"}</td>
              <td className={signCls(res ?? 0)}>{res != null && p.qtd ? <>{money(res)} <span className="muted">{pct(res / p.custo * 100)}</span></> : "—"}</td>
              <td className={signCls(p.realizado)}>{p.realizado ? money(p.realizado) : "—"}</td>
              <td>{recebido(p.ativo) ? money(recebido(p.ativo)) : "—"}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="status">Preço atual e valor em reais (exterior convertido pelo câmbio de hoje). Resultado = valor − custo, sem os proventos.</div>
    </div>}

    {operacoes.length > 0 && <div className="panel">
      <div className="w-head">
        <h2>Histórico de operações</h2>
        <label className="status">Ano <select value={String(anoLista)} onChange={e => setAnoLista(e.target.value === "todos" ? "todos" : +e.target.value)} aria-label="Ano das operações">
          <option value="todos">todos</option>{anos.map(a => <option key={a}>{a}</option>)}</select></label>
      </div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th>Quantidade</th><th>Preço</th><th>Taxas</th><th>Total</th><th></th></tr></thead>
        <tbody>{lista.map(o => {
          const evento = o.tipo === "desdobramento" || o.tipo === "grupamento";
          const total = evento ? null : (o.qtd ?? 0) * (o.preco ?? 0) * (o.cambio ?? 1) + (o.tipo === "compra" ? 1 : o.tipo === "venda" ? -1 : 0) * (o.taxas ?? 0);
          return (
            <tr key={o.id} className={editando?.id === o.id ? "editing" : undefined}>
              <td>{isoBR(o.data)}</td>
              <td>{o.inicial ? "Saldo inicial" : NOME_TIPO[o.tipo]}</td>
              <td><span className="tk">{o.ativo}</span> <span className="muted">{NOME_CLASSE[o.classe]}</span></td>
              <td>{evento ? `fator ${brl(o.fator ?? 0, (o.fator ?? 0) % 1 ? 2 : 0)}` : qtd(o.qtd ?? 0)}</td>
              <td>{evento ? "—" : o.cambio ? `${brl(o.preco ?? 0)} × ${brl(o.cambio, 4)}` : money(o.preco)}</td>
              <td>{o.taxas ? money(o.taxas) : "—"}</td>
              <td>{total != null ? money(total) : "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="x" title="Editar" aria-label={`Editar operação de ${o.ativo} de ${isoBR(o.data)}`} onClick={() => setEditando(o)}>✎</button>
                <button className="x" title="Remover" aria-label={`Remover operação de ${o.ativo} de ${isoBR(o.data)}`} onClick={() => remover(o)}>×</button>
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </div>}

    {operacoes.length > 0 && <Impostos realizados={realizados} />}
    <Proventos operacoes={operacoes} proventos={proventos} historico={historico} />
    {operacoes.length > 0 && <Declaracao operacoes={operacoes} proventos={proventos} realizados={realizados} />}
  </>;
}

const qtd = (q: number) => brl(q, q % 1 ? Math.min(8, String(q).split(".")[1]?.length ?? 2) : 0);

// Ativos que já estavam na carteira: um "saldo inicial" com a data e o preço médio de hoje em diante
function SaldosIniciais({ pendentes, classeDe }: { pendentes: (Pos & { cripto: boolean })[]; classeDe: (a: string) => Classe | undefined }) {
  const [campos, setCampos] = useState<Record<string, { data: string; pm: string; classe: Classe }>>({});
  const de = (p: Pos & { cripto: boolean }) => campos[p.t] ?? { data: hojeISO(), pm: "", classe: p.cripto ? "cripto" : classeDe(p.t) ?? "acao" };
  const muda = (t: string, v: Partial<{ data: string; pm: string; classe: Classe }>, p: Pos & { cripto: boolean }) => setCampos(c => ({ ...c, [t]: { ...de(p), ...v } }));
  const salvar = (p: Pos & { cripto: boolean }) => {
    const c = de(p), pm = Number(c.pm);
    if (!(pm > 0)) return;
    operacoesStore.mudar(ops => [...ops, { id: Date.now().toString(36) + p.t, data: c.data, tipo: "compra", classe: c.classe, ativo: p.t, qtd: p.q, preco: pm, inicial: true }]);
  };
  return <>
    <h3>Saldo inicial</h3>
    <div className="hint">Estes ativos estão na carteira sem histórico. Informe a data e o preço médio (o da nota de corretagem ou do informe da corretora) para o painel calcular o lucro e o imposto.</div>
    <div className="table-wrap"><table className="w-table">
      <thead><tr><th>Ativo</th><th>Quantidade</th><th>Classe</th><th>Data</th><th>Preço médio (R$)</th><th></th></tr></thead>
      <tbody>{pendentes.map(p => {
        const c = de(p);
        return (
          <tr key={p.t}>
            <td><span className="tk">{p.t}</span></td><td>{qtd(p.q)}</td>
            <td>{p.cripto ? "Cripto" : <select aria-label={`Classe de ${p.t}`} value={c.classe} onChange={e => muda(p.t, { classe: e.target.value as Classe }, p)}>
              {(["acao", "fii", "etf", "bdr", "exterior"] as Classe[]).map(k => <option key={k} value={k}>{NOME_CLASSE[k]}</option>)}</select>}</td>
            <td><input type="date" aria-label={`Data do saldo inicial de ${p.t}`} max={hojeISO()} value={c.data} onChange={e => muda(p.t, { data: e.target.value }, p)} /></td>
            <td><input type="number" step="any" min="0" aria-label={`Preço médio de ${p.t}`} value={c.pm} onChange={e => muda(p.t, { pm: e.target.value }, p)} /></td>
            <td><button type="button" className="primary" disabled={!(Number(c.pm) > 0)} onClick={() => salvar(p)}>Salvar</button></td>
          </tr>
        );
      })}</tbody>
    </table></div>
  </>;
}
