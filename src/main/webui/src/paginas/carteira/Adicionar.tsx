// "Adicionar" da Carteira: abas Ação / FII, Cripto e Renda fixa (a aba fica guardada em addTab). Tudo entra como operação:
// compra (ações, FIIs, exterior e cripto) ou aplicação (renda fixa). O resgate de um título fica em FormResgate.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { novoIdOp, operacoesStore } from "../../lib/operacoes";
import { COINS } from "../operacoes/FormOperacao";
import { carteiraStore } from "../../lib/carteira";
import { store } from "../../lib/store";
import { hojeISO, isoBR } from "../../lib/dados";
import { money } from "../../lib/formato";
import type { Posicao } from "../../lib/composicao";
import { NOME_CLASSE, rfCalc, type Classe, type Indexador, type Operacao, type TaxasBCB, type TituloRF } from "../../motor";
const RF_TIPOS = ["CDB", "LCI", "LCA", "CRI", "CRA", "Tesouro Selic", "Tesouro Prefixado", "Tesouro IPCA+", "Debênture", "Poupança/Outro"];
const RF_ISENTOS = ["LCI", "LCA", "CRI", "CRA"];
type Aba = "rv" | "cr" | "rf";

export const parseTickers = (s: string) =>
  [...new Set(s.split(/[,\s;]+/).map(t => t.trim().toUpperCase().replace(/\.SA$/, "")).filter(Boolean))];

// Booleano guardado no localStorage ("1"/"0")
export function useAberto(chave: string, padrao: "1" | "0"): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => store.get(chave, padrao) === "1");
  return [v, novo => { setV(novo); store.set(chave, novo ? "1" : "0"); }];
}

export function Adicionar() {
  const [aba, setAbaState] = useState<Aba>(() => (["rv", "cr", "rf"].includes(store.get("addTab", "rv")) ? store.get("addTab", "rv") : "rv") as Aba);
  const setAba = (a: Aba) => { setAbaState(a); store.set("addTab", a); };

  return <>
    <h3>Adicionar</h3>
    <div className="seg">
      <button className={aba === "rv" ? "on" : undefined} onClick={() => setAba("rv")}>Ação / FII</button>
      <button className={aba === "cr" ? "on" : undefined} onClick={() => setAba("cr")}>Cripto</button>
      <button className={aba === "rf" ? "on" : undefined} onClick={() => setAba("rf")}>Renda fixa</button>
    </div>
    {aba === "rv" && <FormAcao />}
    {aba === "cr" && <FormCripto />}
    {aba === "rf" && <FormRendaFixa />}
  </>;
}

// Ação/FII/exterior e cripto entram como uma compra (vai para Operações, e a quantidade da carteira vem dela)
function FormAcao() {
  const [t, setT] = useState(""), [q, setQ] = useState(""), [preco, setPreco] = useState(""), [data, setData] = useState(hojeISO());
  const [classe, setClasse] = useState<Classe>("acao");
  return (
    <form className="w-add" onSubmit={e => {
      e.preventDefault();
      const tk = parseTickers(t)[0], n = Number(q), p = Number(preco);
      if (!tk || !(n > 0) || !(p >= 0)) return;
      comprar({ classe, ativo: tk, qtd: n, preco: p, data });
      setT(""); setQ(""); setPreco("");
    }}>
      <input name="t" placeholder="Ticker (ex.: BBDC4, AAPL)" autoComplete="off" spellCheck={false} required
        value={t} onChange={e => setT(e.target.value)} />
      <select aria-label="Classe" value={classe} onChange={e => setClasse(e.target.value as Classe)}>
        {(["acao", "fii", "etf", "bdr", "exterior"] as Classe[]).map(c => <option key={c} value={c}>{NOME_CLASSE[c]}</option>)}
      </select>
      <input name="q" type="number" min="0" step="any" placeholder="Quantidade" required value={q} onChange={e => setQ(e.target.value)} />
      <input name="preco" type="number" min="0" step="any" placeholder={classe === "exterior" ? "Preço (R$ por ação)" : "Preço (R$)"} aria-label="Preço" required value={preco} onChange={e => setPreco(e.target.value)} />
      <input name="data" type="date" aria-label="Data da compra" max={hojeISO()} required value={data} onChange={e => setData(e.target.value)} />
      <button className="primary" type="submit">Adicionar</button>
      <span className="status">Entra como uma compra em <Link to="/operacoes">Operações</Link>, que calcula o preço médio e o imposto. Ações americanas (ex.: AAPL) entram convertidas pelo dólar do dia; para o câmbio exato, lance em Operações.</span>
    </form>
  );
}

