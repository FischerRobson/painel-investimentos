// Lançar uma operação: compra, venda, desdobramento, grupamento ou bonificação. Operação lançada não se edita: para
// corrigir, estorne no histórico e lance de novo (o formulário pode vir preenchido com a operação estornada).
import { useEffect, useRef, useState } from "react";
import { hojeISO } from "../../lib/dados";
import { NOME_CLASSE, NOME_TIPO, TIPOS_RV, type Classe, type Operacao, type TipoOperacao } from "../../motor";
import { parseTickers } from "../carteira/Adicionar";

export const COINS = ["BTC", "ETH", "SOL", "USDT", "USDC", "XRP", "BNB", "ADA", "DOGE", "LINK"];
const CLASSES = Object.keys(NOME_CLASSE) as Classe[];
const TIPOS = TIPOS_RV;

type Campos = { tipo: TipoOperacao; data: string; classe: Classe; ativo: string; qtd: string; preco: string; taxas: string; cambio: string; fator: string; obs: string };

export const deOperacao = (o: Operacao): Campos => ({
  tipo: o.tipo, data: o.data, classe: o.classe as Classe, ativo: o.ativo, qtd: o.qtd != null ? String(o.qtd) : "", preco: o.preco != null ? String(o.preco) : "",
  taxas: o.taxas ? String(o.taxas) : "", cambio: o.cambio ? String(o.cambio) : "", fator: o.fator ? String(o.fator) : "", obs: o.obs ?? "",
});

export type CamposOperacao = Campos;

export function FormOperacao({ inicial, classeDe, cambioDe, pendente, onSalvar, onCancelar }: {
  inicial?: Partial<Campos>;
  classeDe: (ativo: string) => Classe | undefined;   // classe que o ativo já tem (operações anteriores ou cotação)
  cambioDe: (classe: Classe, ativo: string) => number | undefined; // câmbio de hoje para ativos do exterior
  pendente: (ativo: string) => boolean;              // ativo na carteira ainda sem saldo inicial
  onSalvar: (o: Operacao) => void; onCancelar: () => void;
}) {
  const vazio: Campos = { tipo: "compra", data: hojeISO(), classe: "acao", ativo: "", qtd: "", preco: "", taxas: "", cambio: "", fator: "", obs: "" };
  const [f, setF] = useState<Campos>(() => ({ ...vazio, ...inicial }));
  const muda = (p: Partial<Campos>) => setF(x => ({ ...x, ...p }));
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (inicial) form.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, [inicial]);

  const evento = f.tipo === "desdobramento" || f.tipo === "grupamento";
  const ativo = f.classe === "cripto" ? f.ativo : parseTickers(f.ativo)[0] ?? "";
  const bloqueado = ativo && pendente(ativo);
  const mudaAtivo = (texto: string) => {
    const t = f.classe === "cripto" ? texto : parseTickers(texto)[0] ?? "";
    const c = classeDe(t);
    muda({ ativo: texto, ...(c && c !== f.classe ? { classe: c } : {}) });
  };
  const mudaClasse = (classe: Classe) => {
    const p: Partial<Campos> = { classe };
    if (classe === "cripto" && !COINS.includes(f.ativo)) p.ativo = COINS[0];
    if (classe === "exterior" && !f.cambio) { const c = cambioDe(classe, ativo); if (c) p.cambio = String(+c.toFixed(4)); }
    muda(p);
  };

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ativo || bloqueado) return;
    const num = (s: string) => s === "" ? undefined : Number(s);
    const o: Operacao = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      data: f.data, tipo: f.tipo, classe: f.classe, ativo,
      ...(evento ? { fator: num(f.fator) } : { qtd: num(f.qtd), preco: num(f.preco) }),
      ...(f.tipo === "compra" || f.tipo === "venda" ? { taxas: num(f.taxas) } : {}),
      ...(f.classe === "exterior" && !evento ? { cambio: num(f.cambio) } : {}),
      ...(f.obs.trim() ? { obs: f.obs.trim() } : {}),
    };
    onSalvar(o);
    setF({ ...vazio, tipo: f.tipo, classe: f.classe, data: f.data });
  };

  return <>
    <form className="w-add rf-form" ref={form} onSubmit={salvar}>
      <label>Tipo<select name="tipo" value={f.tipo} onChange={e => muda({ tipo: e.target.value as TipoOperacao })}>
        {TIPOS.map(t => <option key={t} value={t}>{NOME_TIPO[t]}</option>)}</select></label>
      <label>Data<input name="data" type="date" required max={hojeISO()} value={f.data} onChange={e => muda({ data: e.target.value })} /></label>
      <label>Classe<select name="classe" value={f.classe} onChange={e => mudaClasse(e.target.value as Classe)}>
        {CLASSES.map(c => <option key={c} value={c}>{NOME_CLASSE[c]}</option>)}</select></label>
      <label>Ativo{f.classe === "cripto"
        ? <select name="ativo" value={f.ativo || COINS[0]} onChange={e => muda({ ativo: e.target.value })}>{COINS.map(c => <option key={c}>{c}</option>)}</select>
        : <input name="ativo" required placeholder="Ex.: ITSA4" autoComplete="off" spellCheck={false} style={{ textTransform: "uppercase" }}
            value={f.ativo} onChange={e => mudaAtivo(e.target.value)} />}</label>
      {evento
        ? <label>Fator ({f.tipo === "desdobramento" ? "1 vira quantas" : "quantas viram 1"})<input name="fator" type="number" step="any" min="0" required placeholder="Ex.: 2" value={f.fator} onChange={e => muda({ fator: e.target.value })} /></label>
        : <>
          <label>Quantidade<input name="qtd" type="number" step="any" min="0" required value={f.qtd} onChange={e => muda({ qtd: e.target.value })} /></label>
          <label>{f.tipo === "bonificacao" ? "Custo atribuído por ação (R$)" : `Preço${f.classe === "exterior" ? " (na moeda do ativo)" : " (R$)"}`}
            <input name="preco" type="number" step="any" min="0" required value={f.preco} onChange={e => muda({ preco: e.target.value })} /></label>
          {(f.tipo === "compra" || f.tipo === "venda") && <label>Taxas (R$)<input name="taxas" type="number" step="0.01" min="0" placeholder="0" value={f.taxas} onChange={e => muda({ taxas: e.target.value })} /></label>}
          {f.classe === "exterior" && <label>Câmbio (R$ por unidade)<input name="cambio" type="number" step="any" min="0" required value={f.cambio} onChange={e => muda({ cambio: e.target.value })} /></label>}
        </>}
      <label>Observação<input name="obs" maxLength={200} placeholder="Opcional" value={f.obs} onChange={e => muda({ obs: e.target.value })} /></label>
      <span className="pair">
        <button className="primary" type="submit" disabled={!!bloqueado}>Lançar</button>
        {inicial && <button type="button" onClick={onCancelar}>Cancelar</button>}
      </span>
    </form>
    {bloqueado && <div className="err" style={{ marginTop: 8 }}>{ativo} está na carteira sem histórico. Informe o saldo inicial dele (acima) antes de lançar operações.</div>}
    <div className="status" style={{ marginTop: 6 }}>O valor em reais e o valor presente da posição (logo antes da operação) ficam guardados com a operação. O preço médio soma as taxas da compra; na venda, as taxas saem do valor recebido.
      Exterior: informe o câmbio do dia da operação (PTAX), que é o que vale para o imposto.</div>
  </>;
}
