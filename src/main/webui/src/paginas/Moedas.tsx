// Moedas: cotação de compra em reais, histórico do período e quanto o usuário tem de cada moeda (vai para a carteira).
// A quantidade só muda por operação: compra ou venda, com o valor em reais e a data (ficam em Operações).
import { useState } from "react";
import { useTitulo } from "../lib/useTitulo";
import { store } from "../lib/store";
import { arrow, brl, money, pct, signCls } from "../lib/formato";
import { FX_CODES, avisoCambio, erroCambio, fxDec, moneyC, useCambio, type Cambio } from "../lib/cambio";
import { useCarteira } from "../lib/carteira";
import { novoIdOp, operacoesStore } from "../lib/operacoes";
import { hojeISO } from "../lib/dados";
import { governados } from "../motor";
import { configLinha, cor } from "../lib/graficos";
import { Grafico } from "../componentes/Grafico";
import { ErroCarteira } from "../componentes/ErroCarteira";

const PERIODOS: [number, string][] = [[30, "30 dias"], [180, "6 meses"], [360, "1 ano"]];

export function Moedas() {
  useTitulo("Moedas");
  const [dias, setDiasState] = useState(() => Number(store.get("fxDays", "30")) || 30);
  const setDias = (d: number) => { setDiasState(d); store.set("fxDays", String(d)); };
  const cambio = useCambio(dias);
  const carteira = useCarteira();

  if (carteira.erro) return <ErroCarteira msg={carteira.erro} />;
  const fx = cambio.data;
  if (!fx) return <div className={"panel " + (cambio.isError ? "err" : "muted")}>{cambio.isError ? erroCambio(cambio.error) : "Carregando cotações…"}</div>;
  if (!carteira.doc) return <div className="panel muted">Carregando cotações…</div>;

  const moedas = carteira.doc.moedas ?? [];
  const tenho = (c: string) => moedas.find(m => m.c === c)?.q || 0;
  const total = FX_CODES.reduce((a, c) => a + tenho(c) * (fx.quotes[c]?.bid || 0), 0);
  const comOps = governados(carteira.doc.operacoes ?? []).moedas;

  return <>
    <div className="panel">
      <div className="w-head">
        <div>
          <h2>Moedas</h2>
          <div className="hint" style={{ margin: 0 }}>Cotação de compra em reais (AwesomeAPI). Lance as compras e vendas de cada moeda e o valor entra no patrimônio da Carteira.</div>
          {avisoCambio(fx) && <div className="status" style={{ marginTop: 6 }}>{avisoCambio(fx)}</div>}
        </div>
        <div className="seg">
          {PERIODOS.map(([d, l]) => <button key={d} className={dias === d ? "on" : undefined} onClick={() => setDias(d)}>{l}</button>)}
        </div>
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="k">Você tem em moedas estrangeiras</div>
          <div className="v">{money(total)}</div>
          <div className="s">{moedas.filter(m => m.q).map(m => moneyC(m.q, m.c)).join(" · ") || "nenhum valor informado ainda"}</div>
        </div>
      </div>
    </div>
    <div className="grid">
      {FX_CODES.map((c, i) => <CartaoMoeda key={c} c={c} i={i} fx={fx} tenho={tenho(c)} semHistorico={tenho(c) > 0 && !comOps.has(c)} />)}
    </div>
  </>;
}

