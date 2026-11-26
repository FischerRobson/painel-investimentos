// Configurações do orçamento, em seções recolhíveis: metas por área (% da renda, soma 100%, e a renda de referência)
// e regras de descrição ("de → para", com área opcional).
import { useState } from "react";
import { brl, money } from "../../lib/formato";
import { AREAS, AREAS_MANUAIS, novoId, normText, somaMetas, tituloMes, type AreaId, type Metas, type Regra } from "../../lib/orcamento";
import { useFoco } from "./Orcamento";
import { Entrada, Selecao } from "../../componentes/Campos";

export type RascunhoRegra = { id: string | null; match: string; description: string; area: string; apply: boolean };

export function MetasPorArea({ metas, aberto, setAberto, foco, onSalvar }: {
  metas: Metas; aberto: boolean; setAberto: (v: boolean) => void; foco: number; onSalvar: (p: Partial<Metas>) => Promise<boolean>;
}) {
  // Rascunho do que está nos campos (texto), até salvar
  const [rascunho, setRascunho] = useState<Record<string, string> | null>(null);
  const [renda, setRenda] = useState<string | null>(null);
  const ref = useFoco<HTMLFormElement>(foco, f => f.querySelector("[name=referenceIncome]"));
  const valor = (id: AreaId) => rascunho?.[id] ?? String(metas.targets[id] ?? 0);
  const lidas = Object.fromEntries(AREAS.map(a => [a.id, Number(valor(a.id)) || 0])) as Record<AreaId, number>;
  const soma = somaMetas(lidas), ok = Math.abs(soma - 100) < 0.01;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Math.round(Number(renda ?? metas.referenceIncome ?? "") * 100) / 100;
    setRenda(null);
    if (await onSalvar({ targets: lidas, referenceIncome: v > 0 ? v : undefined })) setRascunho(null);
  };
  return (
    <div className="panel"><details className="acc" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
      <summary><span className="acc-t">Metas por área</span>
        <span className="acc-s">{AREAS.map(a => `${brl(metas.targets[a.id] || 0, 0)}%`).join(" · ")}{metas.referenceIncome ? ` · renda ${money(metas.referenceIncome)}` : ""}</span></summary>
      <div className="hint">Quanto da renda líquida (tudo que entrou no mês) vai para cada área. A soma precisa dar 100%. A renda de referência vale nos meses sem entradas lançadas; deixe em branco para usar a do último mês com entradas.</div>
      <form className="w-add rf-form" ref={ref} onSubmit={e => void salvar(e)}>
        {AREAS.map(a => (
          <label key={a.id}>{a.name} (%)<Entrada name={a.id} type="number" min="0" max="100" step="0.5" required value={valor(a.id)}
            onChange={e => setRascunho({ ...Object.fromEntries(AREAS.map(x => [x.id, valor(x.id)])), [a.id]: e.target.value })} /></label>
        ))}
        <label>Renda de referência (R$)<Entrada name="referenceIncome" type="number" min="1" step="0.01" placeholder="Opcional"
          value={renda ?? metas.referenceIncome ?? ""} onChange={e => setRenda(e.target.value)} /></label>
        <div className="b-targets-foot">
          <span className={ok ? "muted" : "err"}>{ok ? "Soma: 100%" : `Soma: ${brl(soma, 1)}% (precisa dar 100%)`}</span>
          <button className="primary" type="submit" disabled={!ok}>Salvar metas</button>
        </div>
      </form>
    </details></div>
  );
}

const VAZIA: RascunhoRegra = { id: null, match: "", description: "", area: "", apply: true };

