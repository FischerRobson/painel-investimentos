// Moedas: cotação de compra em reais, histórico do período e quanto o usuário tem de cada moeda (vai para a carteira).
import { useState } from "react";
import { useTitulo } from "../lib/useTitulo";
import { store } from "../lib/store";
import { arrow, brl, money, pct, signCls } from "../lib/formato";
import { FX_CODES, erroCambio, fxDec, moneyC, useCambio, type Cambio } from "../lib/cambio";
import { carteiraStore, useCarteira, type Moeda } from "../lib/carteira";
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
  const mudarQtd = (c: string, valor: string) => {
    const q = Math.max(0, Number(valor) || 0);
    carteiraStore.atualizar(doc => {
      const resto: Moeda[] = (doc.moedas ?? []).filter(m => m.c !== c);
      return { ...doc, moedas: q ? [...resto, { c, q }] : resto };
    });
  };

  return <>
    <div className="panel">
      <div className="w-head">
        <div>
          <h2>Moedas</h2>
          <div className="hint" style={{ margin: 0 }}>Cotação de compra em reais (AwesomeAPI). Informe quanto você tem de cada moeda e o valor entra no patrimônio da Carteira.</div>
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
      {FX_CODES.map((c, i) => <CartaoMoeda key={c} c={c} i={i} fx={fx} tenho={tenho(c)} onQtd={v => mudarQtd(c, v)} />)}
    </div>
  </>;
}

function CartaoMoeda({ c, i, fx, tenho, onQtd }: { c: string; i: number; fx: Cambio; tenho: number; onQtd: (v: string) => void }) {
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
        {/* grava ao sair do campo (change), como no app atual */}
        <label>Você tem ({c})
          <input type="number" min="0" step="any" placeholder="0" defaultValue={tenho || ""} key={tenho}
            onBlur={e => { if (Number(e.target.value || 0) !== tenho) onQtd(e.target.value); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </label>
        <div>{tenho ? <>vale <b>{money(tenho * q.bid)}</b></> : <span className="muted">R$ 100 = {moneyC(100 / q.bid, c)}</span>}</div>
      </div>
    </div>
  );
}
