// VR: cartões de benefício (vale-refeição, vale-alimentação) controlados como conta. Cada mês entra um crédito; o que não é
// gasto fica acumulado. Mostra o saldo total, o extrato do mês com o saldo depois de cada lançamento, quanto ainda dá
// para gastar por dia até o próximo crédito e o histórico. Contas em motor/vr.ts; dados em /api/budget/vr.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChartConfiguration } from "chart.js";
import { useTitulo } from "../../lib/useTitulo";
import { brl, big, money, signCls } from "../../lib/formato";
import { hojeISO, isoBR } from "../../lib/dados";
import { css, gridOpts, tickOpts, tooltipOpts } from "../../lib/graficos";
import { novoIdVR, useVR, vrStore, type DocVR } from "../../lib/vr";
import { mesCurto, somaMeses, tituloMes } from "../../lib/orcamento";
import {
  ajusteParaSaldo, creditoPendente, efeito, extrato, resumoMensal, ritmoDoMes, saldo,
  type ContaVR, type MovimentoVR, type ResumoMesVR, type TipoMovimento,
} from "../../motor";
import { Grafico } from "../../componentes/Grafico";
import { AbasOrcamento } from "./Abas";
import { EsqueletoPainel } from "../../componentes/Esqueleto";
import { Entrada, Campo } from "../../componentes/Campos";

const TIPOS: [TipoMovimento, string][] = [["gasto", "Gasto"], ["credito", "Crédito"], ["estorno", "Estorno"], ["ajuste", "Ajuste"]];
const CATEGORIAS = ["Restaurante", "Mercado", "Padaria", "Delivery", "Lanche", "Outro"];
const sinal = (v: number) => v > 0 ? "+" : v < 0 ? "−" : "";
const Assinado = ({ v }: { v: number }) => <span className={signCls(v)}>{sinal(v)}{money(Math.abs(v))}</span>;

export function VR() {
  useTitulo("VR");
  const { doc, erro } = useVR();
  // passa pelo TanStack Query só para o "Atualizado às" do cabeçalho
  useQuery({ queryKey: ["vr"], queryFn: () => vrStore.carregar().then(() => true), staleTime: Infinity });
  const [contaId, setContaId] = useState<string | null>(null);

  if (erro) return <><AbasOrcamento /><div className="panel err">Não consegui carregar o VR ({erro}). Recarregue a página em instantes.</div></>;
  if (!doc) return <><AbasOrcamento /><EsqueletoPainel tiles={3} linhas={4} texto="Carregando o VR…" /></>;
  if (!doc.contas.length) return <><AbasOrcamento /><NovaConta primeira /></>;
  const conta = doc.contas.find(c => c.id === contaId) ?? doc.contas[0];
  return <>
    <AbasOrcamento />
    <Conta key={conta.id} conta={conta} doc={doc} contas={doc.contas} onConta={setContaId} />
  </>;
}

