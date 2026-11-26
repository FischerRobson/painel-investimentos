// Fechamento do mês: de onde veio a variação do patrimônio investido, quanto da renda foi poupado, quem puxou o resultado e o que
// merece atenção. Contas em motor/fechamento.ts; esta página busca os dados e mostra. O mês vai no endereço (/fechamento#AAAA-MM).
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { useTitulo } from "../lib/useTitulo";
import { getJson } from "../lib/api";
import { useCarteira } from "../lib/carteira";
import { hojeISO, isoBR, useDatasPosicoes, useHistorico, type DiaPosicoes } from "../lib/dados";
import { api, AREAS, MES_VALIDO, mesCurto, referencia, somaMeses, tituloMes, totais, valoresArea, type Mes, type Metas, type ResumoMes } from "../lib/orcamento";
import { brl, money, pct, signCls } from "../lib/formato";
import {
  contribuicoes, daysBetween, fatorCdi, investidoNoMes, MESES_DE_COMPARACAO, pontePatrimonio, poupancaDoMes,
  type Contribuicao, type FotoMes, type MesOrcamento, type Ponte, type Poupanca, type Provento, type TituloRF,
} from "../motor";
import { ErroCarteira } from "../componentes/ErroCarteira";
import type { PrefSaude } from "../lib/saude";
import { EsqueletoLinhas, EsqueletoPainel } from "../componentes/Esqueleto";

const nomeArea = (id: string) => AREAS.find(a => a.id === id)?.name ?? id;
const comSinal = (v: number) => (v >= 0.005 ? "+" : v <= -0.005 ? "−" : "") + money(Math.abs(v));
// parcela de uma soma: sempre com o sinal, inclusive no zero
const parcela = (v: number) => (v <= -0.005 ? "− " : "+ ") + money(Math.abs(v));
const porcento = (v: number) => brl(v, 1) + "%";

async function buscarOrcamento(mes: string): Promise<{ resumos: MesOrcamento[]; metas: Metas; dados: Mes }> {
  const [r, metas, dados] = await Promise.all([
    getJson<MesOrcamento[]>(`/api/budget/summary?to=${mes}&months=${MESES_DE_COMPARACAO + 1}`),
    getJson<Metas>("/api/budget/settings"),
    api.lerMes(mes),
  ]);
  return { resumos: r, metas, dados };
}

export function Fechamento() {
  useTitulo("Fechamento do mês");
  const { hash } = useLocation();
  const navegar = useNavigate();
  const hoje = hojeISO(), mesAtual = hoje.slice(0, 7);
  const carteira = useCarteira();
  const hist = useHistorico();
  // Sem mês no endereço, abre o último mês fechado; se ele não tem nada registrado, o atual
  const anterior = somaMeses(mesAtual, -1);
  const temAnterior = useQuery({
    queryKey: ["fechamento-tem", anterior], retry: false,
    queryFn: async () => (await getJson<MesOrcamento[]>(`/api/budget/summary?to=${anterior}&months=1`)).some(m => m.income > 0 || m.expenses > 0),
  });
  const pedido = MES_VALIDO.test(hash.slice(1)) && hash.slice(1) <= mesAtual ? hash.slice(1) : null;
  const fotos = (hist.data ?? {}) as unknown as Record<string, FotoMes>;
  const decidido = !hist.isPending && !temAnterior.isPending;
  const mes = pedido ?? (temAnterior.data || Object.keys(fotos).some(d => d.startsWith(anterior)) ? anterior : mesAtual);

  if (carteira.erro) return <ErroCarteira msg={carteira.erro} />;
  if (!carteira.doc || (!pedido && !decidido)) return <><EsqueletoPainel tiles={4} grafico texto="Montando o fechamento…" /><EsqueletoPainel tiles={0} linhas={5} /></>;
  const ir = (m: string) => navegar({ hash: m });
  const parcial = mes === mesAtual;

  return <>
    <div className="panel">
      <div className="w-head">
        <div><h2>Fechamento do mês</h2>
          <div className="hint" style={{ margin: 0 }}>O que aconteceu com o seu dinheiro: o que veio de aporte, o que veio dos investimentos e para onde foi a renda.{parcial && " Este mês ainda não terminou: os números são parciais."}</div></div>
        <div className="b-month">
          <button type="button" aria-label="Mês anterior" onClick={() => ir(somaMeses(mes, -1))}>‹</button>
          <strong>{tituloMes(mes)}</strong>
          <button type="button" aria-label="Próximo mês" disabled={parcial} onClick={() => ir(somaMeses(mes, 1))}>›</button>
        </div>
      </div>
    </div>
    <Conteudo key={mes} mes={mes} fotos={fotos} historicoFalhou={hist.isError} hoje={hoje} />
  </>;
}

