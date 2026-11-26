// Analisador de ações e FIIs: nota de 0 a 100 pelos indicadores do Fundamentus (/api/data). Pontuação, pesos e faixas
// ficam no motor (analisaAcao, analisaFii); Graham, Bazin, número mágico e setor são referências que não entram na nota.
import { Fragment, useState } from "react";
import { usePreferencia } from "../../lib/preferencia";
import { apiFetch } from "../../lib/api";
import { big, brl, money } from "../../lib/formato";
import {
  analisaAcao, analisaFii, classificaSetor, comparaSetor, INDICADORES_SETOR, numeroMagico, precoBazin, precoGraham,
  type FmtCriterio, type Fundamentos,
} from "../../motor";
import { Entrada } from "../../componentes/Campos";

type ItemApi = { ticker: string; name?: string; sector?: string; industry?: string; price?: number; fund?: (Fundamentos & { kind?: string }) | null; error?: string };
type Analise = ReturnType<typeof analisaAcao> | ReturnType<typeof analisaFii>;
type Resultado = { ticker: string; nome?: string; setor?: string; industria?: string; preco?: number; fund?: Fundamentos | null; erro: string | null; analise: Analise | null };

const fmtCriterio = (v: number | null, f: FmtCriterio) => v == null ? "—" : f === "%" ? brl(v * 100, 1) + "%" : f === "R$" ? "R$ " + big(v) : brl(v, f === "n" ? 0 : 2);
const corNota = (n: number | null | undefined) => n == null ? "" : n >= 70 ? "up" : n >= 50 ? "" : "down";

async function analisar(tickers: string): Promise<Resultado[]> {
  const r = await apiFetch(`/api/data?symbols=${encodeURIComponent(tickers)}&range=1mo`);
  if (!r.ok) throw new Error("Não foi possível consultar os ativos agora.");
  const data: { items: ItemApi[] } = await r.json();
  return data.items.map(it => {
    const f = it.fund;
    const analise = f ? (f.kind === "fii" ? analisaFii(f, { nome: it.name }) : analisaAcao(f)) : null;
    return { ticker: it.ticker, nome: it.name, setor: it.sector, industria: it.industry, preco: it.price, fund: f,
      erro: it.error || (f ? null : "sem indicadores no Fundamentus"), analise };
  }).sort((a, b) => (b.analise?.nota ?? -1) - (a.analise?.nota ?? -1));
}

export function Analisador() {
  const [anaCfg, setAnaCfg] = usePreferencia<{ tickers?: string }>("analisador", {});
  const [tickers, setTickers] = useState(anaCfg.tickers || "PETR4, ITUB4, HGLG11, MXRF11");
  const [res, setRes] = useState<Resultado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = tickers.trim();
    if (!t) return;
    setAnaCfg({ tickers: t });
    setCarregando(true); setErro(null); setRes(null);
    try { setRes(await analisar(t)); }
    catch (x) { setErro((x as Error).message || "Falha ao consultar os ativos."); }
    finally { setCarregando(false); }
  };

  return <>
    <div className="panel">
      <h2>Analisador de ações e FIIs</h2>
      <div className="hint">Pontuação de 0 a 100 pelos indicadores do Fundamentus, com pesos fixos por critério. Ações: P/L, P/VP, EV/EBITDA, ROE, ROIC, margem, dívida, crescimento e dividend yield. FIIs: DY, P/VP, FFO, liquidez e, nos de tijolo, vacância, cap rate e número de imóveis.
        {" "}Nos FIIs, P/VP e dividend yield têm faixa ideal: muito baixo ou muito alto vira alerta, como ensina o AUVP.
        {" "}<b>É uma leitura dos números, não recomendação de compra ou venda.</b></div>
      <form className="w-add proj-form" onSubmit={enviar}>
        <label style={{ gridColumn: "1 / -1" }}>Tickers (separados por vírgula, até 30)
          <Entrada type="text" value={tickers} placeholder="PETR4, ITUB4, HGLG11" onChange={e => setTickers(e.target.value)} /></label>
        <div className="quick"><button type="submit" disabled={carregando}>Analisar</button></div>
      </form>
      <div className="status">Dados do Fundamentus: o site usa 0 quando não tem o número, então esse critério fica de fora da nota e a cobertura cai.</div>
    </div>
    {carregando ? <div className="status">Consultando os indicadores…</div>
      : erro ? <div className="panel err">{erro}</div>
      : res && <Resultados res={res} />}
  </>;
}

