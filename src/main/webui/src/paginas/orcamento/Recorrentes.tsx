// Lançamentos recorrentes (aluguel, assinaturas, salário...): a regra cria o lançamento em cada mês aberto, sem duplicar, e um
// lançamento apagado não volta. Mudar uma regra vale para os meses que ainda não foram criados.
import { useState } from "react";
import { money } from "../../lib/formato";
import { MEIOS, AREAS, AREAS_MANUAIS, mesDe, novoId, type AreaId, type RegraRecorrente, type Tipo } from "../../lib/orcamento";
import { useFoco } from "./Orcamento";

export type RascunhoRecorrente = { id: string | null; kind: Tipo; description: string; amount: string; area: AreaId; method: string; day: string; start: string; end: string };

export const rascunhoVazio = (): RascunhoRecorrente =>
  ({ id: null, kind: "expense", description: "", amount: "", area: "fixedCosts", method: "", day: "5", start: mesDe(new Date()), end: "" });

export const rascunhoDe = (r: RegraRecorrente): RascunhoRecorrente => ({
  id: r.id, kind: r.kind, description: r.description, amount: String(r.amount), area: r.area ?? "fixedCosts", method: r.method ?? "",
  day: String(r.day), start: r.start, end: r.end ?? "",
});

const nomeArea = (id?: string) => AREAS.find(a => a.id === id)?.name;
const vigencia = (r: RegraRecorrente) => `desde ${r.start.split("-").reverse().join("/")}${r.end ? ` até ${r.end.split("-").reverse().join("/")}` : ""}`;

export function Recorrentes({ regras, aberto, setAberto, rascunho, setRascunho, erro, foco, onSalvar }: {
  regras: RegraRecorrente[]; aberto: boolean; setAberto: (v: boolean) => void;
  rascunho: RascunhoRecorrente | null; setRascunho: (r: RascunhoRecorrente | null) => void;
  erro: string | null; foco: number; onSalvar: (lista: RegraRecorrente[]) => Promise<boolean>;
}) {
  const ref = useFoco<HTMLFormElement>(foco, f => f.querySelector("[name=description]"));
  const [valido, setValido] = useState<string | null>(null);
  const d = rascunho ?? rascunhoVazio();
  const muda = (p: Partial<RascunhoRecorrente>) => setRascunho({ ...d, ...p });
  const lista = [...regras].sort((a, b) => a.kind.localeCompare(b.kind) || a.description.localeCompare(b.description, "pt-BR"));
  const resumo = regras.length ? `${regras.length} ${regras.length === 1 ? "regra" : "regras"}` : "aluguel, assinaturas, salário";

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round(Number(d.amount) * 100) / 100, day = Math.round(Number(d.day));
    if (!d.description.trim() || !(amount > 0) || !(day >= 1 && day <= 31)) return;
    if (d.end && d.end < d.start) { setValido("O fim precisa ser depois do começo."); return; }
    setValido(null);
    const regra: RegraRecorrente = {
      id: d.id ?? novoId().replace(/[^A-Za-z0-9]/g, ""), kind: d.kind, description: d.description.trim(), amount, day, start: d.start,
      ...(d.kind === "expense" ? { area: d.area } : {}), ...(d.method ? { method: d.method } : {}), ...(d.end ? { end: d.end } : {}),
    };
    const nova = regras.some(r => r.id === regra.id) ? regras.map(r => r.id === regra.id ? regra : r) : [...regras, regra];
    if (await onSalvar(nova)) setRascunho(null);
  };
  const remover = (r: RegraRecorrente) => {
    if (!confirm(`Remover "${r.description}" dos recorrentes? Os lançamentos que ela já criou continuam como estão.`)) return;
    void onSalvar(regras.filter(x => x.id !== r.id));
  };

  return (
    <div className="panel"><details className="acc" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
      <summary><span className="acc-t">Lançamentos recorrentes</span><span className="acc-s">{resumo}</span></summary>
      <div className="hint">Aluguel, assinaturas, salário: a regra cria o lançamento em cada mês assim que você abre a página, no dia escolhido (mês curto usa o último dia).
        Se você apagar um lançamento criado por ela, ele não volta. Mudar o valor de uma regra vale para os próximos meses; ajuste o do mês aberto direto na tabela.</div>
      {lista.length > 0 && <div className="table-wrap"><table className="w-table b-table">
        <thead><tr><th className="b-left">Descrição</th><th className="b-left">Tipo</th><th>Valor</th><th>Dia</th><th className="b-left">Vigência</th><th></th></tr></thead>
        <tbody>{lista.map(r => (
          <tr key={r.id} className={rascunho?.id === r.id ? "editing" : undefined}>
            <td className="b-left b-desc">{r.description}</td>
            <td className="b-left">{r.kind === "income" ? <span className="b-kind">Entrada</span> : nomeArea(r.area)}</td>
            <td className={r.kind === "income" ? "b-in" : undefined}>{r.kind === "income" ? "+ " : ""}{money(r.amount)}</td>
            <td>{r.day}</td>
            <td className="b-left muted">{vigencia(r)}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              <button className="x" title="Editar" aria-label={`Editar recorrente ${r.description}`} onClick={() => { setRascunho(rascunhoDe(r)); setAberto(true); }}>✎</button>
              <button className="x" title="Remover" aria-label={`Remover recorrente ${r.description}`} onClick={() => remover(r)}>×</button>
            </td>
          </tr>
        ))}</tbody></table></div>}
      <form className="w-add rf-form b-rule-form" ref={ref} onSubmit={e => void salvar(e)}>
        <label>Tipo<select name="kind" value={d.kind} onChange={e => muda({ kind: e.target.value as Tipo })}>
          <option value="expense">Saída</option><option value="income">Entrada</option></select></label>
        <label>Descrição<input name="description" maxLength={120} required placeholder={d.kind === "income" ? "Ex.: Salário" : "Ex.: Aluguel"} value={d.description} onChange={e => muda({ description: e.target.value })} /></label>
        {d.kind === "expense" && <label>Área<select name="area" value={d.area} onChange={e => muda({ area: e.target.value as AreaId })}>
          {AREAS_MANUAIS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
        <label>Meio<select name="method" value={d.method} onChange={e => muda({ method: e.target.value })}><option value="">—</option>
          {Object.entries(MEIOS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label>Valor (R$)<input name="amount" type="number" step="0.01" min="0.01" required value={d.amount} onChange={e => muda({ amount: e.target.value })} /></label>
        <label>Dia do mês<input name="day" type="number" min="1" max="31" required value={d.day} onChange={e => muda({ day: e.target.value })} /></label>
        <label>A partir de<input name="start" type="month" required value={d.start} onChange={e => muda({ start: e.target.value })} /></label>
        <label>Até (opcional)<input name="end" type="month" value={d.end} onChange={e => muda({ end: e.target.value })} /></label>
        <div className="b-rule-foot">
          <span />
          <span className="pair">
            {rascunho && <button type="button" onClick={() => { setRascunho(null); setValido(null); }}>Cancelar</button>}
            <button className="primary" type="submit">{rascunho?.id ? "Salvar recorrente" : "Criar recorrente"}</button>
          </span>
        </div>
      </form>
      {(valido || erro) && <div className="err" style={{ marginTop: 8 }}>{valido ?? erro}</div>}
    </details></div>
  );
}