function CartaoMoeda({ c, i, fx, tenho, semHistorico }: { c: string; i: number; fx: Cambio; tenho: number; semHistorico: boolean }) {
  const q = fx.quotes[c];
  if (!q) return null;
  const h = fx.history[c] || [], first = h[0]?.[1], per = first ? (q.bid / first - 1) * 100 : null;
  const dec = fxDec(fx, c);
  const pontos = h.map(([x, y]) => ({ x, y }));
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="tk" style={{ fontSize: 17 }}><span className="dot" style={{ background: `var(--s${(i % 8) + 1})` }} />{c}</div>
          <div className="name">{q.name}</div>
        </div>
        <div>
          <div className="price">R$ {brl(q.bid, dec)}</div>
          <div className={"chg " + signCls(q.pct)}>{arrow(q.pct)} {pct(q.pct)} hoje</div>
        </div>
      </div>
      <div className="mini">
        <Grafico deps={[pontos, dec]} config={canvas => configLinha(canvas, [{ data: pontos, color: cor(i) }],
          { fmtY: v => brl(v, q.bid < 0.1 ? dec : 2), fmtTip: v => "R$ " + brl(v, dec) })} />
      </div>
      <div className="stats">
        <div className="stat"><div className="k">Máx. do dia</div><div className="v">R$ {brl(q.high, dec)}</div></div>
        <div className="stat"><div className="k">Mín. do dia</div><div className="v">R$ {brl(q.low, dec)}</div></div>
        <div className="stat"><div className="k">No período</div><div className={"v " + (per == null ? "muted" : signCls(per))}>{pct(per)}</div></div>
      </div>
      <div className="fx-have">
        <div>Você tem <b>{tenho ? moneyC(tenho, c) : "—"}</b></div>
        <div>{tenho ? <>vale <b>{money(tenho * q.bid)}</b></> : <span className="muted">R$ 100 = {moneyC(100 / q.bid, c)}</span>}</div>
      </div>
      <OperacaoMoeda key={c + tenho} c={c} bid={q.bid} tenho={tenho} semHistorico={semHistorico} />
    </div>
  );
}

// Compra ou venda da moeda; o valor em reais vem sugerido pela cotação de hoje (troque pelo que você pagou ou recebeu).
// Moeda que já estava na carteira sem histórico pede antes o saldo inicial (quanto custou o que você tem).
function OperacaoMoeda({ c, bid, tenho, semHistorico }: { c: string; bid: number; tenho: number; semHistorico: boolean }) {
  const [tipo, setTipo] = useState<"compra" | "venda">("compra");
  const [qtd, setQtd] = useState(""), [valor, setValor] = useState(""), [data, setData] = useState(hojeISO());
  const n = semHistorico ? tenho : Number(qtd);
  const sugerido = n > 0 ? +(n * bid).toFixed(2) : null;
  const reais = valor !== "" ? Number(valor) : sugerido ?? 0;
  const lancar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(n > 0) || !(reais > 0)) return;
    if (!semHistorico && tipo === "venda" && n > tenho + 1e-9) return;
    operacoesStore.lancar({
      id: novoIdOp(), data, tipo: semHistorico ? "compra" : tipo, classe: "moeda", ativo: c, qtd: n, valor: reais, cambio: +(reais / n).toFixed(6),
      ...(semHistorico ? { inicial: true, valorPresente: 0, obs: "saldo que já estava na carteira" } : {}),
    });
    setQtd(""); setValor("");
  };
  return (
    <form className="fx-op" onSubmit={lancar} aria-label={`Operação em ${c}`}>
      {semHistorico
        ? <span className="status" style={{ width: "100%" }}>Saldo sem histórico. Informe quando e por quanto você comprou estes {moneyC(tenho, c)}.</span>
        : <label>Operação<select value={tipo} onChange={e => setTipo(e.target.value as "compra" | "venda")} aria-label={`Comprar ou vender ${c}`}>
            <option value="compra">Comprar</option><option value="venda" disabled={!tenho}>Vender</option></select></label>}
      {!semHistorico && <label>Quantidade ({c})<input type="number" min="0" step="any" required max={tipo === "venda" ? tenho : undefined}
        value={qtd} onChange={e => setQtd(e.target.value)} aria-label={`Quantidade de ${c}`} /></label>}
      <label>{tipo === "venda" && !semHistorico ? "Recebi (R$)" : "Paguei (R$)"}<input type="number" min="0.01" step="0.01" placeholder={sugerido != null ? String(sugerido) : ""}
        required={semHistorico} value={valor} onChange={e => setValor(e.target.value)} aria-label={`Valor em reais de ${c}`} /></label>
      <label>Data<input type="date" max={hojeISO()} required value={data} onChange={e => setData(e.target.value)} aria-label={`Data da operação em ${c}`} /></label>
      <button className="primary" type="submit">{semHistorico ? "Salvar saldo" : "Lançar"}</button>
    </form>
  );
}