function Conta({ conta, doc, contas, onConta }: { conta: ContaVR; doc: DocVR; contas: ContaVR[]; onConta: (id: string) => void }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [editando, setEditando] = useState<MovimentoVR | null>(null);
  const [noApp, setNoApp] = useState("");
  const ms = doc.movimentos;
  const atual = saldo(conta, ms);
  const ritmo = ritmoDoMes(conta, ms, hoje);
  const pendente = creditoPendente(conta, ms, hoje);
  const ext = extrato(conta, ms, mes);
  const resumo = resumoMensal(conta, ms, hoje.slice(0, 7));
  const ultimos = resumo.slice(-12);
  const media = (xs: ResumoMesVR[]) => xs.length ? xs.reduce((s, x) => s + x.gastos - x.estornos, 0) / xs.length : 0;
  const fechados = resumo.filter(r => r.mes < hoje.slice(0, 7)).slice(-3);

  const lancar = (m: MovimentoVR) => vrStore.atualizar(d => ({ ...d, movimentos: d.movimentos.some(x => x.id === m.id) ? d.movimentos.map(x => x.id === m.id ? m : x) : [...d.movimentos, m] }));
  const remover = (m: MovimentoVR) => {
    if (!confirm(`Remover "${m.descricao || TIPOS.find(t => t[0] === m.tipo)![1]}" (${money(m.valor)}) de ${isoBR(m.data)}?`)) return;
    if (editando?.id === m.id) setEditando(null);
    vrStore.atualizar(d => ({ ...d, movimentos: d.movimentos.filter(x => x.id !== m.id) }));
  };
  const conferir = (e: React.FormEvent) => {
    e.preventDefault();
    const v = ajusteParaSaldo(atual, Number(noApp));
    if (noApp === "" || !v) { setNoApp(""); return; }
    lancar({ id: novoIdVR(), conta: conta.id, data: hoje, tipo: "ajuste", descricao: "Ajuste para bater com o app", valor: v });
    setNoApp("");
  };

  return <>
    <div className="panel">
      <div className="w-head">
        <div><h2>{conta.nome}</h2><div className="hint" style={{ margin: 0 }}>Controle do cartão como conta: o que não é gasto no mês fica de saldo para os próximos.</div></div>
        {contas.length > 1 && <div className="seg" role="group" aria-label="Cartão">
          {contas.map(c => <button key={c.id} className={c.id === conta.id ? "on" : undefined} onClick={() => onConta(c.id)}>{c.nome}</button>)}</div>}
      </div>
      <div className="tiles">
        <div className="tile"><div className="k">Saldo atual</div><div className="v">{money(atual)}</div>
          <div className="s">{fechados.length ? `gasto médio de ${money(media(fechados))} por mês` : `desde ${isoBR(conta.dataInicio)}`}</div></div>
        <div className="tile"><div className="k">Neste mês</div><div className={"v " + signCls(ritmo.sobra)}>{sinal(ritmo.sobra)}{money(Math.abs(ritmo.sobra))}</div>
          <div className="s">entrou {money(ritmo.entrou)} · gastou {money(ritmo.gastou)}</div></div>
        {ritmo.porDia != null && <div className="tile"><div className="k">Por dia até {isoBR(ritmo.proximo)}</div><div className="v">{money(ritmo.porDia)}</div>
          <div className="s">{ritmo.dias} {ritmo.dias === 1 ? "dia" : "dias"}, sem mexer no saldo dos meses anteriores</div></div>}
      </div>
      {pendente && conta.creditoMensal && (
        <div className="vr-pendente" role="status">
          <span>O crédito de {tituloMes(pendente.slice(0, 7)).toLowerCase()} ({money(conta.creditoMensal)}, dia {Number(pendente.slice(8))}) ainda não foi lançado.</span>
          <button className="primary" onClick={() => lancar({ id: novoIdVR(), conta: conta.id, data: pendente, tipo: "credito", descricao: "Crédito do benefício", valor: conta.creditoMensal! })}>Lançar crédito</button>
        </div>
      )}
      <form className="w-add" style={{ marginTop: 12 }} onSubmit={conferir}>
        <Campo inline rotulo="Conferir com o app: saldo lá"><Entrada type="number" step="0.01" aria-label="Saldo no app do cartão" placeholder={brl(atual)} value={noApp} onChange={e => setNoApp(e.target.value)} /></Campo>
        <button type="submit" disabled={noApp === ""}>Ajustar</button>
        {noApp !== "" && ajusteParaSaldo(atual, Number(noApp)) !== 0 && <span className="status">vai lançar um ajuste de <Assinado v={ajusteParaSaldo(atual, Number(noApp))} /></span>}
      </form>
    </div>

    <div className="panel">
      <div className="w-head">
        <h2>Extrato</h2>
        <div className="b-month">
          <button type="button" aria-label="Mês anterior" onClick={() => setMes(somaMeses(mes, -1))}>‹</button>
          <strong>{tituloMes(mes)}</strong>
          <button type="button" aria-label="Próximo mês" disabled={mes >= hoje.slice(0, 7)} onClick={() => setMes(somaMeses(mes, 1))}>›</button>
        </div>
      </div>
      <div className="b-list-bar"><span>Saldo no início do mês: <strong>{money(ext.inicial)}</strong></span><span>No fim: <strong>{money(ext.final)}</strong></span></div>
      {ext.linhas.length ? <div className="table-wrap"><table className="w-table b-table">
        <thead><tr><th>Data</th><th>Descrição</th><th className="b-left">Categoria</th><th>Valor</th><th>Saldo</th><th></th></tr></thead>
        <tbody>{[...ext.linhas].reverse().map(l => (
          <tr key={l.id} className={editando?.id === l.id ? "editing" : undefined}>
            <td>{isoBR(l.data)}</td>
            <td className="b-desc">{l.descricao || TIPOS.find(t => t[0] === l.tipo)![1]}{l.tipo !== "gasto" && <> <span className="muted">{TIPOS.find(t => t[0] === l.tipo)![1].toLowerCase()}</span></>}</td>
            <td className="b-left">{l.categoria || <span className="muted">—</span>}</td>
            <td><Assinado v={efeito(l)} /></td>
            <td>{money(l.saldo)}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              <button className="x" title="Editar" aria-label={`Editar ${l.descricao ?? l.tipo}`} onClick={() => setEditando(l)}>✎</button>
              <button className="x" title="Remover" aria-label={`Remover ${l.descricao ?? l.tipo}`} onClick={() => remover(l)}>×</button>
            </td>
          </tr>
        ))}</tbody>
      </table></div> : <div className="hint" style={{ marginTop: 8 }}>Nenhum lançamento em {tituloMes(mes).toLowerCase()}.</div>}
      <h3>{editando ? "Editar lançamento" : "Novo lançamento"}</h3>
      <FormMovimento key={editando?.id ?? "novo"} conta={conta} editando={editando} categorias={[...new Set([...CATEGORIAS, ...ms.map(m => m.categoria).filter((c): c is string => !!c)])]}
        onSalvar={m => { lancar(m); setEditando(null); }} onCancelar={() => setEditando(null)} />
    </div>

    {ultimos.length > 1 && <div className="panel">
      <h2>Últimos meses</h2>
      <div className="legend"><span><i style={{ background: "var(--s3)" }} />Créditos</span><span><i style={{ background: "var(--s2)" }} />Gastos</span><span><i style={{ background: "var(--s1)" }} />Saldo no fim do mês</span></div>
      <div className="proj-box"><Grafico deps={[JSON.stringify(ultimos)]} config={() => configMeses(ultimos)} rotulo="Créditos, gastos e saldo por mês" /></div>
      <div className="table-wrap"><table className="w-table">
        <thead><tr><th>Mês</th><th>Créditos</th><th>Gastos</th><th>Estornos e ajustes</th><th>Sobrou</th><th>Saldo</th></tr></thead>
        <tbody>{[...ultimos].reverse().map(r => (
          <tr key={r.mes}><td>{tituloMes(r.mes)}</td><td>{money(r.creditos)}</td><td>{money(r.gastos)}</td><td><Assinado v={r.estornos + r.ajustes} /></td>
            <td><Assinado v={r.creditos + r.estornos + r.ajustes - r.gastos} /></td><td>{money(r.saldo)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>}

    <Configuracao conta={conta} />
    <NovaConta />
  </>;
}

function FormMovimento({ conta, editando, categorias, onSalvar, onCancelar }: {
  conta: ContaVR; editando: MovimentoVR | null; categorias: string[]; onSalvar: (m: MovimentoVR) => void; onCancelar: () => void;
}) {
  const vazio = { tipo: "gasto" as TipoMovimento, data: hojeISO(), descricao: "", categoria: "", valor: "" };
  const [f, setF] = useState(() => editando
    ? { tipo: editando.tipo, data: editando.data, descricao: editando.descricao ?? "", categoria: editando.categoria ?? "", valor: String(editando.valor) }
    : vazio);
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = Math.round(Number(f.valor) * 100) / 100;
    if (!valor || (f.tipo !== "ajuste" && valor <= 0)) return;
    onSalvar({
      id: editando?.id ?? novoIdVR(), conta: conta.id, data: f.data, tipo: f.tipo, valor,
      ...(f.descricao.trim() ? { descricao: f.descricao.trim() } : {}), ...(f.tipo === "gasto" && f.categoria.trim() ? { categoria: f.categoria.trim() } : {}),
    });
    if (!editando) setF({ ...vazio, tipo: f.tipo, data: f.data, categoria: f.categoria });
  };
  return <>
    <div className="seg" role="group" aria-label="Tipo do lançamento">
      {TIPOS.map(([k, l]) => <button key={k} type="button" className={f.tipo === k ? "on" : undefined} aria-pressed={f.tipo === k} onClick={() => setF({ ...f, tipo: k })}>{l}</button>)}
    </div>
    <form className="w-add rf-form b-form" onSubmit={salvar}>
      <label>Data<Entrada name="date" type="date" required max={hojeISO()} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
      <label>Descrição<Entrada name="description" maxLength={120} placeholder={f.tipo === "gasto" ? "Ex.: Restaurante" : f.tipo === "ajuste" ? "Ex.: Saldo do app" : "Opcional"}
        required={f.tipo === "gasto"} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></label>
      {f.tipo === "gasto" && <label>Categoria<Entrada name="categoria" list="vr-categorias" maxLength={40} placeholder="Ex.: Mercado" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} />
        <datalist id="vr-categorias">{categorias.map(c => <option key={c} value={c} />)}</datalist></label>}
      <label>{f.tipo === "ajuste" ? "Valor (R$, negativo tira do saldo)" : "Valor (R$)"}
        <Entrada name="amount" type="number" step="0.01" {...(f.tipo === "ajuste" ? {} : { min: "0.01" })} required value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} /></label>
      <div className="pair">{editando
        ? <><button className="primary" type="submit">Salvar alteração</button><button type="button" onClick={onCancelar}>Cancelar</button></>
        : <button className="primary" type="submit">Lançar</button>}</div>
    </form>
  </>;
}

type CamposConta = { nome: string; creditoMensal: string; diaCredito: string; saldoInicial: string; dataInicio: string };

// Primeira conta (ou mais uma: VA, outro cartão). Saldo inicial = o que está no app hoje.
function NovaConta({ primeira = false }: { primeira?: boolean }) {
  const [aberto, setAberto] = useState(primeira);
  const [f, setF] = useState<CamposConta>({ nome: primeira ? "VR" : "", creditoMensal: "", diaCredito: "1", saldoInicial: "", dataInicio: hojeISO() });
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const conta: ContaVR = {
      id: novoIdVR(), nome: f.nome.trim() || "VR", saldoInicial: Number(f.saldoInicial) || 0, dataInicio: f.dataInicio,
      ...(Number(f.creditoMensal) > 0 ? { creditoMensal: Number(f.creditoMensal), diaCredito: Math.min(31, Math.max(1, Number(f.diaCredito) || 1)) } : {}),
    };
    vrStore.atualizar(d => ({ ...d, contas: [...d.contas, conta] }));
    setAberto(false);
  };
  const form = (
    <form className="w-add rf-form" onSubmit={salvar}>
      <label>Nome<Entrada name="nome" maxLength={40} required placeholder="Ex.: VR, VA, Flash" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></label>
      <label>Crédito mensal (R$)<Entrada name="creditoMensal" type="number" step="0.01" min="0" placeholder="Ex.: 1100" value={f.creditoMensal} onChange={e => setF({ ...f, creditoMensal: e.target.value })} /></label>
      <label>Dia do crédito<Entrada name="diaCredito" type="number" min="1" max="31" value={f.diaCredito} onChange={e => setF({ ...f, diaCredito: e.target.value })} /></label>
      <label>Saldo hoje (R$)<Entrada name="saldoInicial" type="number" step="0.01" required value={f.saldoInicial} onChange={e => setF({ ...f, saldoInicial: e.target.value })} /></label>
      <label>A partir de<Entrada name="dataInicio" type="date" required max={hojeISO()} value={f.dataInicio} onChange={e => setF({ ...f, dataInicio: e.target.value })} /></label>
      <button className="primary" type="submit">{primeira ? "Começar" : "Adicionar cartão"}</button>
    </form>
  );
  if (primeira) return (
    <div className="panel">
      <h2>VR</h2>
      <div className="hint">Controle o vale-refeição (ou o vale-alimentação) como uma conta: o crédito de cada mês entra, os gastos saem e o que sobra fica de saldo. Comece pelo saldo que o app do cartão mostra hoje.</div>
      {form}
    </div>
  );
  return (
    <div className="panel"><details className="acc" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
      <summary><span className="acc-t">Adicionar outro cartão</span><span className="acc-s">VA, Flash, Caju…</span></summary>
      {form}
    </details></div>
  );
}

