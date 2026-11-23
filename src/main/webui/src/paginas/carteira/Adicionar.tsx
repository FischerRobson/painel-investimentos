// "Adicionar" da Carteira: abas Ação / FII, Cripto e Renda fixa (a aba fica guardada em addTab). O formulário de renda fixa
// também edita um título existente (rfEditId). Se o ativo já estiver na carteira, a quantidade é substituída.
import { useEffect, useRef, useState } from "react";
import { carteiraStore } from "../../lib/carteira";
import { store } from "../../lib/store";
import { hojeISO } from "../../lib/dados";
import type { Posicao } from "../../lib/composicao";
import type { Indexador, TituloRF } from "../../motor";

const COINS = ["BTC", "ETH", "SOL", "USDT", "USDC", "XRP", "BNB", "ADA", "DOGE", "LINK"];
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

// Troca a quantidade se o ativo já existe; senão acrescenta
const comPosicao = (lista: Posicao[], t: string, q: number) =>
  lista.some(x => x.t === t) ? lista.map(x => x.t === t ? { ...x, q } : x) : [...lista, { t, q }];

export function Adicionar({ rf, rfEditId, setRfEditId }: { rf: TituloRF[]; rfEditId: string | null; setRfEditId: (id: string | null) => void }) {
  const [aba, setAbaState] = useState<Aba>(() => (["rv", "cr", "rf"].includes(store.get("addTab", "rv")) ? store.get("addTab", "rv") : "rv") as Aba);
  const setAba = (a: Aba) => { setAbaState(a); setRfEditId(null); store.set("addTab", a); };
  // Editar um título leva para a aba de renda fixa
  useEffect(() => { if (rfEditId) { setAbaState("rf"); store.set("addTab", "rf"); } }, [rfEditId]);
  const editando = rfEditId ? rf.find(x => x.id === rfEditId) ?? null : null;

  return <>
    <h3>Adicionar</h3>
    <div className="seg">
      <button className={aba === "rv" ? "on" : undefined} onClick={() => setAba("rv")}>Ação / FII</button>
      <button className={aba === "cr" ? "on" : undefined} onClick={() => setAba("cr")}>Cripto</button>
      <button className={aba === "rf" ? "on" : undefined} onClick={() => setAba("rf")}>Renda fixa</button>
    </div>
    {aba === "rv" && <FormAcao />}
    {aba === "cr" && <FormCripto />}
    {aba === "rf" && <FormRendaFixa key={rfEditId ?? "novo"} editando={editando} aoTerminar={() => setRfEditId(null)} />}
  </>;
}

function FormAcao() {
  const [t, setT] = useState(""), [q, setQ] = useState("");
  return (
    <form className="w-add" onSubmit={e => {
      e.preventDefault();
      const tk = parseTickers(t)[0], n = Number(q);
      if (!tk || !(n >= 0)) return;
      carteiraStore.atualizar(d => ({ ...d, acoesFiis: comPosicao((d.acoesFiis ?? []) as Posicao[], tk, n) }));
      setT(""); setQ("");
    }}>
      <input name="t" placeholder="Ticker (ex.: BBDC4, AAPL)" autoComplete="off" spellCheck={false} required
        value={t} onChange={e => setT(e.target.value)} />
      <input name="q" type="number" min="0" step="1" placeholder="Quantidade" required value={q} onChange={e => setQ(e.target.value)} />
      <button className="primary" type="submit">Adicionar</button>
      <span className="status">Ações americanas (ex.: AAPL, MSFT) entram convertidas pelo dólar do dia. Se já estiver na carteira, a quantidade é substituída.</span>
    </form>
  );
}

function FormCripto() {
  const [t, setT] = useState(COINS[0]), [q, setQ] = useState("");
  return (
    <form className="w-add" onSubmit={e => {
      e.preventDefault();
      const n = Number(q);
      if (!(n >= 0)) return;
      carteiraStore.atualizar(d => ({ ...d, cripto: comPosicao((d.cripto ?? []) as Posicao[], t, n) }));
      setT(COINS[0]); setQ("");
    }}>
      <select name="t" value={t} onChange={e => setT(e.target.value)} aria-label="Moeda">{COINS.map(c => <option key={c}>{c}</option>)}</select>
      <input name="q" type="number" min="0" step="any" placeholder="Quantidade (ex.: 0,015)" required value={q} onChange={e => setQ(e.target.value)} />
      <button className="primary" type="submit">Adicionar</button>
      <span className="status">Preço em reais pelo CoinGecko. Se já estiver na carteira, a quantidade é substituída.</span>
    </form>
  );
}

