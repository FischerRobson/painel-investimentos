// Importação de extrato (BTG: XLSX, XLS ou PDF) ou fatura do cartão (BTG ou Nubank, PDF): o servidor lê o arquivo
// (/api/budget/import/preview), o usuário revisa os itens e só então grava (/api/budget/import/commit).
import { useRef } from "react";
import { money } from "../../lib/formato";
import { isoBR } from "../../lib/dados";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getJson, textoDoErro } from "../../lib/api";
import { gravacaoMes, mesCurto, tituloMes, type AreaId } from "../../lib/orcamento";
import { SelectArea, SeloMeio } from "./Lancamentos";
import { useFoco } from "./Orcamento";
import type { RascunhoRegra } from "./Configuracoes";

const MAX_BYTES = 5 * 1024 * 1024;

export type ItemImportado = {
  type: "income" | "expense"; date: string; month: string; description: string; originalDescription?: string; amount: number;
  method?: string; area?: AreaId; category?: string; installment?: string; note?: string; selected: boolean;
  future: { duplicate?: boolean }[]; [outro: string]: unknown;
};
type Previa = { source: string; billingMonth?: string; items: ItemImportado[] };
export type EstadoImportacao = { fileName: string; busy?: boolean; err?: string | null; preview?: Previa; items?: ItemImportado[]; includeFuture?: boolean };
type Resultado = { imported: number; skipped: number; months: string[] };

