// Evolução do patrimônio: os investimentos na foto das 18h dos dias de pregão da B3 (/api/historico; bens ficam de fora).
// Clicar num ponto do gráfico (ou escolher o dia na lista) mostra as posições daquele dia (/api/positions/AAAA-MM-DD).
// Dias em que uma cotação falhou usam o último valor conhecido e ficam marcados no gráfico.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, fluxosDasOperacoes, governados, processar, rentabilidade, type TituloRF } from "../../motor";
import { agrupaPosicoes } from "../../lib/gruposPosicoes";
import { apiFetch } from "../../lib/api";
import { useCarteira } from "../../lib/carteira";
import { hojeISO, isoBR, useDatasPosicoes, usePosicoes, type DiaPosicoes, type LinhaPosicao } from "../../lib/dados";
import { big, brl, money, pct, signCls } from "../../lib/formato";
import { FX_SYM } from "../../lib/cambio";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda, Selecao, Campo } from "../../componentes/Campos";
import { EsqueletoLinhas } from "../../componentes/Esqueleto";

type Foto = { t: number; i: number; stale?: { asset: string; since?: string }[]; missing?: string[] };

// "valor anterior para PETR4 (de 20/11/2026); sem valor para BTC"
export function notaDaFoto(f: Foto): string {
  const desde = (d?: string) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? isoBR(d) : d;
  const stale = (f.stale || []).map(s => s.asset + (s.since ? ` (de ${desde(s.since)})` : ""));
  const missing = f.missing || [];
  return [stale.length ? "valor anterior para " + stale.join(", ") : "", missing.length ? "sem valor para " + missing.join(", ") : ""]
    .filter(Boolean).join("; ");
}

const sinal = (v: number) => v > 0 ? "+" : v < 0 ? "−" : "";

function Delta({ a, b }: { a: number; b: number }) {
  const d = b - a;
  return <><span className={signCls(d)}>{sinal(d)}{money(Math.abs(d))}</span> <span className="muted">{a ? pct((b / a - 1) * 100) : ""}</span></>;
}