function FormCripto() {
  const [t, setT] = useState(COINS[0]), [q, setQ] = useState(""), [preco, setPreco] = useState(""), [data, setData] = useState(hojeISO());
  return (
    <form className="w-add" onSubmit={e => {
      e.preventDefault();
      const n = Number(q), p = Number(preco);
      if (!(n > 0) || !(p >= 0)) return;
      comprar({ classe: "cripto", ativo: t, qtd: n, preco: p, data });
      setT(COINS[0]); setQ(""); setPreco("");
    }}>
      <select name="t" value={t} onChange={e => setT(e.target.value)} aria-label="Moeda">{COINS.map(c => <option key={c}>{c}</option>)}</select>
      <input name="q" type="number" min="0" step="any" placeholder="Quantidade (ex.: 0,015)" required value={q} onChange={e => setQ(e.target.value)} />
      <input name="preco" type="number" min="0" step="any" placeholder="Preço (R$)" aria-label="Preço" required value={preco} onChange={e => setPreco(e.target.value)} />
      <input name="data" type="date" aria-label="Data da compra" max={hojeISO()} required value={data} onChange={e => setData(e.target.value)} />
      <button className="primary" type="submit">Adicionar</button>
      <span className="status">Preço em reais pelo CoinGecko. Entra como uma compra em <Link to="/operacoes">Operações</Link>.</span>
    </form>
  );
}

// Ativo que estava na carteira sem histórico ganha antes um saldo inicial com o preço da compra nova (dá para corrigir em Operações)
function comprar({ classe, ativo, qtd, preco, data }: { classe: Classe; ativo: string; qtd: number; preco: number; data: string }) {
  const d = carteiraStore.get().doc;
  if (!d) return;
  const lista = ((classe === "cripto" ? d.cripto : d.acoesFiis) ?? []) as Posicao[];
  const antes = lista.find(p => p.t === ativo);
  const novas: Operacao[] = [];
  if (antes && antes.q > 0 && !(d.operacoes ?? []).some(o => o.ativo === ativo)) {
    novas.push({ id: novoIdOp(), data, tipo: "compra", classe, ativo, qtd: antes.q, preco, inicial: true, obs: "saldo que já estava na carteira" });
  }
  novas.push({ id: novoIdOp(), data, tipo: "compra", classe, ativo, qtd, preco });
  operacoesStore.lancar(...novas);
}

type CamposRF = { nome: string; tipo: string; idx: Indexador; taxa: string; aplicado: string; data: string; venc: string; isento: boolean; instituicao: string; liquidez: boolean };
const VAZIO: CamposRF = { nome: "", tipo: RF_TIPOS[0], idx: "cdi", taxa: "", aplicado: "", data: "", venc: "", isento: false, instituicao: "", liquidez: false };

function FormRendaFixa() {
  const [f, setF] = useState<CamposRF>(VAZIO);
  const muda = (p: Partial<CamposRF>) => setF(x => ({ ...x, ...p }));

  // O tipo sugere a isenção e o indexador (Tesouro Selic = 100% do CDI)
  const mudaTipo = (tipo: string) => {
    const p: Partial<CamposRF> = { tipo, isento: RF_ISENTOS.includes(tipo), liquidez: tipo === "Tesouro Selic" };
    if (tipo === "Tesouro Selic") { p.idx = "cdi"; p.taxa = "100"; }
    if (tipo === "Tesouro Prefixado") p.idx = "pre";
    if (tipo === "Tesouro IPCA+") p.idx = "ipca";
    muda(p);
  };
  // Cada aplicação é um título novo, com o valor que saiu da conta como principal
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const aplicado = Number(f.aplicado);
    if (!(aplicado > 0)) return;
    operacoesStore.lancar({
      id: novoIdOp(), data: f.data, tipo: "aplicacao", classe: "rf", ativo: novoIdOp(), qtd: aplicado, valor: aplicado, valorPresente: 0,
      titulo: {
        nome: f.nome.trim(), tipo: f.tipo, idx: f.idx, taxa: Number(f.taxa), venc: f.venc || null, isento: f.isento,
        instituicao: f.instituicao.trim() || null, liquidezDiaria: f.liquidez,
      },
    });
    setF(VAZIO);
  };

  return <>
    <form className="w-add rf-form" onSubmit={salvar}>
      <label>Nome<input name="nome" placeholder="Ex.: CDB Banco Inter" required value={f.nome} onChange={e => muda({ nome: e.target.value })} /></label>
      <label>Tipo<select name="tipo" value={f.tipo} onChange={e => mudaTipo(e.target.value)}>{RF_TIPOS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Rentabilidade<span className="pair">
        <select name="idx" value={f.idx} onChange={e => muda({ idx: e.target.value as Indexador })} aria-label="Indexador">
          <option value="cdi">% do CDI</option><option value="pre">Prefixado % a.a.</option><option value="ipca">IPCA + % a.a.</option>
        </select>
        <input name="taxa" type="number" step="any" min="0" placeholder="Ex.: 110" required value={f.taxa} onChange={e => muda({ taxa: e.target.value })} aria-label="Taxa" />
      </span></label>
      <label>Valor aplicado (R$) — quanto saiu da sua conta no dia<input name="aplicado" type="number" step="0.01" min="0.01" required value={f.aplicado} onChange={e => muda({ aplicado: e.target.value })} /></label>
      <label>Data da aplicação<input name="data" type="date" max={hojeISO()} required value={f.data} onChange={e => muda({ data: e.target.value })} /></label>
      <label>Vencimento<input name="venc" type="date" value={f.venc} onChange={e => muda({ venc: e.target.value })} /></label>
      <label>Banco ou corretora (para o limite do FGC)<input name="instituicao" placeholder="Ex.: Banco Inter" value={f.instituicao} onChange={e => muda({ instituicao: e.target.value })} /></label>
      <label className="chk"><input name="isento" type="checkbox" checked={f.isento} onChange={e => muda({ isento: e.target.checked })} /> Isento de IR</label>
      <label className="chk"><input name="liquidez" type="checkbox" checked={f.liquidez} onChange={e => muda({ liquidez: e.target.checked })} /> Liquidez diária (conta na reserva de emergência)</label>
      <button className="primary" type="submit">Aplicar</button>
    </form>
    <div className="status" style={{ marginTop: 6 }}>Entra como uma aplicação em <Link to="/operacoes">Operações</Link>. Valor estimado "na curva" com o CDI e o IPCA do Banco Central, descontando o IR (tabela regressiva). Não considera IOF (só vale para menos de 30 dias) nem a marcação a mercado do Tesouro.</div>
  </>;
}

