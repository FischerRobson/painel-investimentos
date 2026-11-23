// Ativos: compara ações e FIIs (desempenho no período, resumo ordenável e um cartão por ativo com gráfico, faixa de 52 semanas,
// indicadores do Fundamentus e proventos). A lista fica salva na carteira (preferencias.listaPainel) e na URL (#BBDC4,KNRI11).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChartConfiguration } from "chart.js";
import { useTitulo } from "../lib/useTitulo";
import { getJson } from "../lib/api";
import { DEMO, store } from "../lib/store";
import { carteiraStore, useCarteira } from "../lib/carteira";
import { moneyC } from "../lib/cambio";
import { arrow, big, brl, fmtDate, nz, pct, signCls } from "../lib/formato";
import { cor, crosshair, css, gridOpts, tickOpts, timeTicks, tooltipOpts } from "../lib/graficos";
import { Grafico } from "../componentes/Grafico";
import { ErroCarteira } from "../componentes/ErroCarteira";
import { parseTickers } from "./carteira/Adicionar";

export const LISTA_PADRAO = "BBDC4, EGIE3, ALUP11, SBSP3, VIVT3, KNRI11, VISC11, XPML11";
const RANGES: [string, string][] = [["1mo", "1M"], ["3mo", "3M"], ["6mo", "6M"], ["1y", "1A"], ["5y", "5A"], ["max", "Máx"]];
const RANGE_LABEL: Record<string, string> = { "1mo": "1 mês", "3mo": "3 meses", "6mo": "6 meses", "1y": "1 ano", "5y": "5 anos", "max": "todo o histórico" };

type Fund = Partial<Record<"roe" | "vacancia" | "imoveis" | "capRate" | "liquidez" | "margemLiq" | "evEbitda" | "divLiqPatrim" | "crescRec5a", number | null>>;
export type Ativo = {
  ticker: string; symbol: string; error?: string; warnings?: string[]; type: string; industry?: string; sector?: string;
  name?: string; logo?: string; summary?: string; currency?: string; price: number; changePct: number;
  dy12m?: number | null; div12m?: number | null; pe?: number | null; pvp?: number | null; low52: number; high52: number;
  marketCap?: number | null; volume?: number | null; fund?: Fund | null; dividends?: { date: number; amount: number }[];
  points: [number, number][]; sources?: { grafico?: string; cotacao?: string; indicadores?: string };
};
type Linha = Ativo & { idx: number; ret: number | null };

const periodReturn = (it: Ativo) => {
  const p = it.points || [];
  return p.length < 2 ? null : (p[p.length - 1][1] / p[0][1] - 1) * 100;
};
const listaDe = (doc: { preferencias?: Record<string, unknown> } | null) => {
  const l = doc?.preferencias?.listaPainel;
  return typeof l === "string" && l.trim() ? l : LISTA_PADRAO;
};

