// Orçamento: entradas e saídas do mês, avisos de gasto, meta × realizado por área, importação de extrato/fatura, lançamentos
// recorrentes, próximos meses, histórico de 12 meses, metas e regras de descrição. Contas e gravação em lib/orcamento.ts.
// O mês aberto fica na URL (/orcamento#2026-01).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ChartConfiguration } from "chart.js";
import { useTitulo } from "../../lib/useTitulo";
import { big, brl, money, signCls } from "../../lib/formato";
import { css, gridOpts, tickOpts, tooltipOpts } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { useVR } from "../../lib/vr";
import { DEMO } from "../../lib/store";
import {
  FILTRO_PADRAO, MES_VALIDO, api, aplicarRegra, avisosDeGasto, gerarDoMes, gravacaoMes, hojeIso, regraPara, mesCurto, mesDe, referencia, somaMeses,
  tituloMes, totais, valoresArea,
  type AreaId, type Aviso, type DocRecorrentes, type Filtro, type ItemLista, type Mes, type Metas, type Referencia, type RegraRecorrente, type Regra,
  type ResumoMes, type Tipo, type ValorArea,
} from "../../lib/orcamento";
import { Lancamentos } from "./Lancamentos";
import { Importacao, BotaoImportar, LinhaUltimaImportacao, StatusImportacao, type EstadoImportacao } from "./Importacao";
import { MetasPorArea, Regras, type RascunhoRegra } from "./Configuracoes";
import { AbasOrcamento } from "./Abas";
import { Recorrentes, rascunhoVazio, type RascunhoRecorrente } from "./Recorrentes";
import { Proximos } from "./Proximos";

type Vista = { mes: string; dados: Mes; resumo: ResumoMes[] };
export type Edicao = { kind: Tipo; id: string } | null;

const mesDaUrl = () => MES_VALIDO.test(location.hash.slice(1)) ? location.hash.slice(1) : mesDe(new Date());

