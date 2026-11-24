// Lançar uma operação: o único lugar onde a carteira muda (fora moedas, que ficam na página Moedas).
// Primeiro a classe (ações e FIIs, cripto ou renda fixa), depois a operação de cada uma:
//  - ações, FIIs, ETFs, BDRs e exterior: compra (ticker digitado), venda e evento (desdobramento, grupamento, bonificação);
//  - cripto: compra e venda;
//  - renda fixa: aplicação (título novo) e resgate (FormRendaFixa.tsx).
// Na venda, no evento e no resgate o ativo é escolhido na lista do que você tem, com a quantidade disponível na data.
// Operação lançada não se edita: para corrigir, estorne no histórico; o formulário volta preenchido (inicialDe).
import { useEffect, useRef, useState } from "react";
import { hojeISO } from "../../lib/dados";
import { brl, parseTickers } from "../../lib/formato";
import { novoIdOp } from "../../lib/operacoes";
import { NOME_CLASSE, NOME_TIPO, processar, type Classe, type Operacao, type TaxasBCB, type TipoOperacao, type TituloRF } from "../../motor";
import { FormAplicacao, FormResgate, deAplicacao, type CamposRF } from "./FormRendaFixa";

export const COINS = ["BTC", "ETH", "SOL", "USDT", "USDC", "XRP", "BNB", "ADA", "DOGE", "LINK"];
const CLASSES_RV: Classe[] = ["acao", "fii", "etf", "bdr", "exterior"];
const EVENTOS: TipoOperacao[] = ["desdobramento", "grupamento", "bonificacao"];

export type Grupo = "rv" | "cripto" | "rf";
export type Movimento = "entrada" | "saida" | "evento";
const NOME_GRUPO: Record<Grupo, string> = { rv: "Ações, FIIs e exterior", cripto: "Cripto", rf: "Renda fixa" };
const MOVIMENTOS: Record<Grupo, [Movimento, string][]> = {
  rv: [["entrada", "Compra"], ["saida", "Venda"], ["evento", "Evento"]],
  cripto: [["entrada", "Compra"], ["saida", "Venda"]],
  rf: [["entrada", "Aplicação"], ["saida", "Resgate"]],
};

type Campos = { tipo: TipoOperacao; data: string; classe: Classe; ativo: string; qtd: string; preco: string; taxas: string; cambio: string; fator: string; obs: string };
export type Inicial = { grupo: Grupo; mov: Movimento; campos?: Partial<Campos>; rf?: Partial<CamposRF> };

const deOperacao = (o: Operacao): Partial<Campos> => ({
  tipo: o.tipo, data: o.data, classe: o.classe as Classe, ativo: o.ativo, qtd: o.qtd != null ? String(o.qtd) : "", preco: o.preco != null ? String(o.preco) : "",
  taxas: o.taxas ? String(o.taxas) : "", cambio: o.cambio ? String(o.cambio) : "", fator: o.fator ? String(o.fator) : "", obs: o.obs ?? "",
});

// O formulário preenchido com uma operação estornada (moedas se lançam de novo na página Moedas)
export function inicialDe(o: Operacao): Inicial | null {
  if (o.classe === "moeda" || o.tipo === "estorno") return null;
  if (o.classe === "rf") return o.tipo === "aplicacao" ? { grupo: "rf", mov: "entrada", rf: deAplicacao(o) } : { grupo: "rf", mov: "saida", campos: { ativo: o.ativo, data: o.data } };
  return { grupo: o.classe === "cripto" ? "cripto" : "rv", mov: o.tipo === "compra" ? "entrada" : o.tipo === "venda" ? "saida" : "evento", campos: deOperacao(o) };
}