export function Ativos() {
  useTitulo("Ativos");
  const carteira = useCarteira();
  const [texto, setTexto] = useState<string | null>(null); // o que está no campo
  const [lista, setLista] = useState<string | null>(null);  // a lista carregada
  const [range, setRangeState] = useState(() => store.get("range", "1y"));

  // Carrega a lista: guarda na carteira se mudou e põe na URL
  const carregar = (l: string, r = range) => {
    setLista(l);
    if (r !== range) { setRangeState(r); store.set("range", r); }
    const doc = carteiraStore.get().doc;
    if (doc && l !== listaDe(doc)) {
      carteiraStore.atualizar(d => ({ ...d, preferencias: { ...(d.preferencias ?? {}), listaPainel: l } }));
    }
    history.replaceState(null, "", "#" + encodeURIComponent(l.replace(/\s+/g, "")));
    if (l === lista && r === range) void q.refetch(); // mesmo pedido: busca de novo, como o botão do app atual
  };
  // Primeira lista: a da URL (fora da demonstração) ou a salva na carteira
  useEffect(() => {
    if (!carteira.doc || texto !== null) return;
    const inicial = (!DEMO && decodeURIComponent(location.hash.slice(1)).replace(/,/g, ", ")) || listaDe(carteira.doc);
    setTexto(inicial);
    carregar(inicial);
  }, [carteira.doc]);

  const shown = parseTickers(lista ?? "");
  const q = useQuery({
    queryKey: ["data", range, shown.join(",")],
    enabled: lista !== null,
    queryFn: () => getJson<{ items: Ativo[] }>(`/api/data?range=${range}&symbols=${encodeURIComponent(shown.join(","))}`),
    placeholderData: prev => prev,
  });

  if (carteira.erro) return <ErroCarteira msg={carteira.erro} />;
  const porTicker = Object.fromEntries((q.data?.items ?? []).map(it => [it.ticker, it]));
  const data: Linha[] = shown.filter(t => porTicker[t]).map((t, i) => ({ ...porTicker[t], idx: i, ret: periodReturn(porTicker[t]) }));
  const remover = (t: string) => {
    const l = (texto ?? "").split(/[,\s;]+/).filter(s => s && s.toUpperCase() !== t).join(", ");
    setTexto(l);
    carregar(l);
  };

  return <>
    <div className="controls">
      <input type="text" placeholder="Ex.: BBDC4, EGIE3, KNRI11" autoComplete="off" spellCheck={false} aria-label="Tickers"
        value={texto ?? ""} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === "Enter") carregar(texto ?? ""); }} />
      <button className="primary" onClick={() => carregar(texto ?? "")}>Carregar</button>
      <div className="seg">
        {RANGES.map(([r, l]) => <button key={r} className={range === r ? "on" : undefined} onClick={() => carregar(texto ?? "", r)}>{l}</button>)}
      </div>
    </div>
    {q.isError ? <div className="panel err">Não consegui carregar os dados. Recarregue a página em instantes.</div>
      : !q.data ? <div className="panel muted">Carregando…</div>
      : <Painel data={data} range={range} onRemover={remover} />}
  </>;
}

function Painel({ data, range, onRemover }: { data: Linha[]; range: string; onRemover: (t: string) => void }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  if (!data.length) return <div className="panel muted">Digite alguns tickers acima.</div>;
  const ok = data.filter(d => !d.error), bad = data.filter(d => d.error);
  const avisos = [...new Set(ok.flatMap(d => d.warnings || []))];
  const alternar = (s: string) => setHidden(h => { const n = new Set(h); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  return <>
    {bad.length > 0 && <div className="panel err">Não encontrei: {bad.map(b => b.ticker).join(", ")}</div>}
    {avisos.length > 0 && <div className="panel err">{avisos.map(a => <span key={a}>{a}<br /></span>)}<span className="muted">Usando o Yahoo como reserva para esses ativos.</span></div>}
    <div className="panel">
      <h2>Comparativo de desempenho</h2>
      <div className="hint">Variação do preço em {RANGE_LABEL[range]}, todos partindo de 0% (não inclui proventos). Clique na legenda para esconder/mostrar.</div>
      <div className="legend">
        {ok.map(it => (
          <span key={it.symbol} className={hidden.has(it.symbol) ? "off" : undefined} onClick={() => alternar(it.symbol)}>
            <i style={{ background: cor(it.idx) }} />{it.ticker} <b className={signCls(it.ret ?? 0)}>{pct(it.ret, 1)}</b>
          </span>
        ))}
      </div>
      <div className="cmp-box">
        <Grafico deps={[range, ok.map(it => it.symbol + it.points.length).join(), [...hidden].join()]} config={() => configComparativo(ok, hidden)} />
      </div>
    </div>
    <div className="panel">
      <h2>Resumo</h2>
      <div className="hint">Clique no cabeçalho para ordenar. DY, P/L, P/VP e ROE vêm do Fundamentus (DY = proventos dos últimos 12 meses ÷ preço).</div>
      <Resumo ok={ok} />
    </div>
    <div className="grid">{ok.map(it => <Cartao key={it.symbol} it={it} onRemover={() => onRemover(it.ticker)} />)}</div>
  </>;
}

function configComparativo(ok: Linha[], hidden: Set<string>): ChartConfiguration<"line"> | null {
  const all = ok.flatMap(it => it.points);
  if (!all.length) return null;
  const min = Math.min(...all.map(p => p[0])), max = Math.max(...all.map(p => p[0]));
  return {
    type: "line",
    data: {
      datasets: ok.map(it => {
        const base = it.points[0]?.[1];
        return {
          label: it.ticker, hidden: hidden.has(it.symbol), data: it.points.map(([t, c]) => ({ x: t, y: (c / base - 1) * 100 })),
          borderColor: cor(it.idx), backgroundColor: cor(it.idx), borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
          pointHoverBorderWidth: 2, pointHoverBorderColor: css("--surface"), tension: 0.15,
        };
      }),
    },
    options: {
      maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOpts(), mode: "index", intersect: false, itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
          callbacks: { title: i => fmtDate(i[0].parsed.x ?? 0), label: c => ` ${c.dataset.label}: ${pct(c.parsed.y)}` },
        },
      },
      scales: {
        x: { type: "linear", min, max, grid: { display: false }, border: { color: css("--border") }, ticks: { ...tickOpts(), maxTicksLimit: 7, callback: timeTicks(min, max) } },
        y: { grid: gridOpts(), border: { display: false }, ticks: { ...tickOpts(), callback: v => v + "%" } },
      },
    },
    plugins: [crosshair],
  };
}