export function Orcamento() {
  useTitulo("Orçamento");
  const qc = useQueryClient();
  const [mes, setMes] = useState(mesDaUrl);
  const [vista, setVista] = useState<Vista | null>(null);
  const [metas, setMetas] = useState<Metas | null>(null);
  const [regras, setRegras] = useState<Regra[] | null>(null); // null: sem regras (o painel não aparece)
  const [recorrentes, setRecorrentes] = useState<DocRecorrentes | null>(null); // null: não carregou (sem painel e sem criar lançamentos)
  const [recorrentesAbertas, setRecorrentesAbertas] = useState(false);
  const [rascunhoRecorrente, setRascunhoRecorrente] = useState<RascunhoRecorrente | null>(null);
  const [erroRecorrentes, setErroRecorrentes] = useState<string | null>(null);
  const vr = useVR();
  const recorrentesRef = useRef(recorrentes);
  recorrentesRef.current = recorrentes;
  const criando = useRef<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const [editando, setEditando] = useState<Edicao>(null);
  const [tipoForm, setTipoForm] = useState<Tipo>("expense");
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_PADRAO);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [importacao, setImportacao] = useState<EstadoImportacao | null>(null);
  const [importou, setImportou] = useState<string | null>(null);
  const [metasAbertas, setMetasAbertas] = useState(false);
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [rascunhoRegra, setRascunhoRegra] = useState<RascunhoRegra | null>(null);
  const [erroRegras, setErroRegras] = useState<string | null>(null);
  const [foco, setFoco] = useState<{ alvo: "regra" | "renda" | "form" | "importacao" | "recorrente"; n: number } | null>(null);

  // Mês, resumo de 12 meses, metas e regras (metas e regras só na primeira vez). Passa pelo TanStack Query para o
  // "Atualizado às" do cabeçalho, mas o estado fica aqui (ETag e edições).
  useEffect(() => {
    let vivo = true;
    const m = mes;
    void qc.fetchQuery({
      queryKey: ["orcamento", m, recarga], staleTime: 0, gcTime: 0, retry: false,
      queryFn: () => Promise.all([
        metas ? null : api.metas(), api.mes(m), api.resumo(m), regras ? null : api.regras().catch(() => null),
        recorrentes ? null : api.recorrentes().catch(() => null),
      ]),
    }).then(([novasMetas, dados, resumo, novasRegras, novosRecorrentes]) => {
      if (!vivo) return;
      if (novasMetas) setMetas(novasMetas);
      if (novasRegras) setRegras(novasRegras.rules);
      if (novosRecorrentes) setRecorrentes(novosRecorrentes);
      setVista({ mes: m, dados, resumo });
      setErro(null);
    }).catch(e => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [mes, recarga]);
  // Lançamentos recorrentes: ao abrir o mês (atual ou anterior), cria os que faltam. O mês é gravado antes de marcar as regras
  // como criadas; se a gravação falhar, nada é marcado e a próxima abertura tenta de novo.
  useEffect(() => {
    if (!vista || !recorrentes) return;
    const m = vista.mes, r = gerarDoMes(m, vista.dados, recorrentes, hojeIso());
    if (!r.criados && r.regras.length === (recorrentes.generated[m]?.length ?? 0)) return;
    if (criando.current === m) return;
    criando.current = m;
    void (async () => {
      try {
        if (r.criados) {
          setVista(v => v && v.mes === m ? { ...v, dados: r.mes } : v);
          gravacaoMes.agendar(m, r.mes);
          if ((await gravacaoMes.descarregar()) !== true) return;
        }
        const atual = recorrentesRef.current ?? recorrentes;
        const doc: DocRecorrentes = { rules: atual.rules, generated: { ...atual.generated, [m]: r.regras } };
        // na demonstração nada é gravado: sem a marca, o mês criado de novo ao voltar a ele, como no resto da demonstração
        if (!(await api.salvarRecorrentes(doc)) && !DEMO) { setRecorrentes(doc); void qc.invalidateQueries({ queryKey: ["orcamento-futuro"] }); }
      } finally { criando.current = null; }
    })();
  }, [vista?.mes, recorrentes]);
  // O Planejador (Ferramentas) usa o resumo do orçamento: ao sair daqui ele busca de novo
  useEffect(() => () => { void gravacaoMes.descarregar(); void qc.invalidateQueries({ queryKey: ["planejador-orcamento"] }); }, []);

  if (erro) return <><AbasOrcamento /><div className="panel err">{erro}</div></>;
  if (!vista || !metas) return <><AbasOrcamento /><div className="panel muted">Carregando o orçamento…</div></>;
  const { dados } = vista;

  const mudarDados = (novo: Mes) => {
    setVista(v => v && { ...v, dados: novo });
    gravacaoMes.agendar(vista.mes, novo);
  };
  const irParaMes = async (k: string) => {
    await gravacaoMes.descarregar();
    setEditando(null);
    setFiltro(f => ({ ...f, from: "", to: "" }));
    setMostrarTodos(false);
    history.replaceState(null, "", "#" + k);
    if (k === mes) setRecarga(n => n + 1); else setMes(k);
  };
  const salvarMetas = async (patch: Partial<Metas>) => {
    const next = { ...metas, ...patch };
    if (await api.salvarMetas(next)) { setMetas(next); return true; }
    return false;
  };
  const abrirRegra = (d: Omit<RascunhoRegra, "id" | "apply"> & { id?: string | null }) => {
    if (!regras) return;
    setRascunhoRegra({ id: null, apply: true, ...d });
    setRegrasAbertas(true);
    setErroRegras(null);
    setFoco({ alvo: "regra", n: Date.now() });
  };
  const salvarRegras = async (lista: Regra[]) => {
    setErroRegras(null);
    const e = await api.salvarRegras(lista);
    if (e) { setErroRegras(e); return false; }
    setRegras(lista);
    setRascunhoRegra(null);
    return true;
  };
  const salvarRecorrentes = async (lista: RegraRecorrente[]) => {
    if (!recorrentes) return false;
    setErroRecorrentes(null);
    const doc: DocRecorrentes = { rules: lista, generated: recorrentes.generated };
    const e = await api.salvarRecorrentes(doc);
    if (e) { setErroRecorrentes(e); return false; }
    setRecorrentes(doc);
    return true;
  };
  // ↻ numa linha: abre o formulário com os dados do lançamento. A regra começa no mês seguinte, porque este lançamento já existe.
  const repetirTodoMes = (x: ItemLista) => {
    if (!recorrentes) return;
    setRascunhoRecorrente({
      ...rascunhoVazio(), kind: x.kind, description: x.description, amount: String(x.amount), area: (x.area ?? "fixedCosts") as AreaId,
      method: x.method ?? "", day: String(Number(x.date.slice(8))), start: somaMeses(vista!.mes, 1),
    });
    setRecorrentesAbertas(true);
    setErroRecorrentes(null);
    setFoco({ alvo: "recorrente", n: Date.now() });
  };
  // Nova regra: renomeia os itens da importação em revisão e, se pedido, os lançamentos já salvos do mês
  const usarRegra = (regra: Regra, noMes: boolean) => {
    if (importacao?.items) {
      setImportacao({
        ...importacao, items: importacao.items.map(i => {
          const original = i.originalDescription || i.description;
          if (!regraPara(original, [regra])) return i;
          return { ...i, originalDescription: original, description: regra.description, ...(regra.area && i.type === "expense" ? { area: regra.area } : {}) };
        }),
      });
    }
    if (noMes) {
      const { mes: novo, changed } = aplicarRegra(dados, regra);
      if (changed) mudarDados(novo);
    }
  };

  const t = totais(dados), saldo = t.income - t.expenses;
  const ref = referencia(t, metas, vista.resumo, vista.mes), areas = valoresArea(t, ref, metas);
  const refNote = ref.source === "history" ? ` de ${mesCurto(ref.month!)}` : ref.source === "setting" ? " de referência" : "";
  const atual = vista.mes === mesDe(new Date());
  const contagem = (n: number) => `${n} ${n === 1 ? "lançamento" : "lançamentos"}`;
  const serie = vista.resumo.map(s => s.month === vista.mes ? { ...s, income: t.income, expenses: t.expenses } : s);
  const temHistorico = serie.some(s => s.income || s.expenses);
  const avisos = avisosDeGasto(areas, ref, hojeIso(), vista.mes);
  // Gasto pago com VR no mês (líquido de estornos): informativo, fora das metas
  const noVR = vr.doc?.contas.length ? vr.doc.movimentos.filter(m => m.data.startsWith(vista.mes) && (m.tipo === "gasto" || m.tipo === "estorno")) : null;
  const gastoVR = noVR ? noVR.reduce((s, m) => s + (m.tipo === "gasto" ? m.valor : -m.valor), 0) : 0;

  return <>
    <AbasOrcamento />
    <div className="panel">
      <div className="w-head">
        <div><h2>Orçamento</h2><div className="hint" style={{ margin: 0 }}>Entradas e saídas do mês. Gastos do cartão entram no mês da fatura; a data mostrada é a da compra.</div></div>
        <div className="b-month">
          <button type="button" aria-label="Mês anterior" onClick={() => void irParaMes(somaMeses(vista.mes, -1))}>‹</button>
          <strong>{tituloMes(vista.mes)}</strong>
          <button type="button" aria-label="Próximo mês" onClick={() => void irParaMes(somaMeses(vista.mes, 1))}>›</button>
          {!atual && <button type="button" onClick={() => void irParaMes(mesDe(new Date()))}>Mês atual</button>}
        </div>
      </div>
      <div className="tiles">
        <div className="tile"><div className="k">Entradas</div><div className="v">{money(t.income)}</div><div className="s">{contagem(dados.incomes.length)}</div></div>
        <div className="tile"><div className="k">Saídas</div><div className="v">{money(t.expenses)}</div>
          <div className="s">{contagem(dados.expenses.length)}{ref.income ? ` · ${brl(t.expenses / ref.income * 100, 1)}% da renda${refNote}` : ""}</div></div>
        <div className="tile"><div className="k">Saldo</div><div className={"v " + signCls(saldo)}>{money(saldo)}</div><div className="s">{saldo >= 0 ? "sobrou no mês" : "faltou no mês"}</div></div>
        {noVR && <div className="tile"><div className="k">Pago com VR</div><div className="v">{money(gastoVR)}</div>
          <div className="s">fora das metas · <Link to="/orcamento/vr">ver VR</Link></div></div>}
      </div>
    </div>

    {avisos.length > 0 && <div className="panel">
      <h2>Avisos do mês</h2>
      <div className="b-avisos" role="status">{avisos.map(a => <AvisoGasto key={a.area} a={a} />)}</div>
    </div>}

    <div className="panel">
      <h2>Meta × realizado</h2>
      <div className="hint">{ref.income ? "Cada ponta da estrela é uma área. A linha tracejada é a meta (100%); a área azul é o realizado. Pontas vermelhas passaram da meta." : "As metas são uma porcentagem da renda. Informe a sua renda para ver os valores em reais e o gráfico."}</div>
      <AvisoReferencia ref_={ref} mes={vista.mes} onSalvar={v => void salvarMetas({ referenceIncome: v })}
        onEditar={() => { setMetasAbertas(true); setFoco({ alvo: "renda", n: Date.now() }); }} />
      <div className={"b-meta" + (ref.income ? "" : " solo")}>
        {ref.income > 0 && <div>
          <div className="legend"><span><i className="dash" />Meta</span><span><i style={{ background: "var(--s1)" }} />Realizado</span></div>
          <div className="b-radar">
            <Grafico rotulo={"Meta e realizado por área: " + areas.map(v => `${v.area.name} ${money(v.spent)} de ${money(v.goal)}`).join("; ")}
              deps={[JSON.stringify(areas.map(v => [v.goal, v.spent]))]} config={() => configRadar(areas)} />
          </div>
        </div>}
        <div className="b-areas">{areas.map(v => <BarraArea key={v.area.id} v={v} ref_={ref} />)}</div>
      </div>
    </div>

    {importacao?.preview && <Importacao imp={importacao} setImp={setImportacao} mes={vista.mes} foco={foco?.alvo === "importacao" ? foco.n : 0}
      onRegra={abrirRegra}
      onConcluir={async (res) => {
        setImportacao(null);
        void qc.invalidateQueries({ queryKey: ["budget-import-last"] });
        setImportou(`${res.imported} ${res.imported === 1 ? "lançamento importado" : "lançamentos importados"}`
          + (res.months.length ? ` em ${res.months.map(mesCurto).join(", ")}` : "")
          + (res.skipped ? ` (${res.skipped} já existiam)` : "") + ".");
        const alvo = res.months.includes(vista.mes) || !res.months.length ? vista.mes : res.months[0];
        await irParaMes(alvo);
      }} />}

    <div className="panel">
      <div className="w-head">
        <div><h2>Lançamentos</h2><div className="hint" style={{ margin: 0 }}>Entradas e saídas do mês. Troque a área direto na tabela; clique em Data ou Valor para ordenar.</div></div>
        <BotaoImportar imp={importacao} onArquivo={async f => {
          setImportou(null);
          const r = await Importacao.ler(f, setImportacao);
          if (r) setFoco({ alvo: "importacao", n: Date.now() });
        }} />
      </div>
      <LinhaUltimaImportacao />
      <StatusImportacao imp={importacao} importou={importou} />
      <Lancamentos dados={dados} mes={vista.mes} filtro={filtro} setFiltro={setFiltro} mostrarTodos={mostrarTodos} setMostrarTodos={setMostrarTodos}
        editando={editando} setEditando={setEditando} tipoForm={tipoForm} setTipoForm={setTipoForm}
        focoForm={foco?.alvo === "form" ? foco.n : 0} pedirFocoForm={() => setFoco({ alvo: "form", n: Date.now() })}
        onMudar={mudarDados} onRegra={abrirRegra} onRecorrente={repetirTodoMes} />
    </div>

    {temHistorico && <div className="panel">
      <h2>Últimos 12 meses</h2>
      <div className="legend"><span><i style={{ background: "var(--s3)" }} />Entradas</span><span><i style={{ background: "var(--s2)" }} />Saídas</span></div>
      <div className="proj-box"><Grafico deps={[JSON.stringify(serie)]} config={() => configHistorico(serie)} /></div>
    </div>}

    {recorrentes && <Proximos doc={recorrentes} />}

    {recorrentes && <Recorrentes regras={recorrentes.rules} aberto={recorrentesAbertas} setAberto={setRecorrentesAbertas}
      rascunho={rascunhoRecorrente} setRascunho={setRascunhoRecorrente} erro={erroRecorrentes}
      foco={foco?.alvo === "recorrente" ? foco.n : 0} onSalvar={salvarRecorrentes} />}

    <MetasPorArea metas={metas} aberto={metasAbertas} setAberto={setMetasAbertas} foco={foco?.alvo === "renda" ? foco.n : 0} onSalvar={salvarMetas} />
    {regras && <Regras regras={regras} mes={vista.mes} aberto={regrasAbertas} setAberto={setRegrasAbertas}
      rascunho={rascunhoRegra} setRascunho={setRascunhoRegra} erro={erroRegras} setErro={setErroRegras}
      foco={foco?.alvo === "regra" ? foco.n : 0}
      onSalvar={salvarRegras} onUsar={usarRegra} />}
  </>;
}

function AvisoGasto({ a }: { a: Aviso }) {
  return <div className={"b-aviso " + a.nivel}>{a.texto}</div>;
}

// Aviso sobre a renda que as metas estão usando (ou o pedido da renda, se não houver nenhuma)
function AvisoReferencia({ ref_: ref, mes, onSalvar, onEditar }: { ref_: Referencia; mes: string; onSalvar: (v: number) => void; onEditar: () => void }) {
  const [renda, setRenda] = useState("");
  const m = <strong>{tituloMes(mes)}</strong>;
  if (ref.source === "setting") return (
    <div className="b-ref">Nenhuma entrada em {m}. As metas usam a sua renda de referência de <strong>{money(ref.income)}</strong>. <button type="button" className="link" onClick={onEditar}>Alterar</button></div>
  );
  if (ref.source === "history") return (
    <div className="b-ref">Nenhuma entrada em {m}. As metas usam a renda de <strong>{tituloMes(ref.month!)}</strong> ({money(ref.income)}). <button type="button" className="link" onClick={onEditar}>Definir uma renda fixa de referência</button></div>
  );
  if (ref.source) return null;
  return (
    <form className="b-ref b-ref-form" onSubmit={e => { e.preventDefault(); const v = Math.round(Number(renda) * 100) / 100; if (v > 0) onSalvar(v); }}>
      <div><strong>Qual é a sua renda mensal líquida?</strong> Ela vira a base das metas em reais nos meses sem entradas lançadas, e fica salva. Você pode mudar depois em Metas por área.</div>
      <div className="b-ref-row"><input name="income" type="number" min="1" step="0.01" required placeholder="Ex.: 8500" aria-label="Renda mensal líquida (R$)" value={renda} onChange={e => setRenda(e.target.value)} /><button className="primary" type="submit">Usar como referência</button></div>
    </form>
  );
}

function BarraArea({ v: { area, target, goal, spent }, ref_: ref }: { v: ValorArea; ref_: Referencia }) {
  const head = <span className="b-area-name"><i style={{ background: `var(${area.color})` }} />{area.name}</span>;
  if (!ref.income) return (
    <div className="b-area">
      <div className="b-area-head">{head}<span className="b-area-val">{area.automatic ? "" : money(spent)}</span></div>
      <div className="uso-bar"><span className="none" style={{ width: 0 }} /></div>
      <div className="b-area-foot"><span>Meta {brl(target, 0)}% da renda</span><span>informe a renda acima</span></div>
    </div>
  );
  const fill = goal > 0 ? Math.min(100, spent / goal * 100) : 0;
  const share = `${brl(spent / ref.income * 100, 1)}% da renda`;
  let status: React.ReactNode, over = false;
  if (area.automatic) status = spent >= goal ? <span className="up">Meta atingida</span> : <span>Faltam {money(goal - spent)}</span>;
  else {
    over = spent > goal;
    status = over ? <span className="down">{money(spent - goal)} acima da meta</span> : <span className="up">Sobram {money(goal - spent)}</span>;
  }
  return (
    <div className="b-area">
      <div className="b-area-head">{head}<span className="b-area-val">{money(spent)} <span className="muted">de {money(goal)}</span></span></div>
      <div className="uso-bar" role="meter" aria-label={area.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)}>
        <span className={over ? "over" : undefined} style={{ width: `${fill}%`, ...(over ? {} : { background: `var(${area.color})` }) }} /></div>
      <div className="b-area-foot"><span>{area.automatic ? "Sobra do mês (entradas − saídas)" : share} · meta {brl(target, 0)}%</span>{status}</div>
    </div>
  );
}