function Resultados({ res }: { res: Resultado[] }) {
  // Comparação dentro do setor (AUVP, Módulo 4.1): só faz sentido entre concorrentes
  const acoes = res.filter(x => x.analise?.kind === "acao");
  // "Energia" no Yahoo junta petróleo e elétricas, que não são concorrentes: nesse caso o grupo é a indústria
  const grupoDe = (x: Resultado) => {
    if (!x.setor || !/^energia$/i.test(x.setor.trim()) || !x.industria) return x.setor;
    return /petr|g[aá]s|combust/i.test(x.industria) ? "Energia · petróleo e gás" : /el[eé]tric/i.test(x.industria) ? "Energia · energia elétrica" : `Energia · ${x.industria}`;
  };
  const grupos = comparaSetor(acoes.map(x => ({ ticker: x.ticker, setor: grupoDe(x), fund: x.fund })));
  const fmtInd = (v: unknown, f: string) => v == null || v === 0 ? "—" : f === "%" ? brl(Number(v) * 100, 1) + "%" : brl(Number(v), 2);

  return <>
    <div className="table-wrap"><table className="w-table">
      <thead><tr><th>Ativo</th><th>Tipo</th><th>Nota</th><th>Faixa</th><th>Cobertura</th></tr></thead>
      <tbody>{res.map(x => {
        const a = x.analise;
        return (
          <tr key={x.ticker}><td><b>{x.ticker}</b><div className="muted">{x.nome || ""}</div></td>
            <td>{a ? <>{a.tipo}{a.kind === "fii" && a.segmento && <div className="muted">{a.segmento}</div>}</> : "—"}</td>
            <td><b className={corNota(a?.nota)}>{a?.nota ?? "—"}</b></td>
            <td>{a ? a.faixa : x.erro || "sem dados"}</td>
            <td>{a ? Math.round(a.cobertura * 100) + "%" : "—"}</td></tr>
        );
      })}</tbody>
    </table></div>
    {grupos.length ? grupos.map(g => (
      <div key={g.setor} className="panel"><h3>Comparação no setor: {g.setor}</h3>
        <div className="hint">O AUVP compara sempre dentro do mesmo setor. Em destaque, o melhor valor de cada indicador entre as empresas que você analisou.</div>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th>Ativo</th>{INDICADORES_SETOR.map(i => <th key={i.id}>{i.nome}</th>)}</tr></thead>
          <tbody>{g.tickers.map(t => {
            const f = res.find(x => x.ticker === t)!.fund!;
            return <tr key={t}><td><b>{t}</b></td>{INDICADORES_SETOR.map(i => {
              const best = g.melhores[i.id]?.includes(t);
              return <td key={i.id} className={best ? "up" : ""}>{best ? <b>{fmtInd(f[i.campo], i.fmt)}</b> : fmtInd(f[i.campo], i.fmt)}</td>;
            })}</tr>;
          })}</tbody>
        </table></div>
      </div>
    )) : acoes.length ? <div className="status">Para comparar no setor, como o AUVP recomenda, inclua concorrentes do mesmo setor (por exemplo, BBAS3, ITUB4 e BBDC4).</div> : null}
    {res.map(x => <Cartao key={x.ticker} x={x} unico={res.length === 1} />)}
  </>;
}

function Cartao({ x, unico }: { x: Resultado; unico: boolean }) {
  const a = x.analise;
  if (!a) return <div className="panel"><b>{x.ticker}</b><div className="hint">{x.erro || "Sem dados para pontuar."}</div></div>;
  // Referências do AUVP (Módulos 4.1 e 4.2): não entram na nota, porque dependem da tese de cada investidor
  const rel = (m: number) => `${brl(Math.abs(m) * 100, 0)}% ${m >= 0 ? "acima" : "abaixo"} do preço atual`;
  const extras: { cls?: string; conteudo: React.ReactNode }[] = [];
  const preco = x.preco ?? 0, fund = x.fund ?? {};
  if (a.kind === "acao") {
    const set = classificaSetor(x.setor, x.industria);
    if (set.texto) extras.push({ cls: set.tipo === "perene" ? "up" : set.tipo === "ciclico" ? "down" : "", conteudo: set.texto });
    const g = precoGraham(preco, fund.pl ?? 0, fund.pvp ?? 0);
    if (g) extras.push({ conteudo: <>Preço justo de Graham, √(22,5 × LPA × VPA): <b>R$ {brl(g.justo)}</b>, {rel(g.margem)}.</> });
    const b = precoBazin(preco, fund.dy ?? 0);
    if (b) extras.push({ conteudo: <>Preço-teto de Bazin (dividendo mínimo de 6%): <b>R$ {brl(b.teto)}</b>, {rel(b.margem)}.</> });
  } else {
    const m = numeroMagico(fund.dy ?? 0, preco);
    if (m) extras.push({ conteudo: <>Número mágico: <b>{m.cotas} cotas</b> (cerca de {money(m.investimento)}) para que os dividendos de um mês comprem uma cota nova.</> });
  }
  const segmento = a.kind === "fii" ? a.segmento : null;
  return (
    <details className="panel ana-card" open={unico}>
      <summary><b>{x.ticker}</b> · {x.nome || ""} <span className="muted">{x.preco != null ? "R$ " + brl(x.preco) : ""}</span>
        <span className="ana-nota">{a.nota ?? "—"}</span></summary>
      <div className="ana-bar"><span style={{ width: (a.nota ?? 0) + "%" }} /></div>
      <div className="hint">{a.tipo}{segmento ? " · " + segmento : ""}{x.setor && a.kind === "acao" ? " · " + x.setor : ""} · cobertura {Math.round(a.cobertura * 100)}%{a.cobertura < 0.6 ? " (poucos dados para uma nota firme)" : ""}</div>
      {extras.length > 0 && <ul className="ana-extras">{extras.map((e, i) => <li key={i} className={e.cls || undefined}>{e.conteudo}</li>)}</ul>}
      {a.alertas.length > 0 && <ul className="ana-alertas">{a.alertas.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Critério</th><th>Valor</th><th>Nota</th><th>Peso</th></tr></thead>
        <tbody>{a.criterios.map(c => <Fragment key={c.id}><tr><td>{c.nome}</td><td>{fmtCriterio(c.valor, c.fmt)}</td><td>{c.nota ?? "sem dado"}</td><td>{c.peso}</td></tr></Fragment>)}</tbody>
      </table></div>
    </details>
  );
}