type Coluna = { k: string; l: string; f: (it: Linha) => React.ReactNode; s?: (it: Linha) => number | string | null | undefined };
const COLS: Coluna[] = [
  { k: "ticker", l: "Ticker", f: it => <span className="tk"><span className="dot" style={{ background: cor(it.idx) }} />{it.ticker}</span>, s: it => it.ticker },
  { k: "type", l: "Tipo", f: it => <span className="muted">{it.type}{it.industry ? " · " + it.industry : ""}</span>, s: it => it.type + (it.industry || "") },
  { k: "price", l: "Preço", f: it => moneyC(it.price, it.currency) },
  { k: "changePct", l: "Dia", f: it => <span className={signCls(it.changePct)}>{arrow(it.changePct)} {pct(it.changePct)}</span> },
  { k: "ret", l: "Período", f: it => <span className={signCls(it.ret ?? 0)}>{pct(it.ret)}</span> },
  { k: "dy12m", l: "DY 12m", f: it => it.dy12m ? brl(it.dy12m * 100) + "%" : "—" },
  { k: "roe", l: "ROE", f: it => nz(it.fund?.roe) != null ? brl(it.fund!.roe! * 100, 1) + "%" : "—", s: it => nz(it.fund?.roe) },
  { k: "div12m", l: "Proventos 12m", f: it => it.div12m ? moneyC(it.div12m, it.currency) : "—" },
  { k: "pe", l: "P/L", f: it => it.type === "FII" || !it.pe ? "—" : brl(it.pe) },
  { k: "pvp", l: "P/VP", f: it => it.pvp ? brl(it.pvp) : "—" },
  { k: "pos52", l: "Mín–Máx 52s", f: it => `${brl(it.low52)} – ${brl(it.high52)}`, s: it => it.high52 > it.low52 ? (it.price - it.low52) / (it.high52 - it.low52) : null },
  { k: "marketCap", l: "Valor de mercado", f: it => big(it.marketCap) },
  { k: "volume", l: "Volume", f: it => big(it.volume) },
];