// tipos: o tipo de hoje de cada ticker (FII, Exterior...), para separar as posições
export function Historico({ hist: bruto, tipos }: { hist: Record<string, unknown>; tipos: Record<string, string> }) {
  const hist = bruto as Record<string, Foto>;
  const days = Object.keys(hist).sort();
  const [dia, setDia] = useState<string | null>(null);
  const { doc } = useCarteira();
  const temOperacoes = !!doc?.operacoes?.length;
  // CDI acumulado no mesmo período, para comparar
  const cdi = useQuery({
    queryKey: ["cdi-periodo", days[0], days.at(-1)], enabled: temOperacoes && days.length > 1, retry: false, staleTime: Infinity,
    queryFn: async () => {
      const j = await (await apiFetch(`/api/rates?from=${days[0]}`)).json() as { cdi?: [string, number][] };
      return ((j.cdi ?? []).filter(([d]) => d > days[0] && d <= days.at(-1)!).reduce((f, [, v]) => f * (1 + v / 100), 1) - 1) * 100;
    },
  });
  const datas = useDatasPosicoes();
  const intro = "O painel tira uma foto dos seus investimentos às 18h (horário de Brasília) nos dias de pregão da B3, mesmo sem você abrir a página.";
  if (days.length < 2) return (
    <div className="panel"><h2>Evolução do patrimônio</h2>
      <div className="hint" style={{ marginTop: 6 }}>{intro} {days.length ? `A primeira foi em ${isoBR(days[0])}; o gráfico aparece a partir do segundo dia.` : "A primeira sai no próximo dia de pregão, às 18h."}</div>
      {days.length === 1 && <Posicoes dia={days[0]} tipos={tipos} primeiraComPosicoes={datas.data?.[0]} />}
    </div>
  );
  const first = hist[days[0]], last = hist[days[days.length - 1]];
  const d30 = days.filter(d => d <= addDays(hojeISO(), -30)).pop();
  const flagged = days.filter(d => notaDaFoto(hist[d])).slice(-5).reverse();
  const x = (d: string) => new Date(d + "T12:00:00").getTime();
  const marked = new Set(days.flatMap((d, i) => notaDaFoto(hist[d]) ? [i] : []));
  const comPosicoes = [...(datas.data ?? [])].reverse();
  const twr = rentabilidadeSemAportes(days.map(d => ({ data: d, valor: hist[d].i })), doc);

  return (
    <div className="panel"><h2>Evolução do patrimônio</h2>
      <div className="hint">{intro} Inclui aportes e retiradas, então não é só rentabilidade.</div>
      <div className="tiles">
        <div className="tile"><div className="k">Desde {isoBR(days[0])}</div><div className="v" style={{ fontSize: 16 }}><Delta a={first.i} b={last.i} /></div><div className="s">investimentos</div></div>
        {d30 && <div className="tile"><div className="k">Últimos 30 dias</div><div className="v" style={{ fontSize: 16 }}><Delta a={hist[d30].i} b={last.i} /></div><div className="s">investimentos</div></div>}
        {twr.total != null && <div className="tile"><div className="k">Rentabilidade sem aportes</div><div className={"v " + signCls(twr.total)} style={{ fontSize: 16 }}>{pct(twr.total)}</div>
          <div className="s">desde {isoBR(days[0])}{cdi.data != null ? ` · CDI ${pct(cdi.data)}${cdi.data > 0 ? ` (${brl(twr.total / cdi.data * 100, 0)}% do CDI)` : ""}` : ""}</div></div>}
        <div className="tile"><div className="k">Última foto</div><div className="v" style={{ fontSize: 16 }}>{isoBR(days[days.length - 1])}</div><div className="s">{days.length} dias salvos</div></div>
      </div>
      <Legenda itens={[["Investimentos", css("--s1")], ...(flagged.length ? [["Usou valor anterior", css("--s4")] as [string, string]] : [])]} />
      <div className="proj-box">
        <Grafico rotulo="Evolução dos investimentos; clique num dia para ver as posições" deps={[JSON.stringify(hist)]}
          config={canvas => configLinha(canvas, [
            { label: "Investimentos", color: css("--s1"), data: days.map(d => ({ x: x(d), y: hist[d].i })), marked, markColor: css("--s4") },
          ], {
            fmtY: v => "R$ " + big(v), fmtTip: v => money(v), height: 230,
            tipFooter: i => { const n = notaDaFoto(hist[days[i]]); return n ? "⚠ " + n : "Clique para ver as posições"; },
            aoClicar: i => setDia(days[i]),
          })} />
      </div>
      {flagged.length > 0 && <>
        <div className="hint" style={{ marginTop: 8 }}>Quando uma cotação falha na hora da foto, o painel usa o último valor conhecido e marca o dia:</div>
        <ul className="hint" style={{ margin: "4px 0 0 18px" }}>{flagged.map(d => <li key={d}>{isoBR(d)}: {notaDaFoto(hist[d])}</li>)}</ul>
      </>}
      <div className="w-add" style={{ marginTop: 12 }}>
        <Campo inline rotulo="Posições do dia"><Selecao value={dia ?? ""} onChange={e => setDia(e.target.value || null)} aria-label="Posições do dia">
            <option value="">{comPosicoes.length ? "escolha um dia" : "nenhum dia salvo ainda"}</option>
            {comPosicoes.map(d => <option key={d} value={d}>{isoBR(d)}</option>)}
          </Selecao></Campo>
        {!dia && <span className="status">ou clique num ponto do gráfico.</span>}
      </div>
      {dia && <Posicoes dia={dia} tipos={tipos} primeiraComPosicoes={datas.data?.[0]} onFechar={() => setDia(null)} />}
    </div>
  );
}

// Retorno da carteira sem contar o dinheiro que entrou ou saiu (compras, vendas, proventos, aplicações e resgates).
// Só faz sentido com as operações lançadas: sem elas, cada compra pareceria rendimento.
function rentabilidadeSemAportes(pontos: { data: string; valor: number }[], doc: ReturnType<typeof useCarteira>["doc"]) {
  if (!doc?.operacoes?.length) return { total: null };
  const comOps = governados(doc.operacoes).rf;
  const rf = ((doc.rendaFixa ?? []) as TituloRF[]).filter(t => !comOps.has(t.id)).map(t => ({ data: t.data, aplicado: t.aplicado }));
  return rentabilidade(pontos, fluxosDasOperacoes(doc.operacoes, doc.proventos ?? [], rf));
}

// Tabela das posições de um dia, comparadas com o dia de pregão anterior salvo
function Posicoes({ dia, tipos, primeiraComPosicoes, onFechar }: { dia: string; tipos: Record<string, string>; primeiraComPosicoes?: string; onFechar?: () => void }) {
  const q = usePosicoes(dia);
  const anterior = usePosicoes(q.data?.previousDate); // para marcar a troca de faixa do IR na renda fixa
  const cabecalho = (
    <div className="w-head" style={{ marginTop: 14 }}>
      <h3 style={{ margin: 0 }}>Posições em {isoBR(dia)}{q.data?.previousDate && <span className="muted" style={{ fontWeight: 400 }}> · comparadas com {isoBR(q.data.previousDate)}</span>}</h3>
      {onFechar && <button type="button" className="link" onClick={onFechar}>Fechar</button>}
    </div>
  );
  if (q.isPending) return <>{cabecalho}<EsqueletoLinhas n={5} texto="Carregando as posições…" /></>;
  if (q.isError) return <>{cabecalho}<div className="hint">Sem posições salvas neste dia{primeiraComPosicoes && primeiraComPosicoes > dia ? ` (o painel guarda as posições desde ${isoBR(primeiraComPosicoes)})` : ""}.</div></>;
  return <>{cabecalho}<TabelaPosicoes d={q.data} anterior={anterior.data} tipos={tipos} /></>;
}

