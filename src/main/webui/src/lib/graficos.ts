// Chart.js com as opções visuais do painel (grade, eixos, tooltip, crosshair, linha, barras, rosca e radar).
// Só os módulos usados são registrados, para o bundle ficar menor.
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, LinearScale, LineController, LineElement,
  PointElement, RadarController, RadialLinearScale, Tooltip, type ChartConfiguration, type Plugin, type ScriptableContext, type TooltipModel,
} from "chart.js";
import { brl } from "./formato";

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, DoughnutController, ArcElement, RadarController,
  RadialLinearScale, LinearScale, CategoryScale, Filler, Tooltip);

// Cor de um token CSS (--s1, --grid...), lida na hora: muda com o tema claro/escuro
export const css = (v: string): string => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
// Cor da série i (paleta --s1 a --s8)
export const cor = (i: number): string => css(`--s${(i % 8) + 1}`);

export const gridOpts = () => ({ color: css("--grid"), drawTicks: false });
export const tickOpts = () => ({ color: css("--text-3"), font: { size: 11 }, padding: 6 });
export const tooltipOpts = () => ({
  backgroundColor: css("--surface"), titleColor: css("--text"), bodyColor: css("--text-2"),
  borderColor: css("--border"), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
});
export function timeTicks(min: number, max: number) {
  const spanDays = (max - min) / 864e5;
  return (v: string | number) => {
    const d = new Date(v);
    if (spanDays > 400) return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };
}

// Linha vertical acompanhando o mouse
export const crosshair: Plugin = {
  id: "crosshair",
  afterDraw(chart) {
    const a = chart.tooltip?.getActiveElements?.();
    if (!a || !a.length) return;
    const x = a[0].element.x, { top, bottom } = chart.chartArea, ctx = chart.ctx;
    ctx.save(); ctx.strokeStyle = css("--text-3"); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
  },
};

export type PontoXY = { x: number; y: number };
export type SerieLinha = {
  data: PontoXY[]; color: string; label?: string; dash?: number[];
  marked?: Set<number>; markColor?: string;
};
export type OpcoesLinha = {
  fmtY?: (v: number) => string; fmtTip?: (v: number) => string; fill?: boolean; height?: number;
  tipFooter?: ((i: number) => string) | null;
};

// Gráfico de linha simples (1 ou mais séries), com crosshair. null quando não há pontos.
export function configLinha(canvas: HTMLCanvasElement, datasets: SerieLinha[],
  { fmtY = v => brl(v), fmtTip = v => brl(v), fill = true, height = 150, tipFooter = null }: OpcoesLinha = {}): ChartConfiguration<"line"> | null {
  const all = datasets.flatMap(d => d.data);
  if (!all.length) return null;
  const min = Math.min(...all.map(p => p.x)), max = Math.max(...all.map(p => p.x));
  return {
    type: "line",
    data: {
      datasets: datasets.map((d, i) => {
        let bg: string | CanvasGradient = d.color;
        if (fill && i === 0) {
          const g = canvas.getContext("2d")?.createLinearGradient(0, 0, 0, height);
          if (g) { g.addColorStop(0, d.color + "33"); g.addColorStop(1, d.color + "00"); bg = g; }
        }
        return {
          label: d.label, data: d.data, borderColor: d.color, backgroundColor: bg, fill: fill && i === 0, borderWidth: 2,
          borderDash: d.dash || [],
          pointRadius: (c: ScriptableContext<"line">) => d.marked?.has(c.dataIndex) ? 5 : d.data.length < 8 ? 3 : 0,
          pointBackgroundColor: (c: ScriptableContext<"line">) => d.marked?.has(c.dataIndex) ? d.markColor ?? d.color : d.color,
          pointHoverRadius: 4, pointHoverBorderColor: css("--surface"), pointHoverBorderWidth: 2, tension: 0.2,
        };
      }),
    },
    options: {
      maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOpts(), displayColors: datasets.length > 1,
          callbacks: {
            title: i => new Date(i[0].parsed.x ?? 0).toLocaleDateString("pt-BR"),
            label: i => (datasets.length > 1 ? " " + i.dataset.label + ": " : "") + fmtTip(i.parsed.y ?? 0),
            footer: i => tipFooter && i.length ? tipFooter(i[0].dataIndex) : "",
          },
        },
      },
      scales: {
        x: { type: "linear", min, max, grid: { display: false }, border: { display: false }, ticks: { ...tickOpts(), maxTicksLimit: 5, callback: timeTicks(min, max) } },
        y: { position: "right", grid: gridOpts(), border: { display: false }, ticks: { ...tickOpts(), maxTicksLimit: 4, callback: v => fmtY(Number(v)) } },
      },
    },
    plugins: [crosshair],
  };
}

// Gráfico de barras (custos por mês e por dia)
export function configBarras(labels: string[], values: number[], fmt: (v: number) => string,
  fmtEixo: (v: number) => string): ChartConfiguration<"bar"> {
  return {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: css("--s1"), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom", maxBarThickness: 28 }] },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipOpts(), displayColors: false, callbacks: { label: i => fmt(i.parsed.y ?? 0) } } },
      scales: {
        x: { grid: { display: false }, border: { color: css("--border") }, ticks: { ...tickOpts(), maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { grid: gridOpts(), border: { display: false }, beginAtZero: true, ticks: { ...tickOpts(), maxTicksLimit: 4, callback: v => fmtEixo(Number(v)) } },
      },
    },
  };
}

// Rosca da divisão da carteira. O tooltip do Chart.js fica desligado: aoPassar recebe a fatia e a posição na tela
// (ou null ao sair), e a página desenha o detalhe dela.
export function configRosca(nomes: string[], valores: number[], cores: string[],
  aoPassar: (fatia: { i: number; x: number; y: number } | null) => void): ChartConfiguration<"doughnut"> {
  return {
    type: "doughnut",
    data: { labels: nomes, datasets: [{ data: valores, backgroundColor: cores, borderColor: css("--surface"), borderWidth: 2, hoverOffset: 6, borderRadius: 3 }] },
    options: {
      cutout: "64%", maintainAspectRatio: false, animation: false, layout: { padding: 8 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: ({ chart, tooltip }: { chart: Chart; tooltip: TooltipModel<"doughnut"> }) => {
            if (!tooltip.opacity || !tooltip.dataPoints?.length) return aoPassar(null);
            const r = chart.canvas.getBoundingClientRect();
            aoPassar({ i: tooltip.dataPoints[0].dataIndex, x: r.left + tooltip.caretX, y: r.top + tooltip.caretY });
          },
        },
      },
    },
  };
}