function Conteudo({ mes, fotos, historicoFalhou, hoje }: { mes: string; fotos: Record<string, FotoMes>; historicoFalhou: boolean; hoje: string }) {
  const doc = useCarteira().doc!;
  const operacoes = doc.operacoes ?? [], proventos = doc.proventos ?? [], rendaFixa = (doc.rendaFixa ?? []) as TituloRF[];
  const parcial = mes === hoje.slice(0, 7);
  const ponte = pontePatrimonio({ fotos, mes, operacoes, proventos, rendaFixa });

  const orc = useQuery({ queryKey: ["fechamento-orcamento", mes], queryFn: () => buscarOrcamento(mes), retry: false, staleTime: 0 });
  const cdi = useQuery({
    queryKey: ["fechamento-cdi", ponte?.inicio, ponte?.fim], enabled: !!ponte && ponte.twr != null, retry: false, staleTime: Infinity,
    queryFn: async () => {
      const j = await getJson<{ cdi?: [string, number][] }>(`/api/rates?from=${ponte!.inicio}`);
      return j.cdi?.length ? (fatorCdi(j.cdi, ponte!.inicio, ponte!.fim) - 1) * 100 : null;
    },
  });
  // Posições de cada dia da janela, para saber quem puxou o resultado
  const datasPosicoes = useDatasPosicoes();
  const dias = ponte ? (datasPosicoes.data ?? []).filter(d => d > ponte.inicio && d <= ponte.fim) : [];
  const posicoes = useQueries({
    queries: dias.map(d => ({ queryKey: ["positions", d], retry: false, staleTime: Infinity, queryFn: () => getJson<DiaPosicoes>(`/api/positions/${d}`) })),
  });
  const carregados = posicoes.flatMap(p => p.data ? [p.data] : []);
  const posicoesProntas = !datasPosicoes.isPending && posicoes.every(p => !p.isPending);

  const poupanca = orc.data ? poupancaDoMes(orc.data.resumos, mes) : null;
  const temOrcamento = !!poupanca && (poupanca.renda > 0 || poupanca.despesas > 0);
  const doMes = proventos.filter(p => p.data.startsWith(mes));
  const saude = ((doc.preferencias?.saude ?? {}) as Partial<PrefSaude>).hist ?? {};
  const destaques = montarDestaques({ ponte, cdi: cdi.data ?? null, poupanca: temOrcamento ? poupanca : null, orc: orc.data, mes, parcial, rendaFixa, hoje,
    saude: saude[mes]?.geral ?? null, saudeAntes: saude[somaMeses(mes, -1)]?.geral ?? null });

  return <>
    {destaques.length > 0 && <div className="panel">
      <h2>Destaques</h2>
      <ul className="saude-lista">{destaques.map(d => <li key={d.id}><b>{d.titulo}</b> <span className="muted">{d.detalhe}</span>{d.link && <> <Link to={d.link.para}>{d.link.texto}</Link></>}</li>)}</ul>
    </div>}

    <div className="panel">
      <h2>Patrimônio investido</h2>
      {historicoFalhou ? <div className="status down">Não consegui o histórico do patrimônio agora.</div>
        : !ponte ? <div className="hint" style={{ margin: 0 }}>Sem fotos suficientes para este mês. O painel tira uma foto dos investimentos às 18h nos dias de pregão, e o fechamento precisa de pelo menos duas.</div>
        : <PontePainel p={ponte} cdi={cdi.data ?? null} />}
    </div>

    {ponte && <div className="panel">
      <h2>Quem puxou o resultado</h2>
      {!posicoesProntas ? <EsqueletoLinhas n={5} texto="Somando as posições de cada dia…" />
        : !carregados.length ? <div className="hint" style={{ margin: 0 }}>Não há posições por ativo salvas neste período.</div>
        : <Contribuicoes c={contribuicoes(carregados)} comDados={carregados.length} total={ponte.datas.length - 1} />}
    </div>}

    <div className="panel">
      <h2>Renda e gastos</h2>
      {orc.isPending ? <EsqueletoLinhas n={4} texto="Lendo o orçamento…" />
        : orc.isError ? <div className="status down">Não consegui ler o orçamento agora.</div>
        : !temOrcamento ? <div className="hint" style={{ margin: 0 }}>Sem lançamentos neste mês. <Link to={`/orcamento#${mes}`}>Abrir o Orçamento</Link></div>
        : <RendaGastos p={poupanca!} investido={investidoNoMes(operacoes, mes)} temOperacoes={operacoes.length > 0} dados={orc.data.dados} mes={mes} parcial={parcial} />}
    </div>

    <div className="panel">
      <h2>Proventos recebidos</h2>
      <ProventosDoMes proventos={doMes} />
    </div>
  </>;
}

