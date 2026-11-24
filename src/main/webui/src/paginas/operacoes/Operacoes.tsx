// Operações: compras, vendas e eventos de ações, FIIs, ETFs, BDRs, exterior e cripto, e o histórico de tudo o que mudou a
// carteira (também aplicações e resgates de renda fixa e compras e vendas de moedas). Daqui saem o preço médio, o lucro
// realizado, o imposto de renda mensal, os proventos e a declaração anual (contas em motor/operacoes.ts).
// Operação lançada não se edita nem se apaga: estornar deixa as duas no histórico. Ativos que já estavam na carteira
// antes das operações pedem um saldo inicial (data e preço médio).
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTitulo } from "../../lib/useTitulo";
import { apiFetch, getJson } from "../../lib/api";
import { useCambio } from "../../lib/cambio";
import { hojeISO, isoBR, useRendaFixa } from "../../lib/dados";
import { brl, money, pct, signCls } from "../../lib/formato";
import { operacoesStore, useOperacoes } from "../../lib/operacoes";
import { NOME_CLASSE, NOME_CLASSE_OP, NOME_TIPO, ehRV, estornadas, processar, valorDaOperacao, type Classe, type Operacao, type TituloRF } from "../../motor";
import type { ItemAtivo, PrecoCripto } from "../../lib/composicao";
import { ErroCarteira } from "../../componentes/ErroCarteira";
import { FormOperacao, inicialDe, type Grupo, type Inicial, type Movimento } from "./FormOperacao";
import { Impostos } from "./Impostos";
import { Proventos } from "./Proventos";
import { Declaracao } from "./Declaracao";

type Pos = { t: string; q: number };
type ItemComProventos = ItemAtivo & { dividends?: { date: number; amount: number }[] };