// Resgate de um título: total ou parcial. O valor presente (o título na curva, líquido, no dia do resgate) vem calculado e
// pode ser trocado pelo do extrato; no parcial, sai do principal a mesma fração que o valor recebido é do valor presente.
export function FormResgate({ titulo, rates, aoTerminar }: { titulo: TituloRF; rates: TaxasBCB | null; aoTerminar: () => void }) {
  const [data, setData] = useState(hojeISO());
  const [total, setTotal] = useState(true);
  const estimado = rates && data >= titulo.data ? +rfCalc(titulo, rates, data).liquido.toFixed(2) : null;
  const [presente, setPresente] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, []);
  const vp = presente !== "" ? Number(presente) : estimado ?? 0;
  const recebido = valor !== "" ? Number(valor) : total ? vp : 0;

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(recebido > 0) || data < titulo.data) return;
    const fracao = total || !(vp > 0) ? 1 : Math.min(1, recebido / vp);
    const qtd = fracao >= 0.999 ? titulo.aplicado : Math.round(titulo.aplicado * fracao * 100) / 100;
    operacoesStore.lancar({ id: novoIdOp(), data, tipo: "resgate", classe: "rf", ativo: titulo.id, qtd, valor: recebido, valorPresente: vp });
    aoTerminar();
  };

  return (
    <form className="w-add rf-form" ref={form} onSubmit={salvar} aria-label={`Resgate de ${titulo.nome}`}>
      <b style={{ gridColumn: "1 / -1" }}>Resgatar {titulo.nome} <span className="muted">aplicado {money(titulo.aplicado)} em {isoBR(titulo.data)}</span></b>
      <label>Data do resgate<input name="data" type="date" min={titulo.data} max={hojeISO()} required value={data} onChange={e => setData(e.target.value)} /></label>
      <label className="chk"><input name="total" type="checkbox" checked={total} onChange={e => setTotal(e.target.checked)} /> Resgate total (o título sai da carteira)</label>
      <label>Valor presente (R$) — o título líquido no dia, antes do resgate
        <input name="valorPresente" type="number" step="0.01" min="0" required placeholder={estimado != null ? String(estimado) : "do extrato"}
          value={presente !== "" ? presente : estimado != null ? String(estimado) : ""} onChange={e => setPresente(e.target.value)} /></label>
      <label>Valor recebido (R$) — o que entrou na conta
        <input name="valor" type="number" step="0.01" min="0.01" required={!total} placeholder={total ? String(vp || "") : ""}
          value={valor} onChange={e => setValor(e.target.value)} /></label>
      <span className="pair"><button className="primary" type="submit">Resgatar</button><button type="button" onClick={aoTerminar}>Cancelar</button></span>
      <span className="status" style={{ gridColumn: "1 / -1" }}>Entra como um resgate em <Link to="/operacoes">Operações</Link>. O valor presente vem da curva (CDI e IPCA do Banco Central); se o extrato mostrar outro, use o do extrato.</span>
    </form>
  );
}