type Props = {
  inicial?: Inicial | null;
  operacoes: Operacao[];
  titulos: TituloRF[];                                  // renda fixa na carteira (para o resgate)
  rates: TaxasBCB | null;
  pendentes: { t: string; cripto: boolean }[];          // na carteira sem histórico: pedem saldo inicial antes
  classeDe: (ativo: string) => Classe | undefined;      // classe que o ativo já tem (operações anteriores ou cotação)
  cambioDe: (ativo: string) => number | undefined;      // câmbio de hoje para ativos do exterior
  precoDe: (classe: Classe, ativo: string) => number | null; // preço de hoje em reais (sugestão)
  onSalvar: (o: Operacao) => void; onCancelar: () => void;
};

export function FormOperacao(p: Props) {
  const [grupo, setGrupo] = useState<Grupo>(p.inicial?.grupo ?? "rv");
  const [mov, setMov] = useState<Movimento>(p.inicial?.mov ?? "entrada");
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => { if (p.inicial) caixa.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, [p.inicial]);
  const mudaGrupo = (g: Grupo) => { setGrupo(g); if (!MOVIMENTOS[g].some(([m]) => m === mov)) setMov("entrada"); };
  const ini = p.inicial && p.inicial.grupo === grupo && p.inicial.mov === mov ? p.inicial : undefined;
  const cancelar = p.inicial ? <button type="button" onClick={p.onCancelar}>Cancelar</button> : null;

  return (
    <div ref={caixa}>
      <div className="op-segs">
      <div className="seg" role="group" aria-label="Classe do ativo">
        {(Object.keys(NOME_GRUPO) as Grupo[]).map(g => <button key={g} type="button" aria-pressed={grupo === g} className={grupo === g ? "on" : undefined} onClick={() => mudaGrupo(g)}>{NOME_GRUPO[g]}</button>)}
      </div>
      <div className="seg" role="group" aria-label="Operação">
        {MOVIMENTOS[grupo].map(([m, nome]) => <button key={m} type="button" aria-pressed={mov === m} className={mov === m ? "on" : undefined} onClick={() => setMov(m)}>{nome}</button>)}
      </div>
      </div>
      {grupo === "rf"
        ? mov === "entrada"
          ? <FormAplicacao key={"apl" + JSON.stringify(ini?.rf ?? {})} inicial={ini?.rf} onSalvar={p.onSalvar} botoes={cancelar} />
          : <FormResgate key={"res" + (ini?.campos?.ativo ?? "")} titulos={p.titulos} rates={p.rates} inicial={ini?.campos} onSalvar={p.onSalvar} botoes={cancelar} />
        : <FormNegocio key={grupo + mov + JSON.stringify(ini?.campos ?? {})} {...p} grupo={grupo} mov={mov} inicial={ini?.campos} cancelar={cancelar} />}
    </div>
  );
}