// ---------- Patrimônio ----------
function PontePainel({ p, cdi }: { p: Ponte; cdi: number | null }) {
  const variacao = p.valorFim - p.valorInicio, liquido = p.aportes - p.retiradas;
  const barras = [
    { nome: "Aportes líquidos", valor: liquido, detalhe: `aportes ${money(p.aportes)} − retiradas ${money(p.retiradas)}`, cor: "var(--s1)" },
    { nome: "Valorização", valor: p.valorizacao, detalhe: "variação de preços e juros, já descontados aportes e retiradas", cor: p.valorizacao >= 0 ? "var(--good)" : "var(--bad)" },
    { nome: "Proventos", valor: p.proventos, detalhe: "recebidos em dinheiro: não estão no valor final", cor: "var(--s3)" },
  ];
  const escala = Math.max(...barras.map(b => Math.abs(b.valor)), 1);
  const temNegativo = barras.some(b => b.valor < 0);
  return <>
    <div className="tiles">
      <div className="tile"><div className="k">{isoBR(p.inicio)}</div><div className="v">{money(p.valorInicio)}</div><div className="s">{p.comecaNoMes ? "primeiro registro do mês" : "início"}</div></div>
      <div className="tile"><div className="k">{isoBR(p.fim)}</div><div className="v">{money(p.valorFim)}</div><div className="s"><span className={signCls(variacao)}>{comSinal(variacao)}</span> no período</div></div>
      {p.separavel && <div className="tile"><div className="k">Os investimentos renderam</div><div className={"v " + signCls(p.rendimento)}>{comSinal(p.rendimento)}</div><div className="s">valorização + proventos</div></div>}
      {p.twr != null && <div className="tile"><div className="k">Rentabilidade sem aportes</div><div className={"v " + signCls(p.twr)}>{pct(p.twr)}</div>
        <div className="s">{cdi != null ? `CDI no período: ${pct(cdi)}${cdi > 0 ? ` (${brl(p.twr / cdi * 100, 0)}% do CDI)` : ""}` : "sem o CDI agora"}</div></div>}
    </div>
    {!p.separavel ? <div className="hint">Sem operações lançadas não dá para separar o que foi aporte do que foi rendimento. <Link to="/operacoes">Lançar operações</Link></div> : <>
      <h3>O que mudou</h3>
      <div className={"f-barras" + (temNegativo ? " com-negativo" : "")}>
        {barras.map(b => (
          <div key={b.nome} className="f-linha" title={b.detalhe}>
            <span className="f-nome">{b.nome}</span>
            <span className="f-trilho" aria-hidden>{Math.abs(b.valor) >= 0.005 && <i className={b.valor < 0 ? "neg" : ""} style={{ width: `${Math.abs(b.valor) / escala * (temNegativo ? 50 : 100)}%`, background: b.cor }} />}</span>
            <span className="f-valor">{comSinal(b.valor)}</span>
            <span className="f-detalhe">{b.detalhe}</span>
          </div>
        ))}
      </div>
      <div className="status">Conta: {money(p.valorInicio)} {parcela(liquido)} de aportes líquidos {parcela(p.valorizacao)} de valorização = {money(p.valorFim)}. Bens ficam de fora.</div>
    </>}
    {p.alertas.map(a => <div key={a} className="status" role="status">⚠ {a}</div>)}
  </>;
}

