// Termômetro econômico: IPCA, Selic meta, CDI e juro real realizados (BCB), com as expectativas do Focus numa seção à parte.
import { Fragment } from "react";
import { isoBR, useTermometro, type Termometro as Dados } from "../../lib/dados";
import { brl } from "../../lib/formato";
import { acumulado12, cdiAnual, juroReal } from "../../motor";
import { configLinha, css, type SerieLinha } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda } from "../../componentes/Campos";
import { EsqueletoPainel } from "../../componentes/Esqueleto";

const xy = (pares: [string, number][]) => pares.map(([d, v]) => ({ x: new Date(d + "T12:00:00").getTime(), y: v }));
const mesAnoIso = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

export function Termometro() {
  const q = useTermometro();
  if (q.isPending) return <EsqueletoPainel tiles={4} grafico linhas={3} texto="Carregando as taxas do Banco Central…" />;
  if (!q.data || !q.data.ipca?.length) return <div className="panel err">{q.error?.message || "Sem dados de inflação no Banco Central agora."}</div>;
  return <Conteudo termo={q.data} />;
}

function Conteudo({ termo }: { termo: Dados }) {
  const ipca = termo.ipca, selic = termo.selic || [], cdi = termo.cdi || [];
  const ipca12 = acumulado12(ipca.map(([date, value]) => ({ date, value })));
  const ult = ipca[ipca.length - 1], ult12 = ipca12[ipca12.length - 1];
  const selicUlt = selic[selic.length - 1], cdiUlt = cdi[cdi.length - 1];
  let i = selic.length - 1;
  while (i > 0 && selic[i - 1][1] === selicUlt[1]) i--;
  const selicDesde = selic[i][0];
  const cdiAnualUlt = cdiAnual(cdiUlt[1]);
  const real = juroReal(selicUlt[1], ult12.value);

  // CDI anualizado, média por mês (são ~2.500 pontos diários)
  const porMes = new Map<string, { s: number; n: number; d: string }>();
  for (const [d, v] of cdi) { const k = d.slice(0, 7); const a = porMes.get(k) || { s: 0, n: 0, d }; a.s += cdiAnual(v); a.n++; porMes.set(k, a); }
  const cdiMensal: [string, number][] = [...porMes.values()].map(a => [a.d, a.s / a.n]);
  const ipca12Pares: [string, number][] = ipca12.map(p => [p.date, p.value]);

  const focus = termo.focus || [];
  const anos = [...new Set(focus.map(f => String(f.ano)))].sort();
  const achado = (ind: string, ano: string) => focus.find(f => f.indicador === ind && String(f.ano) === ano);
  const faixa = (f?: { mediana: number; minimo: number; maximo: number }) => f
    ? <><b>{brl(f.mediana)}%</b><br /><span className="muted" style={{ fontSize: 12 }}>faixa {brl(f.minimo)} a {brl(f.maximo)}</span></>
    : <span className="muted">—</span>;
  const grafico = (rotulo: string, datasets: SerieLinha[]) => (
    <div className="proj-box" style={{ height: 200 }}>
      <Grafico rotulo={rotulo} deps={[datasets.map(d => d.data.length).join()]} config={canvas => configLinha(canvas, datasets,
        { fill: false, fmtY: v => brl(v, 1) + "%", fmtTip: v => brl(v, 2) + "%", height: 200 })} />
    </div>
  );

  return (
    <div className="panel">
      <h2>Termômetro econômico</h2>
      <div className="hint">Números realizados do Banco Central: o que já aconteceu. A seção de expectativas, mais abaixo, é outra coisa.</div>
      <div className="tiles">
        <div className="tile"><div className="k">IPCA em 12 meses</div><div className="v">{brl(ult12.value)}%</div><div className="s">até {mesAnoIso(ult12.date)} · mês: {brl(ult[1])}%</div></div>
        <div className="tile"><div className="k">Selic meta</div><div className="v">{brl(selicUlt[1])}% a.a.</div><div className="s">desde {isoBR(selicDesde)}</div></div>
        <div className="tile"><div className="k">CDI anualizado</div><div className="v">{brl(cdiAnualUlt)}% a.a.</div><div className="s">último dia útil: {isoBR(cdiUlt[0])}</div></div>
        <div className="tile"><div className="k">Juro real</div><div className="v">{brl(real)}% a.a.</div><div className="s">Selic contra IPCA de 12 meses · estimativa de referência</div></div>
      </div>
      <div className="status">Dados realizados: IPCA até {mesAnoIso(ult[0])}; Selic e CDI até {isoBR(cdiUlt[0])}. Fonte: Banco Central (SGS 433, 432 e 12).</div>

      <div className="tm-chart"><h3>IPCA mensal</h3>
        {grafico("IPCA mensal", [{ label: "IPCA mensal", color: css("--s2"), data: xy(ipca) }])}</div>
      <div className="tm-chart"><h3>IPCA em 12 meses</h3>
        {grafico("IPCA acumulado em 12 meses", [{ label: "IPCA em 12 meses", color: css("--s2"), data: xy(ipca12Pares) }])}</div>
      <div className="tm-chart"><h3>Juros: Selic meta e CDI anualizado</h3>
        <Legenda itens={[["Selic meta", css("--s1")], ["CDI anualizado (média mensal)", css("--s3")]]} />
        {grafico("Selic meta e CDI anualizado", [{ label: "Selic meta", color: css("--s1"), data: xy(selic) }, { label: "CDI anualizado", color: css("--s3"), data: xy(cdiMensal) }])}</div>
      <div className="tm-chart"><h3>Juros × inflação</h3>
        <Legenda itens={[["Selic meta", css("--s1")], ["IPCA em 12 meses", css("--s2")]]} />
        {grafico("Selic meta contra IPCA em 12 meses", [{ label: "Selic meta", color: css("--s1"), data: xy(selic) }, { label: "IPCA em 12 meses", color: css("--s2"), data: xy(ipca12Pares) }])}</div>

      <div className="focus-box">
        <h3>Expectativas do mercado <span className="focus-tag">projeção</span></h3>
        <div className="hint" style={{ marginBottom: 8 }}>Boletim Focus{termo.focusData ? " de " + isoBR(termo.focusData) : ""}: o que analistas esperam para o fim de cada ano. Não é o que aconteceu. Mostra a mediana e a faixa de respostas (mínima a máxima).</div>
        {termo.focusErro ? <div className="err">{termo.focusErro}</div>
          : !anos.length ? <div className="muted">Nenhuma expectativa publicada agora.</div>
          : <div className="table-wrap"><table className="w-table">
              <thead><tr><th>Ano</th><th>IPCA</th><th>Selic (fim do ano)</th></tr></thead>
              <tbody>{anos.map(a => <Fragment key={a}><tr><td><b>{a}</b></td><td>{faixa(achado("IPCA", a))}</td><td>{faixa(achado("Selic", a))}</td></tr></Fragment>)}</tbody>
            </table></div>}
      </div>
    </div>
  );
}
