// Lançamentos do mês: filtros, tabela (área editável, ordenar por data ou valor, 25 por vez) e o formulário de novo lançamento
// ou de edição.
import { useState } from "react";
import { money } from "../../lib/formato";
import { isoBR } from "../../lib/dados";
import {
  AREAS_MANUAIS, FILTRO_PADRAO, MEIOS, chaveDe, filtrar, filtroAtivo, hojeIso, mesDe, novoId,
  type AreaId, type Filtro, type Lancamento, type Mes, type Tipo,
} from "../../lib/orcamento";
import { useFoco, type Edicao } from "./Orcamento";
import type { RascunhoRegra } from "./Configuracoes";

const PAGINA = 25;
const TIPOS: [Filtro["kind"], string][] = [["all", "Todos"], ["income", "Entradas"], ["expense", "Saídas"]];
const ORDENS: [string, string][] = [["date-desc", "Data: mais recente"], ["date-asc", "Data: mais antiga"], ["amount-desc", "Maior valor"], ["amount-asc", "Menor valor"]];

export const SeloMeio = ({ m }: { m?: string }) => m && MEIOS[m] ? <span className={"b-method " + m}>{MEIOS[m]}</span> : null;

export function SelectArea({ valor, onMudar }: { valor?: string; onMudar: (a: AreaId) => void }) {
  return (
    <select aria-label="Área" value={valor} onChange={e => onMudar(e.target.value as AreaId)}>
      {AREAS_MANUAIS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

type Props = {
  dados: Mes; mes: string; filtro: Filtro; setFiltro: (f: Filtro | ((f: Filtro) => Filtro)) => void;
  mostrarTodos: boolean; setMostrarTodos: (v: boolean) => void;
  editando: Edicao; setEditando: (e: Edicao) => void; tipoForm: Tipo; setTipoForm: (t: Tipo) => void;
  focoForm: number; pedirFocoForm: () => void;
  onMudar: (d: Mes) => void; onRegra: (d: Omit<RascunhoRegra, "id" | "apply">) => void;
};

export function Lancamentos(p: Props) {
  const { filtro: f, setFiltro } = p;
  const muda = (parcial: Partial<Filtro>) => { setFiltro({ ...f, ...parcial }); p.setMostrarTodos(false); };
  const opcoes = (lista: [string, string][]) => lista.map(([v, l]) => <option key={v} value={v}>{l}</option>);
  const meios = Object.entries(MEIOS) as [string, string][];
  const [ultimaSaida, setUltimaSaida] = useState<{ date: string; area: AreaId } | null>(null);

  return <>
    <div className="b-filters">
      <div className="seg" role="group" aria-label="Tipo de lançamento">
        {TIPOS.map(([k, l]) => (
          <button key={k} type="button" className={f.kind === k ? "on" : undefined} aria-pressed={f.kind === k}
            onClick={() => muda({ kind: k, ...(k === "income" ? { area: "" } : {}) })}>{l}</button>
        ))}
      </div>
      <label>Área<select name="area" disabled={f.kind === "income"} value={f.area} onChange={e => muda({ area: e.target.value })}>
        <option value="">Todas</option>{opcoes(AREAS_MANUAIS.map(a => [a.id, a.name]))}</select></label>
      <label>Meio<select name="method" value={f.method} onChange={e => muda({ method: e.target.value })}><option value="">Todos</option>{opcoes(meios)}</select></label>
      <label>De<input type="date" name="from" value={f.from} onChange={e => muda({ from: e.target.value })} /></label>
      <label>Até<input type="date" name="to" value={f.to} onChange={e => muda({ to: e.target.value })} /></label>
      <label className="b-q">Buscar<input type="search" name="q" placeholder="Descrição" value={f.q} onChange={e => muda({ q: e.target.value })} /></label>
      <label>Ordenar<select name="sort" value={f.sort} onChange={e => muda({ sort: e.target.value })}>{opcoes(ORDENS)}</select></label>
      <button type="button" className="link" hidden={!filtroAtivo(f)} onClick={() => { setFiltro({ ...FILTRO_PADRAO, sort: f.sort }); p.setMostrarTodos(false); }}>Limpar filtros</button>
    </div>
    <div><Tabela {...p} /></div>
    <div className="b-new">
      <h3>{p.editando ? "Editar lançamento" : "Novo lançamento"}</h3>
      <div className="seg" role="group" aria-label="Tipo do novo lançamento">
        {([["income", "Entrada"], ["expense", "Saída"]] as [Tipo, string][]).map(([k, l]) => (
          <button key={k} type="button" className={p.tipoForm === k ? "on" : undefined} aria-pressed={p.tipoForm === k}
            onClick={() => { if (p.tipoForm !== k) { p.setTipoForm(k); p.setEditando(null); } }}>{l}</button>
        ))}
      </div>
    </div>
    <FormLancamento key={p.tipoForm + (p.editando?.id ?? "") + p.mes} {...p} ultimaSaida={ultimaSaida} setUltimaSaida={setUltimaSaida} />
  </>;
}

function Tabela({ dados, filtro: f, setFiltro, mostrarTodos, setMostrarTodos, editando, setEditando, setTipoForm, pedirFocoForm, onMudar, onRegra }: Props) {
  const all = dados.incomes.length + dados.expenses.length;
  if (!all) return <div className="hint" style={{ marginTop: 8 }}>Nenhum lançamento neste mês.</div>;
  const list = filtrar(dados, f);
  if (!list.length) return <div className="hint" style={{ marginTop: 8 }}>Nenhum lançamento com esses filtros.</div>;
  const shown = mostrarTodos ? list : list.slice(0, PAGINA);
  const soma = (k: Tipo) => list.filter(x => x.kind === k).reduce((s, x) => s + x.amount, 0);
  const [sortKey, sortDir] = f.sort.split("-"), seta = sortDir === "asc" ? " ↑" : " ↓";
  const ordenar = (k: string) => setFiltro(x => ({ ...x, sort: sortKey === k ? `${k}-${sortDir === "asc" ? "desc" : "asc"}` : `${k}-desc` }));
  const BotaoOrdem = ({ k, l }: { k: string; l: string }) => (
    <button type="button" className={"sort" + (sortKey === k ? " on" : "")} onClick={() => ordenar(k)}>{l}{sortKey === k ? seta : ""}</button>
  );
  const totais = [list.some(x => x.kind === "income") && <span key="i">Entradas <strong>{money(soma("income"))}</strong></span>,
    list.some(x => x.kind === "expense") && <span key="e">Saídas <strong>{money(soma("expense"))}</strong></span>].filter(Boolean);
  const achar = (k: Tipo, id: string) => dados[chaveDe(k)].find(x => x.id === id);
  const remover = (k: Tipo, id: string) => {
    const e = achar(k, id), key = chaveDe(k);
    if (e && !confirm(`Remover "${e.description}" (${money(e.amount)})?`)) return;
    if (editando?.id === id) setEditando(null);
    onMudar({ ...dados, [key]: dados[key].filter(x => x.id !== id) });
  };

  return <>
    <div className="b-list-bar">
      <span>{list.length === all ? `${all} ${all === 1 ? "lançamento" : "lançamentos"}` : `${list.length} de ${all} lançamentos`}</span>
      <span>{totais.flatMap((x, i) => i ? [" · ", x] : [x])}</span>
    </div>
    <div className="table-wrap"><table className="w-table b-table">
      <thead><tr><th><BotaoOrdem k="date" l="Data" /></th><th>Descrição</th><th className="b-left">Área</th><th><BotaoOrdem k="amount" l="Valor" /></th><th></th></tr></thead>
      <tbody>{shown.map(x => (
        <tr key={x.kind + x.id} className={editando?.kind === x.kind && editando.id === x.id ? "editing" : undefined}>
          <td>{isoBR(x.date)}</td>
          <td className="b-desc">{x.description}{x.installment && <> <span className="muted">{x.installment}</span></>}<SeloMeio m={x.method} /></td>
          <td className="b-left">{x.kind === "expense"
            ? <SelectArea valor={x.area} onMudar={a => onMudar({ ...dados, expenses: dados.expenses.map(e => e.id === x.id ? { ...e, area: a } : e) })} />
            : <span className="b-kind">Entrada</span>}</td>
          <td className={x.kind === "income" ? "b-in" : undefined}>{x.kind === "income" ? "+ " : ""}{money(x.amount)}</td>
          <td style={{ whiteSpace: "nowrap" }}>
            <button className="x" title="Criar regra para esta descrição" onClick={() => onRegra({ match: x.description, description: "", area: x.kind === "expense" ? x.area ?? "" : "" })}>⇄</button>
            <button className="x" title="Editar" aria-label={`Editar ${x.description}`} onClick={() => { setEditando({ kind: x.kind, id: x.id }); setTipoForm(x.kind); pedirFocoForm(); }}>✎</button>
            <button className="x" title="Remover" aria-label={`Remover ${x.description}`} onClick={() => remover(x.kind, x.id)}>×</button>
          </td>
        </tr>
      ))}</tbody>
    </table></div>
    {list.length > shown.length && <button type="button" className="b-more" onClick={() => setMostrarTodos(true)}>Mostrar todos ({list.length})</button>}
  </>;
}

function FormLancamento({ dados, mes, tipoForm: kind, editando, setEditando, focoForm, onMudar, ultimaSaida, setUltimaSaida }: Props & {
  ultimaSaida: { date: string; area: AreaId } | null; setUltimaSaida: (v: { date: string; area: AreaId }) => void;
}) {
  const isExpense = kind === "expense";
  const atual = editando?.kind === kind ? dados[chaveDe(kind)].find(x => x.id === editando.id) ?? null : null;
  const padrao = mes === mesDe(new Date()) ? hojeIso() : `${mes}-01`;
  const inicial = () => ({
    date: atual?.date || (isExpense && ultimaSaida?.date) || padrao,
    description: atual?.description || "",
    area: (atual?.area || ultimaSaida?.area || "fixedCosts") as AreaId,
    method: atual?.method || "",
    amount: atual ? String(atual.amount) : "",
  });
  const [v, setV] = useState(inicial);
  const muda = (p: Partial<ReturnType<typeof inicial>>) => setV(x => ({ ...x, ...p }));
  const ref = useFoco<HTMLFormElement>(focoForm);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: Partial<Lancamento> = { date: v.date, description: v.description.trim(), amount: Math.round(Number(v.amount) * 100) / 100, method: v.method || undefined };
    if (isExpense) { entry.area = v.area; setUltimaSaida({ date: v.date, area: v.area }); }
    if (!entry.description || !(entry.amount! > 0)) return;
    const key = chaveDe(kind);
    const existe = atual && dados[key].some(x => x.id === atual.id);
    onMudar({ ...dados, [key]: existe ? dados[key].map(x => x.id === atual.id ? { ...x, ...entry } : x) : [...dados[key], { id: novoId(), ...entry } as Lancamento] });
    setEditando(null);
    // continua no formulário para o próximo lançamento, com a mesma data e área
    setV({ ...inicial(), date: isExpense ? v.date : padrao, area: v.area, description: "", amount: "", method: "" });
    ref.current?.querySelector<HTMLInputElement>("[name=description]")?.focus();
  };

  return (
    <form className="w-add rf-form b-form" ref={ref} onSubmit={salvar}>
      <label>Data{isExpense ? " da compra" : ""}<input name="date" type="date" required value={v.date} onChange={e => muda({ date: e.target.value })} /></label>
      <label>Descrição<input name="description" maxLength={120} required placeholder={isExpense ? "Ex.: Supermercado" : "Ex.: Salário"} value={v.description} onChange={e => muda({ description: e.target.value })} /></label>
      {isExpense && <label>Área<select name="area" value={v.area} onChange={e => muda({ area: e.target.value as AreaId })}>
        {AREAS_MANUAIS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
      <label>Meio<select name="method" value={v.method} onChange={e => muda({ method: e.target.value })}><option value="">—</option>
        {Object.entries(MEIOS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
      <label>Valor (R$)<input name="amount" type="number" step="0.01" min="0.01" required value={v.amount} onChange={e => muda({ amount: e.target.value })} /></label>
      <div className="pair">{atual
        ? <><button className="primary" type="submit">Salvar alteração</button><button type="button" onClick={() => setEditando(null)}>Cancelar</button></>
        : <button className="primary" type="submit">Adicionar</button>}</div>
    </form>
  );
}