// Compra, venda e eventos de ações, FIIs, ETFs, BDRs, exterior e cripto
function FormNegocio({ grupo, mov, inicial, operacoes, pendentes, classeDe, cambioDe, precoDe, onSalvar, cancelar }: Omit<Props, "inicial"> & {
  grupo: "rv" | "cripto"; mov: Movimento; inicial?: Partial<Campos>; cancelar: React.ReactNode;
}) {
  const cripto = grupo === "cripto";
  const tipoInicial: TipoOperacao = mov === "entrada" ? "compra" : mov === "saida" ? "venda" : EVENTOS.includes(inicial?.tipo as TipoOperacao) ? inicial!.tipo! : "desdobramento";
  // O que dá para vender (ou ter evento): as posições de hoje, da classe escolhida
  const posicoes = Object.values(processar(operacoes).posicoes).filter(x => x.qtd > 0 && (x.classe === "cripto") === cripto).sort((a, b) => a.ativo.localeCompare(b.ativo));
  const semHistorico = pendentes.filter(x => x.cripto === cripto);
  const vazio: Campos = {
    tipo: tipoInicial, data: hojeISO(), classe: cripto ? "cripto" : "acao", ativo: mov === "entrada" ? (cripto ? COINS[0] : "") : posicoes[0]?.ativo ?? "",
    qtd: "", preco: "", taxas: "", cambio: "", fator: "", obs: "",
  };
  const [f, setF] = useState<Campos>(() => {
    const c = { ...vazio, ...inicial, tipo: tipoInicial };
    const pos = posicoes.find(x => x.ativo === c.ativo);
    return pos ? { ...c, classe: pos.classe } : c;
  });
  const muda = (x: Partial<Campos>) => setF(v => ({ ...v, ...x }));

  const escolhido = mov !== "entrada";
  const ativo = cripto || escolhido ? f.ativo : parseTickers(f.ativo)[0] ?? "";
  const pendente = semHistorico.some(x => x.t === ativo);
  const evento = f.tipo === "desdobramento" || f.tipo === "grupamento";
  const disponivel = escolhido && ativo ? processar(operacoes.filter(o => o.ativo === ativo), f.data).posicoes[ativo]?.qtd ?? 0 : 0;
  const hoje = precoDe(f.classe, ativo);

  const mudaAtivo = (texto: string) => {
    if (escolhido) {
      const pos = posicoes.find(x => x.ativo === texto);
      return muda({ ativo: texto, qtd: "", ...(pos ? { classe: pos.classe } : {}) });
    }
    const c = cripto ? undefined : classeDe(parseTickers(texto)[0] ?? "");
    muda({ ativo: texto, ...(c && c !== f.classe ? { classe: c } : {}) });
  };
  const mudaClasse = (classe: Classe) => {
    const x: Partial<Campos> = { classe };
    if (classe === "exterior" && !f.cambio) { const c = cambioDe(ativo); if (c) x.cambio = String(+c.toFixed(4)); }
    muda(x);
  };

  const qtdNum = Number(f.qtd);
  const excede = f.tipo === "venda" && qtdNum > disponivel + 1e-9;
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ativo || pendente || excede) return;
    const num = (s: string) => s === "" ? undefined : Number(s);
    const cambio = f.classe === "exterior" && !evento ? num(f.cambio) ?? cambioDe(ativo) : undefined;
    onSalvar({
      id: novoIdOp(), data: f.data, tipo: f.tipo, classe: f.classe, ativo,
      ...(evento ? { fator: num(f.fator) } : { qtd: num(f.qtd), preco: num(f.preco) }),
      ...(f.tipo === "compra" || f.tipo === "venda" ? { taxas: num(f.taxas) } : {}),
      ...(cambio ? { cambio } : {}),
      ...(f.obs.trim() ? { obs: f.obs.trim() } : {}),
    });
    setF({ ...vazio, tipo: f.tipo, classe: f.classe, data: f.data, ativo: escolhido ? f.ativo : vazio.ativo });
  };

  if (escolhido && !posicoes.length) {
    return <div className="hint">{semHistorico.length
      ? `${semHistorico.map(x => x.t).join(", ")} ainda sem histórico: informe o saldo inicial acima para poder ${mov === "saida" ? "vender" : "lançar eventos"}.`
      : `Você não tem ${cripto ? "cripto" : "ações, FIIs ou ativos do exterior"} na carteira para ${mov === "saida" ? "vender" : "lançar eventos"}.`}</div>;
  }

  const qtdFmt = (q: number) => brl(q, q % 1 ? (cripto ? 8 : 4) : 0);
  return <>
    <form className="w-add rf-form" onSubmit={salvar} aria-label={`${NOME_TIPO[f.tipo]} de ${cripto ? "cripto" : "ações e FIIs"}`}>
      {mov === "evento" && <label>Evento<select name="tipo" value={f.tipo} onChange={e => muda({ tipo: e.target.value as TipoOperacao })}>
        {EVENTOS.map(t => <option key={t} value={t}>{NOME_TIPO[t]}</option>)}</select></label>}
      <label>Ativo{escolhido
        ? <select name="ativo" value={f.ativo} onChange={e => mudaAtivo(e.target.value)}>
            {posicoes.map(x => <option key={x.ativo} value={x.ativo}>{x.ativo} — {qtdFmt(x.qtd)} {cripto ? "" : NOME_CLASSE[x.classe]}</option>)}
          </select>
        : cripto
          ? <select name="ativo" value={f.ativo} onChange={e => mudaAtivo(e.target.value)}>{COINS.map(c => <option key={c}>{c}</option>)}</select>
          : <input name="ativo" required placeholder="Ex.: ITSA4" autoComplete="off" spellCheck={false} style={{ textTransform: "uppercase" }}
              list="ativos-carteira" value={f.ativo} onChange={e => mudaAtivo(e.target.value)} />}</label>
      {!cripto && !escolhido && <>
        <datalist id="ativos-carteira">{posicoes.map(x => <option key={x.ativo} value={x.ativo} />)}</datalist>
        <label>Classe<select name="classe" value={f.classe} onChange={e => mudaClasse(e.target.value as Classe)}>
          {CLASSES_RV.map(c => <option key={c} value={c}>{NOME_CLASSE[c]}</option>)}</select></label>
      </>}
      <label>Data<input name="data" type="date" required max={hojeISO()} value={f.data} onChange={e => muda({ data: e.target.value })} /></label>
      {evento
        ? <label>Fator ({f.tipo === "desdobramento" ? "1 vira quantas" : "quantas viram 1"})<input name="fator" type="number" step="any" min="0" required placeholder="Ex.: 2" value={f.fator} onChange={e => muda({ fator: e.target.value })} /></label>
        : <>
          <label>Quantidade{f.tipo === "venda" && <> <span className="muted">(você tem {qtdFmt(disponivel)})</span></>}
            <span className="pair">
              <input name="qtd" type="number" step="any" min="0" max={f.tipo === "venda" ? disponivel : undefined} required value={f.qtd} onChange={e => muda({ qtd: e.target.value })} aria-label="Quantidade" />
              {f.tipo === "venda" && <button type="button" onClick={() => muda({ qtd: String(disponivel) })} disabled={!disponivel}>Tudo</button>}
            </span></label>
          <label>{f.tipo === "bonificacao" ? "Custo atribuído por ação (R$)" : `Preço${f.classe === "exterior" ? " (na moeda do ativo)" : " (R$)"}`}
            <input name="preco" type="number" step="any" min="0" required placeholder={hoje != null && f.classe !== "exterior" ? `hoje ${brl(hoje, hoje < 1 ? 4 : 2)}` : ""}
              value={f.preco} onChange={e => muda({ preco: e.target.value })} aria-label="Preço" /></label>
          {(f.tipo === "compra" || f.tipo === "venda") && <label>Taxas (R$)<input name="taxas" type="number" step="0.01" min="0" placeholder="0" value={f.taxas} onChange={e => muda({ taxas: e.target.value })} /></label>}
          {f.classe === "exterior" && <label>Câmbio (R$ por unidade)<input name="cambio" type="number" step="any" min="0" required value={f.cambio} placeholder={cambioDe(ativo) ? String(+cambioDe(ativo)!.toFixed(4)) : ""} onChange={e => muda({ cambio: e.target.value })} /></label>}
        </>}
      <label>Observação<input name="obs" maxLength={200} placeholder="Opcional" value={f.obs} onChange={e => muda({ obs: e.target.value })} /></label>
      <span className="pair">
        <button className="primary" type="submit" disabled={pendente || excede}>Lançar</button>
        {cancelar}
      </span>
    </form>
    {pendente && <div className="err" style={{ marginTop: 8 }}>{ativo} está na carteira sem histórico. Informe o saldo inicial dele (acima) antes de lançar operações.</div>}
    {excede && <div className="err" style={{ marginTop: 8 }}>Em {f.data.split("-").reverse().join("/")} você tinha {qtdFmt(disponivel)} de {ativo}.</div>}
    <div className="status" style={{ marginTop: 6 }}>O valor em reais e o valor presente da posição (logo antes da operação) ficam guardados com a operação. O preço médio soma as taxas da compra; na venda, as taxas saem do valor recebido.
      {f.classe === "exterior" && " Exterior: informe o câmbio do dia da operação (PTAX), que é o que vale para o imposto."}</div>
  </>;
}
