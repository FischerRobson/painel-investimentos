// Desempenho de cada ativo no período, todos partindo de 0% (como no comparativo da tela Ativos), com a linha do total investido
// como régua. Só os últimos 30 dias. Bens ficam de fora. Contas em lib/comparativo.ts.
import { useState } from "react";
import type { ChartConfiguration } from "chart.js";
import { fmtDate, pct, signCls } from "../../lib/formato";
import { cor, crosshair, css, gridOpts, tickOpts, timeTicks, tooltipOpts } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import type { ClasseSerie, Comparativo, SerieAtivo } from "../../lib/comparativo";
import { EsqueletoGrafico } from "../../componentes/Esqueleto";

export const NOME_SERIE: Record<ClasseSerie, string> = { acao: "Ação", fii: "FII", exterior: "Exterior", rf: "Renda fixa", cripto: "Cripto", moeda: "Moeda" };
const TOTAL = "Total investido";

type Linha = SerieAtivo & { cor: number };
// A paleta tem 8 cores; do 9º ativo em diante o traço muda para não confundir duas linhas da mesma cor
const traco = (i: number) => i < 8 ? [] : i < 16 ? [6, 4] : [2, 3];

export function Desempenho({ d, erro, versao }: { d: Comparativo | null; erro: string | null; versao: string }) {
  const [escondidos, setEscondidos] = useState<Set<string>>(() => new Set());
  return (
    <div className="panel">
      <h2>Desempenho dos seus ativos</h2>
      <div className="hint">Variação nos últimos 30 dias, todos partindo de 0%. A linha grossa é a régua: o seu total investido, sem bens. Clique num nome para esconder ou mostrar.</div>
      {erro ? <div className="err">{erro}</div>
        : !d ? <EsqueletoGrafico altura={300} texto="Buscando os históricos…" />
        : d.vazia || !d.series.carteira.length ? <div className="hint">Sem histórico para desenhar neste período.</div>
        : <Corpo d={d} escondidos={escondidos} versao={versao}
          alternar={id => setEscondidos(h => { const n = new Set(h); if (!n.delete(id)) n.add(id); return n; })} />}
    </div>
  );
}

function Corpo({ d, escondidos, versao, alternar }: { d: Comparativo; escondidos: Set<string>; versao: string; alternar: (id: string) => void }) {
  // a cor segue o ativo: não muda ao esconder outro
  const linhas: Linha[] = d.ativos.map((a, i) => ({ ...a, cor: i }));
  const total = d.ret.carteira!;
  const acima = linhas.filter(l => l.ret > total).length;
  return <>
    <div className="legend leg-ativos">
      <button type="button" className={escondidos.has(TOTAL) ? "off" : undefined} aria-pressed={!escondidos.has(TOTAL)} onClick={() => alternar(TOTAL)}>
        <i className="regua" /><b>{TOTAL}</b> <b className={signCls(total)}>{pct(total, 1)}</b>
      </button>
      {linhas.map(l => (
        <button key={l.id} type="button" className={escondidos.has(l.id) ? "off" : undefined} aria-pressed={!escondidos.has(l.id)} onClick={() => alternar(l.id)}>
          <i style={{ background: traco(l.cor).length ? `repeating-linear-gradient(90deg, ${cor(l.cor)} 0 4px, transparent 4px 6px)` : cor(l.cor) }} />{l.nome} <b className={signCls(l.ret)}>{pct(l.ret, 1)}</b>
        </button>
      ))}
    </div>
    <div className="cmp-box">
      <Grafico rotulo="Desempenho de cada ativo e do total investido" deps={[versao, [...escondidos].join()]}
        config={() => configDesempenho(d.series.carteira, linhas.filter(l => !escondidos.has(l.id)), !escondidos.has(TOTAL))} />
    </div>
    <div className="status">{linhas.length > 0 && `${acima} de ${linhas.length} ${linhas.length === 1 ? "ativo ficou" : "ativos ficaram"} acima do total investido. `}
      É a sua composição de hoje levada para o passado (cada ativo pesando pelo valor atual): não é a sua rentabilidade real, porque não considera quando você comprou, nem vendas e aportes.
      Só variação de preço, sem proventos. Renda fixa é refeita pelo CDI e pelo IPCA, na curva.
      {d.fora.length ? ` Sem histórico no período (fora do gráfico e da régua): ${d.fora.join(", ")}.` : ""}{d.avisos.length ? " " + d.avisos.join("; ") + "." : ""}</div>
  </>;
}

function configDesempenho(regua: [number, number][], linhas: Linha[], comRegua: boolean): ChartConfiguration<"line"> {
  const base = { pointRadius: 0, pointHoverRadius: 4, pointHoverBorderWidth: 2, pointHoverBorderColor: css("--surface"), tension: 0.15 };
  const pontos = (s: [number, number][]) => s.map(([x, y]) => ({ x, y: (y - 1) * 100 }));
  const min = regua[0][0], max = regua[regua.length - 1][0];
  return {
    type: "line",
    data: {
      datasets: [
        // order menor é desenhado por cima
        ...(comRegua ? [{ ...base, label: TOTAL, data: pontos(regua), borderColor: css("--text"), backgroundColor: css("--text"), borderWidth: 3.5, order: 0 }] : []),
        ...linhas.map(l => ({ ...base, label: l.nome, data: pontos(l.serie), borderColor: cor(l.cor), backgroundColor: cor(l.cor), borderWidth: 1.5, borderDash: traco(l.cor), order: 1 })),
      ],
    },
    options: {
      maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOpts(), mode: "index", intersect: false, itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
          bodyFont: { size: linhas.length > 12 ? 10 : 12 },
          callbacks: { title: i => fmtDate(i[0].parsed.x ?? 0), label: i => ` ${i.dataset.label}: ${pct(i.parsed.y)}` },
        },
      },
      scales: {
        x: { type: "linear", min, max, grid: { display: false }, border: { color: css("--border") }, ticks: { ...tickOpts(), maxTicksLimit: 7, callback: timeTicks(min, max) } },
        // a linha do zero fica mais marcada que as outras
        y: { grid: { ...gridOpts(), color: ctx => ctx.tick.value === 0 ? css("--text-3") : css("--grid") }, border: { display: false }, ticks: { ...tickOpts(), callback: v => v + "%" } },
      },
    },
    plugins: [crosshair],
  };
}
