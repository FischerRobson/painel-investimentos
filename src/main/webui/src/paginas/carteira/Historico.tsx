// Evolução do patrimônio: as fotos diárias das 18h (/api/historico). Dias em que uma cotação falhou usam o último valor
// conhecido e ficam marcados no gráfico.
import { addDays } from "../../motor";
import { hojeISO, isoBR } from "../../lib/dados";
import { big, money, pct, signCls } from "../../lib/formato";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda } from "../../componentes/Campos";

type Foto = { t: number; i: number; stale?: { asset: string; since?: string }[]; missing?: string[] };

// "valor anterior para PETR4 (de 20/11/2026); sem valor para BTC"
export function notaDaFoto(f: Foto): string {
  const desde = (d?: string) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? isoBR(d) : d;
  const stale = (f.stale || []).map(s => s.asset + (s.since ? ` (de ${desde(s.since)})` : ""));
  const missing = f.missing || [];
  return [stale.length ? "valor anterior para " + stale.join(", ") : "", missing.length ? "sem valor para " + missing.join(", ") : ""]
    .filter(Boolean).join("; ");
}

function Delta({ a, b }: { a: number; b: number }) {
  const d = b - a;
  return <><span className={signCls(d)}>{d > 0 ? "+" : d < 0 ? "−" : ""}{money(Math.abs(d))}</span> <span className="muted">{a ? pct((b / a - 1) * 100) : ""}</span></>;
}

export function Historico({ hist: bruto }: { hist: Record<string, unknown> }) {
  const hist = bruto as Record<string, Foto>;
  const days = Object.keys(hist).sort();
  const intro = "O painel tira uma foto do seu patrimônio todo dia às 18h (horário de Brasília), mesmo sem você abrir a página.";
  if (days.length < 2) return (
    <div className="panel"><h2>Evolução do patrimônio</h2>
      <div className="hint" style={{ marginTop: 6 }}>{intro} {days.length ? `A primeira foi em ${isoBR(days[0])}; o gráfico aparece a partir do segundo dia.` : "A primeira sai hoje às 18h."}</div></div>
  );
  const first = hist[days[0]], last = hist[days[days.length - 1]];
  const d30 = days.filter(d => d <= addDays(hojeISO(), -30)).pop();
  const flagged = days.filter(d => notaDaFoto(hist[d])).slice(-5).reverse();
  const x = (d: string) => new Date(d + "T12:00:00").getTime();
  const marked = new Set(days.flatMap((d, i) => notaDaFoto(hist[d]) ? [i] : []));

  return (
    <div className="panel"><h2>Evolução do patrimônio</h2>
      <div className="hint">{intro} Inclui aportes e retiradas, então não é só rentabilidade.</div>
      <div className="tiles">
        <div className="tile"><div className="k">Desde {isoBR(days[0])}</div><div className="v" style={{ fontSize: 16 }}><Delta a={first.t} b={last.t} /></div><div className="s">patrimônio total</div></div>
        {d30 && <div className="tile"><div className="k">Últimos 30 dias</div><div className="v" style={{ fontSize: 16 }}><Delta a={hist[d30].t} b={last.t} /></div><div className="s">patrimônio total</div></div>}
        <div className="tile"><div className="k">Última foto</div><div className="v" style={{ fontSize: 16 }}>{isoBR(days[days.length - 1])}</div><div className="s">{days.length} dias salvos</div></div>
      </div>
      <Legenda itens={[["Patrimônio total", css("--s1")], ["Investimentos", css("--s2"), true],
        ...(flagged.length ? [["Usou valor anterior", css("--s4")] as [string, string]] : [])]} />
      <div className="proj-box">
        <Grafico rotulo="Evolução do patrimônio" deps={[JSON.stringify(hist)]}
          config={canvas => configLinha(canvas, [
            { label: "Patrimônio total", color: css("--s1"), data: days.map(d => ({ x: x(d), y: hist[d].t })), marked, markColor: css("--s4") },
            { label: "Investimentos", color: css("--s2"), dash: [5, 4], data: days.map(d => ({ x: x(d), y: hist[d].i })) },
          ], {
            fmtY: v => "R$ " + big(v), fmtTip: v => money(v), height: 230,
            tipFooter: i => { const n = notaDaFoto(hist[days[i]]); return n ? "⚠ " + n : ""; },
          })} />
      </div>
      {flagged.length > 0 && <>
        <div className="hint" style={{ marginTop: 8 }}>Quando uma cotação falha na hora da foto, o painel usa o último valor conhecido e marca o dia:</div>
        <ul className="hint" style={{ margin: "4px 0 0 18px" }}>{flagged.map(d => <li key={d}>{isoBR(d)}: {notaDaFoto(hist[d])}</li>)}</ul>
      </>}
    </div>
  );
}
