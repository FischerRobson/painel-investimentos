// Mapa da carteira: um retângulo por ativo, com o tamanho pelo valor de hoje e a cor pela variação dos últimos 30 dias.
// O número com sinal vai junto, para a leitura não depender da cor. Bens ficam de fora.
import { useEffect, useRef, useState } from "react";
import { brl, money, pct, signCls } from "../../lib/formato";
import { treemap } from "../../lib/treemap";
import type { Comparativo, SerieAtivo } from "../../lib/comparativo";
import { NOME_SERIE } from "./Desempenho";

// A cor chega no máximo em ±10% no período: variações maiores ficam na mesma intensidade
const COR_CHEIA = 10;
const fundo = (ret: number) => {
  if (Math.abs(ret) < 0.05) return "var(--grid)";
  const forca = 14 + Math.min(1, Math.abs(ret) / COR_CHEIA) * 41;
  return `color-mix(in srgb, var(${ret > 0 ? "--good" : "--bad"}) ${forca.toFixed(0)}%, var(--surface))`;
};

export function Mapa({ d, erro }: { d: Comparativo | null; erro: string | null }) {
  return (
    <div className="panel">
      <h2>Mapa da carteira</h2>
      <div className="hint">Cada retângulo é um ativo: o tamanho é quanto ele vale hoje, e a cor é a variação nos últimos 30 dias. Toque num retângulo para ver os detalhes.</div>
      {erro ? <div className="err">{erro}</div> : !d ? <div className="status">Buscando históricos…</div>
        : !d.ativos.length ? <div className="hint">Sem ativos com histórico para desenhar.</div> : <Retangulos d={d} />}
    </div>
  );
}

function Retangulos({ d }: { d: Comparativo }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 1000, h: 380 });
  const [escolhido, setEscolhido] = useState<string | null>(null);
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const obs = new ResizeObserver(([e]) => { if (e.contentRect.width) setTam({ w: e.contentRect.width, h: e.contentRect.height }); });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const total = d.ativos.reduce((s, a) => s + a.valor, 0);
  const parte = (a: SerieAtivo) => brl(a.valor / total * 100, 1) + "% da carteira";
  const sel = d.ativos.find(a => a.id === escolhido);
  return <>
    <div className="mapa" ref={caixa}>
      {treemap(d.ativos, a => a.valor, tam.w, tam.h).map(r => (
        <button key={r.item.id} type="button" className={"mapa-item" + (escolhido === r.item.id ? " on" : "")}
          style={{ left: `${r.x / tam.w * 100}%`, top: `${r.y / tam.h * 100}%`, width: `${r.w / tam.w * 100}%`, height: `${r.h / tam.h * 100}%`, background: fundo(r.item.ret) }}
          aria-label={`${r.item.nome}: ${money(r.item.valor)}, ${parte(r.item)}, ${pct(r.item.ret, 1)} em 30 dias`}
          title={`${r.item.nome} · ${NOME_SERIE[r.item.classe]}\n${money(r.item.valor)} · ${parte(r.item)}\n${pct(r.item.ret, 1)} em 30 dias`}
          onClick={() => setEscolhido(e => e === r.item.id ? null : r.item.id)}>
          <span className="mapa-texto"><b>{r.item.nome}</b><span>{pct(r.item.ret, 1)}</span><small>{money(r.item.valor)}</small></span>
        </button>
      ))}
    </div>
    <div className="status" role="status">{sel
      ? <><b>{sel.nome}</b> ({NOME_SERIE[sel.classe]}): {money(sel.valor)}, {parte(sel)}, <span className={signCls(sel.ret)}>{pct(sel.ret, 1)}</span> em 30 dias.</>
      : `A cor fica no máximo a partir de ${COR_CHEIA}% para cima ou para baixo; cinza é sem variação. É variação de preço, sem proventos; renda fixa na curva.`}
      {d.fora.length ? ` Sem histórico (fora do mapa): ${d.fora.join(", ")}.` : ""}</div>
  </>;
}