export function Regras({ regras, mes, aberto, setAberto, rascunho, setRascunho, erro, setErro, foco, onSalvar, onUsar }: {
  regras: Regra[]; mes: string; aberto: boolean; setAberto: (v: boolean) => void;
  rascunho: RascunhoRegra | null; setRascunho: (r: RascunhoRegra | null) => void; erro: string | null; setErro: (e: string | null) => void;
  foco: number; onSalvar: (r: Regra[]) => Promise<boolean>; onUsar: (r: Regra, noMes: boolean) => void;
}) {
  const ref = useFoco<HTMLFormElement>(foco, f => f.querySelector("[name=description]"));
  const list = [...regras].sort((a, b) => a.description.localeCompare(b.description, "pt-BR") || a.match.localeCompare(b.match, "pt-BR"));
  const d = rascunho ?? VAZIA;
  const muda = (p: Partial<RascunhoRegra>) => setRascunho({ ...d, ...p });
  const nomeArea = (id: string) => AREAS.find(a => a.id === id)?.name;
  const editar = (r: Regra) => { setRascunho({ id: r.id, match: r.match, description: r.description, area: r.area || "", apply: true }); setAberto(true); setErro(null); };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const match = d.match.trim(), description = d.description.trim();
    if (normText(match).length < 3 || !description) return;
    const id = d.id || novoId();
    const regra: Regra = { id, match, description, ...(d.area ? { area: d.area as AreaId } : {}) };
    const nova = regras.some(r => r.id === id) ? regras.map(r => r.id === id ? regra : r) : [...regras, regra];
    if (await onSalvar(nova)) onUsar(regra, d.apply);
  };
  const remover = (r: Regra) => {
    if (!confirm(`Remover a regra "${r.match}" → "${r.description}"? Os lançamentos já renomeados continuam como estão.`)) return;
    void onSalvar(regras.filter(x => x.id !== r.id));
  };

  return (
    <div className="panel"><details className="acc" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>
      <summary><span className="acc-t">Regras de descrição</span><span className="acc-s">{list.length ? `${list.length} ${list.length === 1 ? "regra" : "regras"}` : "de → para"}</span></summary>
      <div className="hint">Quando a descrição contém o trecho (sem diferenciar maiúsculas e acentos), ela é trocada pelo novo nome e, se você escolher, vai para uma área fixa. Vale para as importações e, ao salvar, para os lançamentos do mês aberto. Use ⇄ em qualquer lançamento para criar uma regra.</div>
      {list.length > 0 && <div className="table-wrap"><table className="w-table b-table b-rules-table">
        <thead><tr><th className="b-left">Quando contém</th><th className="b-left">Vira</th><th className="b-left">Área</th><th></th></tr></thead>
        <tbody>{list.map(r => (
          <tr key={r.id} className={rascunho?.id === r.id ? "editing" : undefined}>
            <td className="b-left b-desc">{r.match}</td><td className="b-left b-desc">{r.description}</td>
            <td className="b-left">{r.area ? nomeArea(r.area) : <span className="muted">sugerida</span>}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              <button className="x" title="Editar" aria-label={`Editar regra ${r.match}`} onClick={() => editar(r)}>✎</button>
              <button className="x" title="Remover" aria-label={`Remover regra ${r.match}`} onClick={() => remover(r)}>×</button>
            </td>
          </tr>
        ))}</tbody></table></div>}
      <form className="w-add rf-form b-rule-form" ref={ref} onSubmit={e => void salvar(e)}>
        <label>Quando a descrição contém<Entrada name="match" maxLength={80} required minLength={3} placeholder="Ex.: Auto Posto Major" value={d.match} onChange={e => muda({ match: e.target.value })} /></label>
        <label>Trocar por<Entrada name="description" maxLength={120} required placeholder="Ex.: Combustível" value={d.description} onChange={e => muda({ description: e.target.value })} /></label>
        <label>Área<Selecao name="area" value={d.area} onChange={e => muda({ area: e.target.value })}><option value="">Manter a sugerida</option>
          {AREAS_MANUAIS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Selecao></label>
        <div className="b-rule-foot">
          <label><Entrada type="checkbox" name="apply" checked={d.apply} onChange={e => muda({ apply: e.target.checked })} />Aplicar também aos lançamentos já salvos de {tituloMes(mes)}</label>
          <span className="pair">
            {(rascunho?.id || rascunho?.match) && <button type="button" onClick={() => { setRascunho(null); setErro(null); }}>Cancelar</button>}
            <button className="primary" type="submit">{rascunho?.id ? "Salvar regra" : "Criar regra"}</button>
          </span>
        </div>
      </form>
      {erro && <div className="err" style={{ marginTop: 8 }}>{erro}</div>}
    </details></div>
  );
}