// Tabela ordenável (clique no cabeçalho; de novo inverte). Texto começa de A a Z; números, do maior para o menor.
function Resumo({ ok }: { ok: Linha[] }) {
  const [sortKey, setSortKey] = useState<string | null>(null), [sortAsc, setSortAsc] = useState(false);
  const rows = [...ok];
  if (sortKey) {
    const col = COLS.find(c => c.k === sortKey)!;
    const val = (it: Linha) => col.s ? col.s(it) : (sortKey === "pe" && it.type === "FII" ? null : (it as unknown as Record<string, number | null>)[sortKey]);
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null) return 1; if (y == null) return -1;
      const r = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return sortAsc ? r : -r;
    });
  }
  const ordenar = (k: string) => {
    if (sortKey === k) setSortAsc(!sortAsc); else { setSortKey(k); setSortAsc(k === "ticker" || k === "type"); }
  };
  return (
    <div className="table-wrap"><table>
      <thead><tr>{COLS.map(c => (
        <th key={c.k} className={c.k === sortKey ? "sorted" + (sortAsc ? " asc" : "") : undefined} onClick={() => ordenar(c.k)}>{c.l}</th>
      ))}</tr></thead>
      <tbody>{rows.map(it => <tr key={it.symbol}>{COLS.map(c => <td key={c.k}>{c.f(it)}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

function Cartao({ it, onRemover }: { it: Linha; onRemover: () => void }) {
  const [semLogo, setSemLogo] = useState(false);
  const [divsAberto, setDivsAberto] = useState(false);
  const c = cor(it.idx);
  const pos = it.high52 > it.low52 ? Math.min(100, Math.max(0, (it.price - it.low52) / (it.high52 - it.low52) * 100)) : 50;
  const divs = it.dividends || [];
  const last = divs[divs.length - 1];
  const f = it.fund || {};
  const isFII = it.type === "FII";
  const pctv = (v: number | null | undefined, d = 1) => nz(v) != null ? brl(v! * 100, d) + "%" : "—";
  const periodo = <span className={signCls(it.ret ?? 0)}>{pct(it.ret)}</span>;
  const stats: [string, React.ReactNode][] = isFII ? [
    ["DY 12m", it.dy12m ? brl(it.dy12m * 100) + "%" : "—"],
    ["P/VP", it.pvp ? brl(it.pvp) : "—"],
    ["Último provento", last ? moneyC(last.amount, it.currency) : "—"],
    ["Vacância", f.vacancia != null ? brl(f.vacancia * 100, 1) + "%" : "—"],
    ["Nº de imóveis", nz(f.imoveis) != null ? brl(f.imoveis!, 0) : "—"],
    ["Cap rate", pctv(f.capRate)],
    ["No período", periodo],
    ["Valor de mercado", big(it.marketCap)],
    ["Liquidez diária", nz(f.liquidez) != null ? "R$ " + big(f.liquidez) : big(it.volume)],
  ] : [
    ["DY 12m", it.dy12m ? brl(it.dy12m * 100) + "%" : "—"],
    ["P/L", it.pe ? brl(it.pe) : "—"],
    ["P/VP", it.pvp ? brl(it.pvp) : "—"],
    ["ROE", pctv(f.roe)],
    ["Margem líquida", pctv(f.margemLiq)],
    ["EV/EBITDA", nz(f.evEbitda) != null ? brl(f.evEbitda!) : "—"],
    ["No período", periodo],
    ["Dív. líq./Patrim.", nz(f.divLiqPatrim) != null ? brl(f.divLiqPatrim!) : "—"],
    ["Último provento", last ? moneyC(last.amount, it.currency) : "—"],
    ["Valor de mercado", big(it.marketCap)],
    ["Volume (ações)", big(it.volume)],
    ["Cresc. receita 5a", pctv(f.crescRec5a)],
  ];
  const pts = it.points.map(([x, y]) => ({ x, y }));

  return (
    <div className="card">
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <div className="tk" style={{ fontSize: 17 }}>
            {it.logo && !semLogo && <img className="logo" src={it.logo} alt="" onError={() => setSemLogo(true)} />}
            <span className="dot" style={{ background: c }} />{it.ticker} <span className="badge">{it.type}</span>
          </div>
          <div className="name" title={it.name}>{it.name}</div>
          <div className="name muted">{it.sector || ""}{it.industry ? (it.sector ? " · " : "") + it.industry : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div>
            <div className="price">{moneyC(it.price, it.currency)}</div>
            <div className={"chg " + signCls(it.changePct)}>{arrow(it.changePct)} {pct(it.changePct)} hoje</div>
          </div>
          <button className="x" title="Remover" aria-label={`Remover ${it.ticker}`} onClick={onRemover}>×</button>
        </div>
      </div>
      <div className="mini">{pts.length > 0 && <Grafico deps={[it.symbol, pts.length, pts[pts.length - 1].y]} config={canvas => configPreco(canvas, pts, c, it.currency)} />}</div>
      <div>
        <div className="range52">Faixa de 52 semanas</div>
        <div className="bar52"><b style={{ left: `${pos}%` }} /></div>
        <div className="range52 bar52-l"><span>{moneyC(it.low52, it.currency)}</span><span>{moneyC(it.high52, it.currency)}</span></div>
      </div>
      <div className="stats">{stats.map(([k, v]) => <div className="stat" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>
      {divs.length > 0 && (
        <details className="divs" onToggle={e => { if (e.currentTarget.open) setDivsAberto(true); }}>
          <summary>Proventos (últimos 2 anos · {divs.length} pagamentos)</summary>
          {/* o gráfico só é criado na primeira vez que abre, como no app atual */}
          <div className="divbox">{divsAberto && <Grafico deps={[it.symbol, divs.length]} config={() => configProventos(divs, c, it.currency)} />}</div>
        </details>
      )}
      {it.summary && <details><summary>{isFII ? "Sobre o fundo" : "Sobre a empresa"}</summary><div className="about">{it.summary}</div></details>}
      <div className="range52">Gráfico: {it.sources?.grafico || "—"} · cotação: {it.sources?.cotacao || "—"} · indicadores: {it.sources?.indicadores || "—"}</div>
    </div>
  );
}

function configPreco(canvas: HTMLCanvasElement, pts: { x: number; y: number }[], c: string, cur?: string): ChartConfiguration<"line"> {
  const min = pts[0].x, max = pts[pts.length - 1].x;
  const grad = canvas.getContext("2d")?.createLinearGradient(0, 0, 0, 150);
  grad?.addColorStop(0, c + "33"); grad?.addColorStop(1, c + "00");
  return {
    type: "line",
    data: { datasets: [{ data: pts, borderColor: c, backgroundColor: grad ?? c, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: c, pointHoverBorderColor: css("--surface"), pointHoverBorderWidth: 2, tension: 0.15 }] },
    options: {
      maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOpts(), displayColors: false,
          callbacks: { title: i => fmtDate(i[0].parsed.x ?? 0), label: i => moneyC(i.parsed.y, cur) + "  (" + pct(((i.parsed.y ?? 0) / pts[0].y - 1) * 100) + " no período)" },
        },
      },
      scales: {
        x: { type: "linear", min, max, grid: { display: false }, border: { display: false }, ticks: { ...tickOpts(), maxTicksLimit: 4, callback: timeTicks(min, max) } },
        y: { position: "right", grid: gridOpts(), border: { display: false }, ticks: { ...tickOpts(), maxTicksLimit: 4, callback: v => brl(Number(v)) } },
      },
    },
    plugins: [crosshair],
  };
}

function configProventos(divs: { date: number; amount: number }[], c: string, cur?: string): ChartConfiguration<"bar"> {
  return {
    type: "bar",
    data: { labels: divs.map(d => fmtDate(d.date)), datasets: [{ data: divs.map(d => d.amount), backgroundColor: c, borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom", maxBarThickness: 18, categoryPercentage: .85, barPercentage: .9 }] },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipOpts(), displayColors: false, callbacks: { label: i => moneyC(i.parsed.y, cur) + " por cota/ação" } } },
      scales: {
        x: { grid: { display: false }, border: { color: css("--border") }, ticks: { ...tickOpts(), maxTicksLimit: 6, maxRotation: 0 } },
        y: { grid: gridOpts(), border: { display: false }, ticks: { ...tickOpts(), maxTicksLimit: 4, callback: v => brl(Number(v), 2) } },
      },
    },
  };
}
