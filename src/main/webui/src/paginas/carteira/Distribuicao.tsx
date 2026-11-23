// Divisão da carteira: rosca por classe (renda variável, renda fixa, cripto, moedas) e a legenda. Passar o mouse numa fatia ou
// numa linha da legenda (ou focar a linha pelo teclado) mostra os ativos daquela classe.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Chart } from "chart.js";
import { brl, money } from "../../lib/formato";
import { configRosca, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";

export type Categoria = { name: string; color: string; value: number; note: string; items: { name: string; sub: string; value: number }[] };
type Fatia = { i: number; x: number; y: number };

export function Distribuicao({ cats, total, vBens, share }: { cats: Categoria[]; total: number; vBens: number; share: (v: number) => number }) {
  const [fatia, setFatia] = useState<Fatia | null>(null);
  const grafico = useRef<Chart | null>(null);
  const destacar = (i: number | null) => {
    const ch = grafico.current;
    if (!ch) return;
    ch.setActiveElements(i == null ? [] : [{ datasetIndex: 0, index: i }]);
    ch.update("none");
  };
  const naLinha = (i: number, el: HTMLElement) => {
    destacar(i);
    const b = el.getBoundingClientRect();
    setFatia({ i, x: b.right - 40, y: b.top });
  };
  const sair = () => { destacar(null); setFatia(null); };

  return (
    <div className="dist">
      <div className="pie-box">
        <Grafico rotulo="Divisão da carteira" deps={[JSON.stringify(cats.map(c => [c.name, c.value, c.color]))]}
          aoCriar={ch => { grafico.current = ch; }} onMouseLeave={() => setFatia(null)}
          config={() => configRosca(cats.map(c => c.name), cats.map(c => c.value), cats.map(c => css(c.color)), setFatia)} />
        <div className="pie-center"><div className="k">Total</div><div className="v">{money(total)}</div></div>
      </div>
      <div className="pie-legend">
        <div className="hint" style={{ margin: "0 0 4px" }}>Passe o mouse em uma fatia ou categoria para ver os ativos.{vBens ? ` Bens (${money(vBens)}) não entram no gráfico.` : ""}</div>
        {cats.map((c, i) => (
          <div key={c.name} className="pl-row" tabIndex={0}
            onMouseEnter={e => naLinha(i, e.currentTarget)} onFocus={e => naLinha(i, e.currentTarget)} onMouseLeave={sair} onBlur={sair}>
            <i style={{ background: `var(${c.color})` }} /><span className="pl-name">{c.name}</span>
            <span className="pl-val">{money(c.value)}</span><span className="pl-pct">{brl(share(c.value), 1)}%</span>
          </div>
        ))}
      </div>
      {fatia && cats[fatia.i] && createPortal(<Detalhe c={cats[fatia.i]} total={total} x={fatia.x} y={fatia.y} />, document.body)}
    </div>
  );
}

// Ativos da classe, perto do mouse sem sair da tela
function Detalhe({ c, total, x, y }: { c: Categoria; total: number; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 16, top: y + 12 });
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = x + 16, top = y + 12;
    if (left + w > innerWidth - 8) left = Math.max(8, x - w - 16);
    if (top + h > innerHeight - 8) top = Math.max(8, innerHeight - h - 8);
    setPos({ left, top });
  }, [x, y, c]);
  const items = [...c.items].sort((a, b) => b.value - a.value);
  return (
    <div id="bk-tip" role="tooltip" ref={ref} style={{ display: "block", ...pos }}>
      <div className="bk-h"><i style={{ background: `var(${c.color})` }} />{c.name}<span>{money(c.value)} · {brl(c.value / total * 100, 1)}%</span></div>
      {c.note && <div className="bk-n">{c.note}</div>}
      {items.map(it => (
        <div key={it.name} className="bk-r">
          <span className="bk-name">{it.name} <span className="muted">{it.sub || ""}</span></span>
          <span className="bk-v">{money(it.value)}</span><span className="bk-p">{brl(it.value / c.value * 100, 1)}%</span>
          <span className="bk-bar"><span style={{ width: `${it.value / c.value * 100}%`, background: `var(${c.color})` }} /></span>
        </div>
      ))}
    </div>
  );
}