function Contribuicoes({ c, comDados, total }: { c: { altas: Contribuicao[]; baixas: Contribuicao[] }; comDados: number; total: number }) {
  const lista = (titulo: string, itens: Contribuicao[], vazio: string) => (
    <div>
      <h3>{titulo}</h3>
      {!itens.length ? <div className="status">{vazio}</div> : <table className="w-table"><tbody>{itens.map(i => (
        <tr key={i.key}><td className="txt-sm"><span className="tk">{i.ativo}</span></td><td className={signCls(i.pnl)}>{comSinal(i.pnl)}</td></tr>
      ))}</tbody></table>}
    </div>
  );
  return <>
    <div className="f-duas">{lista("Maiores ganhos", c.altas, "Nenhum ativo subiu.")}{lista("Maiores perdas", c.baixas, "Nenhum ativo caiu.")}</div>
    <div className="status">Soma da variação diária de preço de cada ativo (compras, vendas e proventos não entram){comDados < total ? `. Há posições de ${comDados} dos ${total} dias do período, então a soma é parcial` : ""}.</div>
  </>;
}

// ---------- Renda e gastos ----------
function RendaGastos({ p, investido, temOperacoes, dados, mes, parcial }: {
  p: Poupanca; investido: number; temOperacoes: boolean; dados: Mes; mes: string; parcial: boolean;
}) {
  const maiores = [...dados.expenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const taxas = p.serie.filter(s => s.taxa != null);
  const escala = Math.max(...taxas.map(s => Math.abs(s.taxa!)), 1);
  const algumaNegativa = taxas.some(s => s.taxa! < 0);
  return <>
    <div className="tiles">
      <div className="tile"><div className="k">Entradas</div><div className="v">{money(p.renda)}</div></div>
      <div className="tile"><div className="k">Saídas</div><div className="v">{money(p.despesas)}</div>
        <div className="s">{p.comparacao ? `média anterior: ${money(p.comparacao.despesas)}` : "sem meses anteriores para comparar"}</div></div>
      <div className="tile"><div className="k">Poupança{parcial ? " até agora" : ""}</div><div className={"v " + signCls(p.sobra)}>{p.taxa != null ? porcento(p.taxa) : "—"}</div>
        <div className="s">{comSinal(p.sobra)}{p.comparacao?.taxa != null ? ` · média anterior: ${porcento(p.comparacao.taxa)}` : ""}</div></div>
      {temOperacoes && <div className="tile"><div className="k">Investido no mês</div><div className="v">{comSinal(investido)}</div>
        <div className="s">compras e aplicações menos vendas e resgates</div></div>}
    </div>
    {taxas.length > 1 && <>
      <h3>Taxa de poupança</h3>
      <div className={"f-barras" + (algumaNegativa ? " com-negativo" : "")}>
        {taxas.map(s => (
          <div key={s.mes} className="f-linha curta">
            <span className="f-nome">{s.mes === mes ? <b>{mesCurto(s.mes)}</b> : mesCurto(s.mes)}</span>
            <span className="f-trilho" aria-hidden><i className={s.taxa! < 0 ? "neg" : ""} style={{ width: `${Math.abs(s.taxa!) / escala * (algumaNegativa ? 50 : 100)}%`, background: s.taxa! < 0 ? "var(--bad)" : "var(--s1)", opacity: s.mes === mes ? 1 : .55 }} /></span>
            <span className="f-valor">{porcento(s.taxa!)}</span>
          </div>
        ))}
      </div>
    </>}
    <div className="f-duas">
      <div>
        <h3>Gastos por área</h3>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th className="txt-sm">Área</th><th>No mês</th><th>Média anterior</th></tr></thead>
          <tbody>{p.areas.map(a => (
            <tr key={a.area}><td className="txt-sm">{nomeArea(a.area)}</td><td className={a.acima ? "down" : ""}><b>{money(a.gasto)}</b>{a.acima && <span className="sr-only"> acima da média</span>}{a.acima && " ▲"}</td><td>{money(a.media)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      <div>
        <h3>Maiores gastos</h3>
        {!maiores.length ? <div className="status">Nenhuma saída lançada.</div> : <div className="table-wrap"><table className="w-table"><tbody>{maiores.map(e => (
          <tr key={e.id}><td className="txt-sm">{e.description}{e.installment && <span className="muted"> {e.installment}</span>}</td><td>{money(e.amount)}</td></tr>
        ))}</tbody></table></div>}
      </div>
    </div>
    <div className="status">A média usa até {MESES_DE_COMPARACAO} meses anteriores com lançamentos{p.comparacao ? ` (aqui, ${p.comparacao.meses})` : ""}. ▲ marca área pelo menos 20% e R$ 100 acima dela. O que é pago com VR fica de fora. <Link to={`/orcamento#${mes}`}>Abrir o Orçamento deste mês</Link></div>
  </>;
}

function ProventosDoMes({ proventos }: { proventos: Provento[] }) {
  if (!proventos.length) return <div className="hint" style={{ margin: 0 }}>Nenhum provento lançado neste mês. <Link to="/operacoes">Lançar em Operações</Link></div>;
  const porAtivo = new Map<string, number>();
  for (const p of proventos) porAtivo.set(p.ativo, (porAtivo.get(p.ativo) ?? 0) + p.valor);
  const total = proventos.reduce((s, p) => s + p.valor, 0);
  return <>
    <div className="table-wrap"><table className="w-table"><tbody>{[...porAtivo].sort((a, b) => b[1] - a[1]).map(([ativo, v]) => (
      <tr key={ativo}><td className="txt-sm"><span className="tk">{ativo}</span></td><td>{money(v)}</td></tr>
    ))}</tbody><tfoot><tr><th className="txt-sm">Total do mês</th><th>{money(total)}</th></tr></tfoot></table></div>
  </>;
}

// ---------- Destaques ----------
type Destaque = { id: string; titulo: string; detalhe: string; link?: { para: string; texto: string } };

function montarDestaques({ ponte, cdi, poupanca, orc, mes, parcial, rendaFixa, hoje, saude, saudeAntes }: {
  ponte: Ponte | null; cdi: number | null; poupanca: Poupanca | null; orc?: { resumos: MesOrcamento[]; metas: Metas; dados: Mes };
  mes: string; parcial: boolean; rendaFixa: TituloRF[]; hoje: string; saude: number | null; saudeAntes: number | null;
}): Destaque[] {
  const out: Destaque[] = [];
  if (ponte?.separavel) {
    const liquido = ponte.aportes - ponte.retiradas, variacao = ponte.valorFim - ponte.valorInicio;
    if (variacao > 0 && liquido > 0 && ponte.valorizacao > 0) {
      out.push({ id: "origem", titulo: `De cada R$ 100 que o patrimônio cresceu, R$ ${Math.round(liquido / variacao * 100)} vieram de aporte.`, detalhe: `O resto, ${money(ponte.valorizacao)}, veio da valorização.` });
    } else if (variacao > 0 && ponte.valorizacao <= 0) {
      out.push({ id: "origem", titulo: "O patrimônio cresceu só com aporte.", detalhe: `Os preços tiraram ${money(Math.abs(ponte.valorizacao))} no período.` });
    }
    if (ponte.twr != null && cdi != null) {
      const dif = ponte.twr - cdi;
      out.push({ id: "cdi", titulo: Math.abs(dif) < 0.05 ? "A carteira empatou com o CDI." : `A carteira ficou ${brl(Math.abs(dif), 2)} p.p. ${dif > 0 ? "acima" : "abaixo"} do CDI.`,
        detalhe: `${pct(ponte.twr)} contra ${pct(cdi)}, de ${isoBR(ponte.inicio)} a ${isoBR(ponte.fim)}. Um mês só diz pouco sobre a carteira.` });
    }
  }
  if (poupanca?.taxa != null) {
    const media = poupanca.comparacao?.taxa;
    // no mês em andamento a taxa ainda vai mudar: não compara com meses fechados
    if (!parcial && media != null && Math.abs(poupanca.taxa - media) >= 1) {
      out.push({ id: "poupanca", titulo: `Você poupou ${porcento(poupanca.taxa)} da renda, ${poupanca.taxa > media ? "acima" : "abaixo"} da sua média de ${porcento(media)}.`, detalhe: `${poupanca.sobra >= 0 ? "Sobraram" : "Faltaram"} ${money(Math.abs(poupanca.sobra))}.` });
    }
    const acima = poupanca.areas.filter(a => a.acima);
    if (acima.length) out.push({ id: "areas", titulo: `Gastos acima do padrão: ${acima.map(a => nomeArea(a.area)).join(", ")}.`,
      detalhe: acima.map(a => `${nomeArea(a.area)}: ${money(a.gasto)} contra média de ${money(a.media)}`).join("; ") + "." });
  }
  if (poupanca && orc) {
    const t = totais(orc.dados);
    const ref = referencia(t, orc.metas, orc.resumos as ResumoMes[], mes);
    const estouradas = ref.income > 0 ? valoresArea(t, ref, orc.metas).filter(v => !v.area.automatic && v.goal > 0 && v.spent > v.goal) : [];
    if (estouradas.length) out.push({ id: "metas", titulo: `Passou da meta do orçamento: ${estouradas.map(v => v.area.name).join(", ")}.`,
      detalhe: estouradas.map(v => `${money(v.spent - v.goal)} acima em ${v.area.name}`).join("; ") + ".", link: { para: `/orcamento#${mes}`, texto: "Ver orçamento" } });
  }
  if (saude != null) out.push({ id: "saude", titulo: `Nota de saúde da carteira: ${saude}${saudeAntes != null && saudeAntes !== saude ? ` (era ${saudeAntes} no mês anterior)` : ""}.`,
    detalhe: "É a última nota registrada no mês.", link: { para: "/saude", texto: "Ver saúde" } });
  // Vencimentos olham para a frente a partir de hoje, então só aparecem nos dois meses mais recentes
  if (mes >= somaMeses(hoje.slice(0, 7), -1)) {
    const vencem = rendaFixa.filter(t => t.venc && t.venc >= hoje && daysBetween(hoje, t.venc) <= 90).sort((a, b) => a.venc!.localeCompare(b.venc!));
    if (vencem.length) out.push({ id: "vencimentos", titulo: `${vencem.length === 1 ? "Um título vence" : `${vencem.length} títulos vencem`} nos próximos 90 dias.`,
      detalhe: vencem.map(t => `${t.nome} em ${isoBR(t.venc)}`).join("; ") + "." });
  }
  return out;
}