export function Operacoes() {
  useTitulo("Operações");
  const { doc, erro, operacoes, proventos } = useOperacoes();
  // Vindo da Carteira (?classe=rf&mov=saida&ativo=...) o formulário já abre no caso certo
  const [params, setParams] = useSearchParams();
  const doLink = (): Inicial | null => {
    const g = params.get("classe") as Grupo | null, m = params.get("mov") as Movimento | null;
    return g && m && ["rv", "cripto", "rf"].includes(g) && ["entrada", "saida", "evento"].includes(m)
      ? { grupo: g, mov: m, campos: params.get("ativo") ? { ativo: params.get("ativo")! } : undefined } : null;
  };
  const [refazer, setRefazer] = useState<Inicial | null>(doLink); // operação estornada (para lançar corrigida) ou link
  const [estornada, setEstornada] = useState(false);
  const rf = useRendaFixa();
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
    const ult = [...operacoes].reverse().find(o => o.ativo === ativo && ehRV(o));
    if (ult) return ult.classe as Classe;
    const t = itens[ativo]?.type;
    return t === "FII" ? "fii" : t === "Exterior" ? "exterior" : undefined;
  };
  const historico = Object.fromEntries(Object.values(itens).map(i => [i.ticker, (i.dividends ?? []).map(d => ({ date: new Date(d.date).toLocaleDateString("sv-SE"), amount: d.amount }))]));

  const limpar = () => { setRefazer(null); setEstornada(false); if ([...params.keys()].length) setParams({}, { replace: true }); };
  const salvar = (o: Operacao) => {
    operacoesStore.lancar(o);
    limpar();
  };
  // Estornar: pede o motivo (opcional); cancelar a pergunta desiste. A operação volta preenchida no formulário
  // (menos moedas, que se lançam na página Moedas).
  const estornar = (o: Operacao) => {
    const motivo = prompt(`Estornar ${NOME_TIPO[o.tipo].toLowerCase()} de ${nomeAtivo(o)} de ${isoBR(o.data)}?\n\nA operação continua no histórico, marcada como estornada. Motivo (opcional):`, "");
    if (motivo === null) return;
    operacoesStore.estornar(o, motivo);
    const ini = inicialDe(o);
    setRefazer(ini); setEstornada(!!ini);
  };

  const linhas = Object.values(posicoes).filter(p => p.qtd > 0 || p.realizado);
  const recebido = (ativo: string) => proventos.filter(p => p.ativo === ativo).reduce((s, p) => s + p.valor, 0);
  const estornadasIds = estornadas(operacoes);
  const estornoDe = new Map(operacoes.filter(o => o.tipo === "estorno").map(o => [o.estorna!, o]));
  const porId = new Map(operacoes.map(o => [o.id, o]));
  const titulos = new Map<string, string>(operacoes.filter(o => o.titulo).map(o => [o.ativo, o.titulo!.nome]));
  const nomeAtivo = (o: Operacao) => o.classe === "rf" ? titulos.get(o.ativo) ?? "título" : o.ativo;
  const lista = [...operacoes].filter(o => anoLista === "todos" || o.data.startsWith(String(anoLista)))
    .sort((a, b) => b.data.localeCompare(a.data) || (b.registrado ?? "").localeCompare(a.registrado ?? "") || a.ativo.localeCompare(b.ativo));
  const anos = [...new Set(operacoes.map(o => +o.data.slice(0, 4)))].sort((a, b) => b - a);
  const totais = linhas.reduce((t, p) => {
    const atual = precoAtual(p.classe, p.ativo);
    return { custo: t.custo + p.custo, valor: t.valor + (atual != null ? atual * p.qtd : p.custo), realizado: t.realizado + p.realizado };
  }, { custo: 0, valor: 0, realizado: 0 });

  return <>
    <div className="panel">
      <div className="w-head">
        <div><h2>Operações</h2><div className="hint" style={{ margin: 0 }}>A carteira só muda por aqui: compras, vendas e eventos de ações, FIIs e cripto, aplicações e resgates de renda fixa (moedas, na página Moedas).</div></div>
      </div>
      {alertas.map(a => <div key={a} className="err" style={{ marginTop: 8 }}>{a}</div>)}
      {operacoes.length > 0 && <div className="tiles">
        <div className="tile"><div className="k">Custo das posições</div><div className="v">{money(totais.custo)}</div><div className="s">pelo preço médio</div></div>
        <div className="tile"><div className="k">Resultado em aberto</div><div className={"v " + signCls(totais.valor - totais.custo)}>{money(totais.valor - totais.custo)}</div>
          <div className="s">{totais.custo ? pct((totais.valor / totais.custo - 1) * 100) : "—"} sobre o custo</div></div>
        <div className="tile"><div className="k">Lucro realizado</div><div className={"v " + signCls(totais.realizado)}>{money(totais.realizado)}</div><div className="s">vendas, líquido de taxas</div></div>
      </div>}
      {pendentes.length > 0 && <SaldosIniciais pendentes={pendentes} classeDe={classeDe} />}
      <h3>{estornada ? "Lançar de novo, corrigida" : "Lançar operação"}</h3>
      {estornada && <div className="hint">Operação estornada. Corrija o que estava errado e lance de novo (ou cancele).</div>}
      <FormOperacao key={refazer ? JSON.stringify(refazer) : "nova"} inicial={refazer} operacoes={operacoes}
        titulos={(doc.rendaFixa ?? []) as TituloRF[]} rates={rf.rates} pendentes={pendentes.map(p => ({ t: p.t, cripto: p.cripto }))}
        classeDe={classeDe} cambioDe={a => fx(itens[a]?.currency ?? "USD") ?? undefined} precoDe={precoAtual}
        onSalvar={salvar} onCancelar={limpar} />
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
      <div className="hint">Tudo o que mudou a carteira: ações, FIIs, cripto, renda fixa e moedas. Operação não se edita nem se apaga; o estorno desfaz e as duas ficam aqui.</div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th>Quantidade</th><th>Preço</th><th>Taxas</th><th>Valor (R$)</th><th>Valor presente</th><th>Lançada em</th><th></th></tr></thead>
        <tbody>{lista.map(o => {
          if (o.tipo === "estorno") {
            const alvo = o.estorna ? porId.get(o.estorna) : undefined;
            return (
              <tr key={o.id} className="estorno">
                <td>{isoBR(o.data)}</td><td>Estorno</td>
                <td><span className="tk">{nomeAtivo(o)}</span> <span className="muted">{NOME_CLASSE_OP[o.classe]}</span></td>
                <td colSpan={5} className="muted">{alvo ? `desfaz ${NOME_TIPO[alvo.tipo].toLowerCase()} de ${isoBR(alvo.data)}` : "desfaz uma operação"}{o.obs ? ` · ${o.obs}` : ""}</td>
                <td className="muted">{registradoBR(o.registrado)}</td><td></td>
              </tr>
            );
          }
          const evento = o.tipo === "desdobramento" || o.tipo === "grupamento";
          const estornada = estornadasIds.has(o.id), est = estornoDe.get(o.id);
          const rotulo = o.inicial ? "Saldo inicial" : NOME_TIPO[o.tipo];
          return (
            <tr key={o.id} className={estornada ? "estornada" : undefined}>
              <td>{isoBR(o.data)}</td>
              <td>{rotulo}{estornada && <> <span className="muted">(estornada{est ? ` em ${isoBR(est.data)}` : ""})</span></>}</td>
              <td><span className="tk">{nomeAtivo(o)}</span> <span className="muted">{NOME_CLASSE_OP[o.classe]}</span></td>
              <td>{evento ? `fator ${brl(o.fator ?? 0, (o.fator ?? 0) % 1 ? 2 : 0)}` : o.classe === "rf" ? <span className="muted">principal {money(o.qtd)}</span> : qtd(o.qtd ?? 0)}</td>
              <td>{evento || o.classe === "rf" ? "—" : o.classe === "moeda" ? (o.qtd ? "R$ " + brl(valorDaOperacao(o) / o.qtd, 4) : "—") : o.cambio ? `${brl(o.preco ?? 0)} × ${brl(o.cambio, 4)}` : money(o.preco)}</td>
              <td>{o.taxas ? money(o.taxas) : "—"}</td>
              <td>{evento ? "—" : money(valorDaOperacao(o))}</td>
              <td>{o.valorPresente != null ? money(o.valorPresente) : <span className="muted">—</span>}</td>
              <td className="muted">{registradoBR(o.registrado)}</td>
              <td>{!estornada && <button type="button" className="x" title="Estornar" aria-label={`Estornar operação de ${nomeAtivo(o)} de ${isoBR(o.data)}`} onClick={() => estornar(o)}>↺</button>}</td>
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

// Quando o servidor recebeu a operação (dd/mm/aaaa hh:mm); operações antigas não têm
const registradoBR = (iso?: string) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const qtd = (q: number) => brl(q, q % 1 ? Math.min(8, String(q).split(".")[1]?.length ?? 2) : 0);

// Ativos que já estavam na carteira: um "saldo inicial" com a data e o preço médio de hoje em diante
function SaldosIniciais({ pendentes, classeDe }: { pendentes: (Pos & { cripto: boolean })[]; classeDe: (a: string) => Classe | undefined }) {
  const [campos, setCampos] = useState<Record<string, { data: string; pm: string; classe: Classe }>>({});
  const de = (p: Pos & { cripto: boolean }) => campos[p.t] ?? { data: hojeISO(), pm: "", classe: p.cripto ? "cripto" : classeDe(p.t) ?? "acao" };
  const muda = (t: string, v: Partial<{ data: string; pm: string; classe: Classe }>, p: Pos & { cripto: boolean }) => setCampos(c => ({ ...c, [t]: { ...de(p), ...v } }));
  const salvar = (p: Pos & { cripto: boolean }) => {
    const c = de(p), pm = Number(c.pm);
    if (!(pm > 0)) return;
    operacoesStore.lancar({ id: Date.now().toString(36) + p.t, data: c.data, tipo: "compra", classe: c.classe, ativo: p.t, qtd: p.q, preco: pm, inicial: true });
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