const Pnl = ({ v }: { v: number | null }) => v == null ? <span className="muted">—</span> : <span className={signCls(v)}>{sinal(v)}{money(Math.abs(v))}</span>;

// Renda fixa: "valor bruto (valor líquido)"
const brutoLiquido = (bruto: number | undefined, liquido: number) => bruto != null ? `${money(bruto)} (${money(liquido)})` : money(liquido);

function TabelaPosicoes({ d, anterior, tipos }: { d: DiaPosicoes; anterior?: DiaPosicoes; tipos: Record<string, string> }) {
  const { doc } = useCarteira();
  const classes = Object.fromEntries(Object.values(processar(doc?.operacoes ?? []).posicoes).map(p => [p.ativo, p.classe]));
  const grupos = agrupaPosicoes(d.positions, classes, tipos);
  const antes = new Map((anterior?.positions ?? []).map(l => [l.key, l]));
  // o bruto do dia anterior vem do arquivo daquele dia (0 se o título ainda não existia)
  const brutoAntes = (l: LinhaPosicao) => l.ppv === 0 ? 0 : antes.get(l.key)?.gross;
  const faixaAntes = new Map((anterior?.positions ?? []).map(l => [l.key, l.taxRate]));
  return <>
    <div className="table-wrap"><table className="w-table">
      <thead><tr><th>Ativo</th><th>Quantidade</th><th>Preço</th><th>PV</th><th>PPV</th><th>PnL do dia</th></tr></thead>
      {grupos.map(g => {
        const rf = g.id === "rf";
        const soma = (f: (l: LinhaPosicao) => number | undefined) => g.linhas.every(l => f(l) != null) ? g.linhas.reduce((t, l) => t + f(l)!, 0) : undefined;
        return (
          <tbody key={g.id} aria-label={g.nome}>
            <tr className="grupo">
              <th scope="rowgroup" colSpan={3}>{g.nome}</th>
              <th>{rf ? brutoLiquido(soma(l => l.gross), g.pv) : money(g.pv)}</th>
              <th>{rf ? brutoLiquido(soma(brutoAntes), g.ppv) : money(g.ppv)}</th>
              <th><Pnl v={g.pnl} /></th>
            </tr>
            {g.linhas.map(l => {
              const mudouIr = rf && l.taxRate != null && faixaAntes.get(l.key) != null && faixaAntes.get(l.key) !== l.taxRate;
              return (
                <tr key={l.key}>
                  <td><span className="tk">{l.asset}</span></td>
                  <td>{quantidade(l)}</td>
                  <td>{preco(l)}{l.missing ? <> <span className="muted">sem preço</span></> : l.staleSince != null && <> <span className="muted" title="A cotação falhou na hora da foto: valor anterior">(de {l.staleSince ? isoBR(l.staleSince) : "antes"})</span></>}</td>
                  <td>{rf ? brutoLiquido(l.gross, l.pv) : money(l.pv)}</td>
                  <td>{rf ? brutoLiquido(brutoAntes(l), l.ppv) : money(l.ppv)}</td>
                  <td><Pnl v={l.pnl} />{mudouIr && <> <span className="muted" title={`IR passou de ${brl(faixaAntes.get(l.key)! * 100, 1)}% para ${brl(l.taxRate! * 100, 1)}%`}>mudou a faixa de IR</span></>}</td>
                </tr>
              );
            })}
          </tbody>
        );
      })}
      <tfoot><tr><th>Total</th><th></th><th></th><th>{money(d.totals.pv)}</th><th>{money(d.totals.ppv)}</th><th><Pnl v={d.totals.pnl} /></th></tr></tfoot>
    </table></div>
    <div className="status">PV = preço × quantidade · PPV = PV do dia anterior · PnL = quantidade do dia anterior × variação do preço (compras e vendas não contam como lucro).
      Renda fixa: PV e PPV aparecem como valor bruto (valor líquido), o total geral usa o líquido, quantidade = valor aplicado e preço = valor líquido na curva por real aplicado.</div>
  </>;
}

function quantidade(l: LinhaPosicao): string {
  if (l.kind === "fixedIncome") return money(l.notional);
  if (l.kind === "fx") return (FX_SYM[l.asset] || l.asset) + " " + brl(l.notional, l.asset === "JPY" || l.asset === "ARS" ? 0 : 2);
  if (l.kind === "crypto") return brl(l.notional, 8).replace(/0+$/, "").replace(/,$/, "");
  return brl(l.notional, l.notional % 1 ? 2 : 0);
}

function preco(l: LinhaPosicao): string {
  if (l.kind === "fixedIncome") return brl(l.price, 4);
  if (l.kind === "fx") return "R$ " + brl(l.price, l.price < 0.1 ? 5 : 4);
  return money(l.price);
}