function Configuracao({ conta }: { conta: ContaVR }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState<CamposConta>({
    nome: conta.nome, creditoMensal: conta.creditoMensal ? String(conta.creditoMensal) : "", diaCredito: String(conta.diaCredito ?? 1),
    saldoInicial: String(conta.saldoInicial), dataInicio: conta.dataInicio,
  });
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const nova: ContaVR = {
      id: conta.id, nome: f.nome.trim() || conta.nome, saldoInicial: Number(f.saldoInicial) || 0, dataInicio: f.dataInicio,
      ...(Number(f.creditoMensal) > 0 ? { creditoMensal: Number(f.creditoMensal), diaCredito: Math.min(31, Math.max(1, Number(f.diaCredito) || 1)) } : {}),
    };
    vrStore.atualizar(d => ({ ...d, contas: d.contas.map(c => c.id === conta.id ? nova : c) }));
  };
  const remover = () => {
    if (!confirm(`Remover o cartão "${conta.nome}" e todos os lançamentos dele?`)) return;
    vrStore.atualizar(d => ({ contas: d.contas.filter(c => c.id !== conta.id), movimentos: d.movimentos.filter(m => m.conta !== conta.id) }));
  };
  return (
    <div className="panel"><details className="acc" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
      <summary><span className="acc-t">Configurações de {conta.nome}</span>
        <span className="acc-s">{conta.creditoMensal ? `${money(conta.creditoMensal)} todo dia ${conta.diaCredito}` : "sem crédito mensal"} · saldo inicial {money(conta.saldoInicial)} em {isoBR(conta.dataInicio)}</span></summary>
      <form className="w-add rf-form" onSubmit={salvar}>
        <label>Nome<Entrada name="nome" maxLength={40} required value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></label>
        <label>Crédito mensal (R$)<Entrada name="creditoMensal" type="number" step="0.01" min="0" value={f.creditoMensal} onChange={e => setF({ ...f, creditoMensal: e.target.value })} /></label>
        <label>Dia do crédito<Entrada name="diaCredito" type="number" min="1" max="31" value={f.diaCredito} onChange={e => setF({ ...f, diaCredito: e.target.value })} /></label>
        <label>Saldo inicial (R$)<Entrada name="saldoInicial" type="number" step="0.01" required value={f.saldoInicial} onChange={e => setF({ ...f, saldoInicial: e.target.value })} /></label>
        <label>Data do saldo inicial<Entrada name="dataInicio" type="date" required value={f.dataInicio} onChange={e => setF({ ...f, dataInicio: e.target.value })} /></label>
        <span className="pair"><button className="primary" type="submit">Salvar</button><button type="button" onClick={remover}>Remover cartão</button></span>
      </form>
      <div className="status" style={{ marginTop: 6 }}>Lançamentos antes da data do saldo inicial não entram no saldo.</div>
    </details></div>
  );
}

function configMeses(r: ResumoMesVR[]): ChartConfiguration<"bar"> {
  const bar = (label: string, data: number[], color: string) => ({ type: "bar" as const, label, data, backgroundColor: css(color), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom" as const, maxBarThickness: 18, order: 2 });
  return {
    type: "bar",
    data: {
      labels: r.map(x => mesCurto(x.mes)),
      datasets: [
        bar("Créditos", r.map(x => x.creditos), "--s3"), bar("Gastos", r.map(x => x.gastos), "--s2"),
        { type: "line", label: "Saldo", data: r.map(x => x.saldo), borderColor: css("--s1"), backgroundColor: css("--s1"), borderWidth: 2, pointRadius: 3, tension: 0.2, order: 1 },
      ] as ChartConfiguration<"bar">["data"]["datasets"],
    },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipOpts(), callbacks: { label: i => `${i.dataset.label}: ${money(i.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, border: { color: css("--border") }, ticks: { ...tickOpts(), maxRotation: 0 } },
        y: { grid: gridOpts(), border: { display: false }, beginAtZero: true, ticks: { ...tickOpts(), maxTicksLimit: 4, callback: v => "R$ " + big(Number(v)) } },
      },
    },
  };
}