// Manda o arquivo para o servidor ler; true quando há uma prévia para revisar
async function ler(file: File, set: (e: EstadoImportacao) => void): Promise<boolean> {
  if (file.size > MAX_BYTES) { set({ fileName: file.name, err: "O arquivo passa de 5 MB." }); return false; }
  set({ fileName: file.name, busy: true });
  try {
    const r = await apiFetch(`/api/budget/import/preview?name=${encodeURIComponent(file.name)}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file,
    });
    if (!r.ok) throw new Error(await textoDoErro(r));
    const preview = await r.json() as Previa;
    set({ fileName: file.name, preview, items: preview.items, includeFuture: true });
    return true;
  } catch (e) {
    set({ fileName: file.name, err: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export function BotaoImportar({ imp, onArquivo }: { imp: EstadoImportacao | null; onArquivo: (f: File) => void }) {
  const arquivo = useRef<HTMLInputElement>(null);
  const lendo = imp?.busy && !imp.preview;
  return (
    <div className="b-import-pick">
      <button type="button" className="primary b-import-btn" disabled={!!(lendo || imp?.preview)} onClick={() => arquivo.current?.click()}
        title="Extrato do BTG (XLSX, XLS ou PDF) ou fatura do cartão BTG ou Nubank (PDF). Nada é salvo antes de você revisar.">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
        {lendo ? `Lendo ${imp!.fileName}…` : "Importar extrato ou fatura"}
      </button>
      <input type="file" hidden ref={arquivo} aria-label="Arquivo do extrato ou fatura"
        accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onArquivo(f); }} />
    </div>
  );
}

// "Última importação: 20/11/2026 às 10:15 · Fatura do cartão Nubank (fatura.pdf) · 18 lançamentos"
export type UltimaImportacao = { at: string; source?: string; fileName?: string; imported: number; skipped: number; months: string[] };

export function useUltimaImportacao() {
  return useQuery({ queryKey: ["budget-import-last"], queryFn: () => getJson<{ last: UltimaImportacao | null }>("/api/budget/import/last") });
}

export function LinhaUltimaImportacao() {
  const q = useUltimaImportacao();
  const u = q.data?.last;
  if (!q.data) return null;
  if (!u) return <div className="status" style={{ marginTop: 6 }}>Nenhuma importação feita ainda.</div>;
  const d = new Date(u.at);
  const quando = `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const oque = [u.source, u.fileName && (u.source ? `(${u.fileName})` : u.fileName)].filter(Boolean).join(" ");
  const quantos = u.imported ? `${u.imported} ${u.imported === 1 ? "lançamento" : "lançamentos"}` : "nenhum lançamento novo";
  return <div className="status" style={{ marginTop: 6 }}>Última importação: <strong>{quando}</strong>{oque ? ` · ${oque}` : ""} · {quantos}</div>;
}

export function StatusImportacao({ imp, importou }: { imp: EstadoImportacao | null; importou: string | null }) {
  if (!imp?.preview && imp?.err) return <div className="err" style={{ marginTop: 8 }}>Não deu para ler {imp.fileName}: {imp.err}</div>;
  return importou ? <div className="up" style={{ marginTop: 8 }}>{importou}</div> : null;
}

export function Importacao({ imp, setImp, mes: _mes, foco, onRegra, onConcluir }: {
  imp: EstadoImportacao; setImp: (e: EstadoImportacao | null) => void; mes: string; foco: number;
  onRegra: (d: Omit<RascunhoRegra, "id" | "apply">) => void; onConcluir: (r: Resultado) => Promise<void>;
}) {
  const ref = useFoco<HTMLDivElement>(foco);
  const preview = imp.preview!, items = imp.items!;
  const chosen = items.filter(i => i.selected);
  const out = chosen.filter(i => i.type === "expense").reduce((t, i) => t + i.amount, 0);
  const inc = chosen.filter(i => i.type === "income").reduce((t, i) => t + i.amount, 0);
  const future = chosen.filter(i => i.type === "expense").reduce((t, i) => t + i.future.filter(f => !f.duplicate).length, 0);
  const mudaItem = (idx: number, p: Partial<ItemImportado>) => setImp({ ...imp, items: items.map((x, j) => j === idx ? { ...x, ...p } : x) });
  const sub = (i: ItemImportado) => [
    i.category, i.installment && `parcela ${i.installment}`, i.month !== i.date.slice(0, 7) && `entra em ${mesCurto(i.month)}`,
    i.originalDescription && `era: ${i.originalDescription}`,
  ].filter(Boolean).join(" · ");
  const ordenados = items.map((i, idx) => ({ ...i, idx }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description, "pt-BR"));

  const importar = async () => {
    if (!chosen.length) return;
    setImp({ ...imp, busy: true, err: null });
    try {
      await gravacaoMes.descarregar();
      const r = await apiFetch("/api/budget/import/commit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen, includeFutureInstallments: imp.includeFuture, source: preview.source, fileName: imp.fileName }),
      });
      if (!r.ok) throw new Error(await textoDoErro(r));
      await onConcluir(await r.json());
    } catch (e) { setImp({ ...imp, busy: false, err: e instanceof Error ? e.message : String(e) }); }
  };

  return (
    <div className="panel" ref={ref}>
      <div className="w-head">
        <div><h2>Revisar importação</h2><div className="hint" style={{ margin: 0 }}>{preview.source} · {imp.fileName}{preview.billingMonth ? ` · gastos entram em ${tituloMes(preview.billingMonth)}` : ""}</div></div>
      </div>
      <div className="b-import-bar">
        <span>{chosen.length} de {items.length} selecionados · saídas {money(out)}{inc ? ` · entradas ${money(inc)}` : ""}</span>
        <span className="pair">
          <button type="button" onClick={() => setImp({ ...imp, items: items.map(i => ({ ...i, selected: true })) })}>Marcar todos</button>
          <button type="button" onClick={() => setImp({ ...imp, items: items.map(i => ({ ...i, selected: false })) })}>Desmarcar todos</button>
        </span>
      </div>
      <div className="hint">Itens desmarcados não entram. Os já importados e os que costumam duplicar (pagamento da fatura, transferências entre suas contas) vêm desmarcados.</div>
      <div className="table-wrap"><table className="w-table b-table b-import-table">
        <thead><tr><th></th><th>Data</th><th>Descrição</th><th className="b-left">Área</th><th>Valor</th><th></th></tr></thead>
        <tbody>{ordenados.map(i => (
          <tr key={i.idx} className={i.selected ? undefined : "off"}>
            <td className="b-check"><input type="checkbox" checked={i.selected} aria-label={`Importar ${i.description}`} onChange={e => mudaItem(i.idx, { selected: e.target.checked })} /></td>
            <td>{isoBR(i.date)}</td>
            <td className="b-desc">{i.description}<SeloMeio m={i.method} />{sub(i) && <span className="b-sub">{sub(i)}</span>}{i.note && <span className="b-sub warn">{i.note}</span>}</td>
            <td className="b-left">{i.type === "expense" ? <SelectArea valor={i.area} onMudar={a => mudaItem(i.idx, { area: a })} /> : <span className="muted">Entrada</span>}</td>
            <td className={i.type === "income" ? "up" : undefined}>{i.type === "income" ? "+" : ""}{money(i.amount)}</td>
            <td><button className="x" title="Criar regra para esta descrição"
              onClick={() => onRegra({ match: i.originalDescription || i.description, description: "", area: i.type === "expense" ? i.area ?? "" : "" })}>⇄</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="b-import-foot">
        {future ? <label><input type="checkbox" checked={!!imp.includeFuture} onChange={e => setImp({ ...imp, includeFuture: e.target.checked })} />Lançar também as {future} parcelas futuras nos meses seguintes</label> : <span />}
        <span className="pair">
          <button type="button" disabled={imp.busy} onClick={() => setImp(null)}>Cancelar</button>
          <button type="button" className="primary" disabled={imp.busy || !chosen.length} onClick={() => void importar()}>
            {imp.busy ? "Importando…" : `Importar ${chosen.length} ${chosen.length === 1 ? "lançamento" : "lançamentos"}`}</button>
        </span>
      </div>
      {imp.err && <div className="err" style={{ marginTop: 8 }}>{imp.err}</div>}
    </div>
  );
}
Importacao.ler = ler;