type CamposRF = { nome: string; tipo: string; idx: Indexador; taxa: string; aplicado: string; data: string; venc: string; isento: boolean };
const VAZIO: CamposRF = { nome: "", tipo: RF_TIPOS[0], idx: "cdi", taxa: "", aplicado: "", data: "", venc: "", isento: false };

function FormRendaFixa({ editando, aoTerminar }: { editando: TituloRF | null; aoTerminar: () => void }) {
  const [f, setF] = useState<CamposRF>(() => editando
    ? { nome: editando.nome, tipo: editando.tipo, idx: editando.idx, taxa: String(editando.taxa), aplicado: String(editando.aplicado), data: editando.data, venc: editando.venc || "", isento: !!editando.isento }
    : VAZIO);
  const muda = (p: Partial<CamposRF>) => setF(x => ({ ...x, ...p }));
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (editando) form.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, [editando]);

  // O tipo sugere a isenção e o indexador (Tesouro Selic = 100% do CDI)
  const mudaTipo = (tipo: string) => {
    const p: Partial<CamposRF> = { tipo, isento: RF_ISENTOS.includes(tipo) };
    if (tipo === "Tesouro Selic") { p.idx = "cdi"; p.taxa = "100"; }
    if (tipo === "Tesouro Prefixado") p.idx = "pre";
    if (tipo === "Tesouro IPCA+") p.idx = "ipca";
    muda(p);
  };
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = {
      nome: f.nome.trim(), tipo: f.tipo, idx: f.idx, taxa: Number(f.taxa), aplicado: Number(f.aplicado), data: f.data,
      venc: f.venc || null, isento: f.isento,
    };
    carteiraStore.atualizar(d => {
      const lista = (d.rendaFixa ?? []) as TituloRF[];
      const existe = editando && lista.some(x => x.id === editando.id);
      return { ...d, rendaFixa: existe ? lista.map(x => x.id === editando.id ? { ...x, ...entry } : x) : [...lista, { id: Date.now().toString(36), ...entry }] };
    });
    setF(VAZIO);
    aoTerminar();
  };

  return <>
    <form className="w-add rf-form" ref={form} onSubmit={salvar}>
      <label>Nome<input name="nome" placeholder="Ex.: CDB Banco Inter" required value={f.nome} onChange={e => muda({ nome: e.target.value })} /></label>
      <label>Tipo<select name="tipo" value={f.tipo} onChange={e => mudaTipo(e.target.value)}>{RF_TIPOS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Rentabilidade<span className="pair">
        <select name="idx" value={f.idx} onChange={e => muda({ idx: e.target.value as Indexador })} aria-label="Indexador">
          <option value="cdi">% do CDI</option><option value="pre">Prefixado % a.a.</option><option value="ipca">IPCA + % a.a.</option>
        </select>
        <input name="taxa" type="number" step="any" min="0" placeholder="Ex.: 110" required value={f.taxa} onChange={e => muda({ taxa: e.target.value })} aria-label="Taxa" />
      </span></label>
      <label>Valor aplicado (R$) — quanto saiu da sua conta no dia<input name="aplicado" type="number" step="0.01" min="0" required value={f.aplicado} onChange={e => muda({ aplicado: e.target.value })} /></label>
      <label>Data da aplicação<input name="data" type="date" max={hojeISO()} required value={f.data} onChange={e => muda({ data: e.target.value })} /></label>
      <label>Vencimento<input name="venc" type="date" value={f.venc} onChange={e => muda({ venc: e.target.value })} /></label>
      <label className="chk"><input name="isento" type="checkbox" checked={f.isento} onChange={e => muda({ isento: e.target.checked })} /> Isento de IR</label>
      {editando
        ? <span className="pair"><button className="primary" type="submit">Salvar alterações</button><button type="button" onClick={aoTerminar}>Cancelar</button></span>
        : <button className="primary" type="submit">Adicionar</button>}
    </form>
    <div className="status" style={{ marginTop: 6 }}>{editando && <><b>Editando um título.</b> </>}Valor estimado "na curva" com o CDI e o IPCA do Banco Central, descontando o IR (tabela regressiva). Não considera IOF (só vale para menos de 30 dias) nem a marcação a mercado do Tesouro.</div>
  </>;
}