function configHistorico(serie: ResumoMes[]): ChartConfiguration<"bar"> {
  const bar = (label: string, values: number[], color: string) => ({ label, data: values, backgroundColor: css(color), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom" as const, maxBarThickness: 18 });
  return {
    type: "bar",
    data: { labels: serie.map(s => mesCurto(s.month)), datasets: [bar("Entradas", serie.map(s => s.income), "--s3"), bar("Saídas", serie.map(s => s.expenses), "--s2")] },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipOpts(), callbacks: { label: i => `${i.dataset.label}: ${money(i.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, border: { color: css("--border") }, ticks: { ...tickOpts(), maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: gridOpts(), border: { display: false }, beginAtZero: true, ticks: { ...tickOpts(), maxTicksLimit: 4, callback: v => "R$ " + big(Number(v)) } },
      },
    },
  };
}

// Estrela: meta = 100% em cada área; realizado em % da meta (até 200%)
function configRadar(values: ValorArea[]): ChartConfiguration<"radar"> {
  const CAP = 200;
  const pctOf = (v: ValorArea) => v.goal > 0 ? v.spent / v.goal * 100 : 0;
  const shown = values.map(v => Math.min(CAP, pctOf(v)));
  const max = Math.min(CAP, Math.max(150, Math.ceil(Math.max(...shown) / 50) * 50));
  const isOver = (v: ValorArea) => !v.area.automatic && v.spent > v.goal;
  const real = css("--s1"), meta = css("--s4"), bad = css("--bad"), surface = css("--surface");
  return {
    type: "radar",
    data: {
      labels: values.map(v => v.area.name),
      datasets: [
        { label: "Meta", data: values.map(() => 100), borderColor: meta, borderWidth: 2, borderDash: [6, 4], fill: false, pointRadius: 0, pointHitRadius: 0 },
        {
          label: "Realizado", data: shown, borderColor: real, backgroundColor: real + "2e", borderWidth: 2, fill: true,
          pointRadius: 5, pointHoverRadius: 7, pointHitRadius: 16, pointBorderColor: surface, pointBorderWidth: 2,
          pointBackgroundColor: values.map(v => isOver(v) ? bad : real),
        },
      ],
    },
    options: {
      maintainAspectRatio: false, animation: false, layout: { padding: 4 },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOpts(), filter: i => i.datasetIndex === 1, callbacks: {
            title: items => values[items[0].dataIndex].area.name,
            label: i => {
              const v = values[i.dataIndex];
              return [`Meta: ${money(v.goal)} (${brl(v.target, 0)}% da renda)`,
                `${v.area.automatic ? "Sobra do mês" : "Realizado"}: ${money(v.spent)} (${brl(pctOf(v), 0)}% da meta)`];
            },
          },
        },
      },
      scales: {
        r: {
          min: 0, max, beginAtZero: true, ticks: { display: false, stepSize: 50 },
          grid: { color: css("--grid") }, angleLines: { color: css("--grid") },
          pointLabels: {
            color: css("--text-2"), font: { size: 11 }, padding: 6,
            callback: (label: string, i: number) => [label === "Liberdade financeira" ? "Liberdade fin." : label, `R$ ${big(values[i].spent)} / ${big(values[i].goal)}`],
          },
        },
      },
    },
  };
}

// Rola até o elemento e foca o campo quando `n` muda (n = 0: nada)
export function useFoco<T extends HTMLElement>(n: number, campo?: (el: T) => HTMLElement | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!n || !ref.current) return;
    const alvo = campo ? campo(ref.current) : ref.current;
    alvo?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    alvo?.focus?.();
  }, [n]);
  return ref;
}
