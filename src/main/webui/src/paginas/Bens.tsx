// Bens: consulta da tabela FIPE (tipo → marca → modelo → ano) e os veículos salvos, que entram no patrimônio da Carteira.
// O valor FIPE de cada mês fica guardado no bem (hist), então o gráfico de desvalorização cresce com o tempo.
import { useEffect, useRef, useState } from "react";
import { useTitulo } from "../lib/useTitulo";
import { big, money, pct, signCls } from "../lib/formato";
import { carteiraStore, useCarteira, type Bem } from "../lib/carteira";
import { bemNome, comPreco, fipeGet, usePrecosBens, type PrecoFipe } from "../lib/bens";
import { configLinha, css } from "../lib/graficos";
import { Grafico } from "../componentes/Grafico";
import { ErroCarteira } from "../componentes/ErroCarteira";
import { Entrada, Selecao } from "../componentes/Campos";

const FIPE_TIPOS: Record<string, string> = { cars: "Carro", motorcycles: "Moto", trucks: "Caminhão" };
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

type Opcao = { code: string; name: string };
type Selecao = { type: string; brand: string; model: string; year: string };

// "outubro de 2026" -> número ordenável; "out/26"
const mesKey = (m: string) => { const [nome, , ano] = m.split(" "); return Number(ano) * 12 + MESES.indexOf(nome); };
const mesCurto = (m: string) => { const [nome, , ano] = m.split(" "); return nome.slice(0, 3) + "/" + String(ano).slice(2); };

// Variação entre o primeiro e o último mês: "+R$ 1.300,00 (+1,77%) desde set/26"
function Variacao({ h }: { h: { month: string; price: number }[] }) {
  if (h.length < 2) return null;
  const a = h[0].price, z = h[h.length - 1].price, d = z - a;
  return <><span className={signCls(d)}>{d > 0 ? "+" : d < 0 ? "−" : ""}{money(Math.abs(d))} ({pct((z / a - 1) * 100)})</span> desde {mesCurto(h[0].month)}</>;
}

export function Bens() {
  useTitulo("Bens");
  const carteira = useCarteira();
  const bens = carteira.doc?.bens ?? [];
  const { valor, erro: bensErr, guardar } = usePrecosBens();

  if (carteira.erro) return <ErroCarteira msg={carteira.erro} />;
  const total = bens.reduce((a, b) => a + (valor(b) || 0), 0);

  const salvar = (sel: Selecao, r: PrecoFipe, apelido: string) => {
    const b = comPreco({ id: Date.now().toString(36), ...sel, apelido: apelido.trim() || null }, r);
    guardar(b.id, r);
    carteiraStore.atualizar(d => ({ ...d, bens: [...(d.bens ?? []), b] }));
  };
  const remover = (b: Bem) => {
    if (!confirm(`Remover "${bemNome(b)}" dos seus bens?`)) return;
    carteiraStore.atualizar(d => ({ ...d, bens: (d.bens ?? []).filter(x => x.id !== b.id) }));
  };

  return <>
    <ConsultaFipe bens={bens} podeSalvar={!!carteira.doc} onSalvar={salvar} />
    <div className="panel">
      <div className="w-head"><div>
        <h2>Meus bens</h2>
        <div className="hint" style={{ margin: 0 }}>Entram no patrimônio total da Carteira, separados dos investimentos. O painel guarda o valor FIPE de cada mês, então o gráfico de desvalorização cresce com o tempo.</div>
      </div></div>
      {bensErr && <div className="err" style={{ marginTop: 8 }}>{bensErr}</div>}
      {bens.length
        ? <div className="tiles"><div className="tile"><div className="k">Total em bens</div><div className="v">{money(total)}</div><div className="s">{bens.length} {bens.length === 1 ? "veículo" : "veículos"}</div></div></div>
        : carteira.doc && <div className="hint" style={{ marginTop: 8 }}>Nenhum bem salvo ainda. Consulte um veículo acima e clique em "Salvar nos meus bens".</div>}
    </div>
    <div className="grid">
      {bens.map(b => {
        const h = Object.entries(b.hist || {}).map(([month, price]) => ({ month, price })).sort((x, y) => mesKey(x.month) - mesKey(y.month));
        const pontos = h.map(({ month, price }) => { const k = mesKey(month); return { x: new Date(Math.floor(k / 12), k % 12, 15).getTime(), y: price }; });
        return (
          <div className="card" key={b.id}>
            <div className="card-head">
              <div style={{ minWidth: 0 }}>
                <div className="tk" style={{ fontSize: 16 }}>{bemNome(b)} <span className="badge">{FIPE_TIPOS[b.type] || ""}</span></div>
                <div className="name" title={b.info?.model || ""}>{b.info?.brand || ""} · {b.info?.model || ""}</div>
                <div className="name muted">{String(b.info?.modelYear || "")} · {b.info?.fuel || ""} · FIPE {b.info?.codeFipe || ""}</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <div><div className="price">{money(valor(b))}</div><div className="chg muted">{b.last?.month || ""}</div></div>
                <button className="x" title="Remover" aria-label={`Remover ${bemNome(b)}`} onClick={() => remover(b)}>×</button>
              </div>
            </div>
            {h.length > 1 && (
              <div className="mini">
                <Grafico deps={[JSON.stringify(pontos)]} config={canvas => configLinha(canvas, [{ data: pontos, color: css("--s1") }], { fmtY: v => "R$ " + big(v), fmtTip: v => money(v) })} />
              </div>
            )}
            <div className="status">{h.length > 1 ? <>Variação: <Variacao h={h} /></> : "Ainda sem histórico suficiente."}</div>
          </div>
        );
      })}
    </div>
  </>;
}

function ConsultaFipe({ bens, podeSalvar, onSalvar }: { bens: Bem[]; podeSalvar: boolean; onSalvar: (s: Selecao, r: PrecoFipe, apelido: string) => void }) {
  const [sel, setSel] = useState<Selecao>({ type: "cars", brand: "", model: "", year: "" });
  const [listas, setListas] = useState<{ brands?: Opcao[]; models?: Opcao[]; years?: Opcao[] }>({});
  const [resultado, setResultado] = useState<PrecoFipe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [apelido, setApelido] = useState("");

  // Cada etapa busca a lista da seguinte; a mais recente vence se o usuário trocar rápido
  const pedido = useRef(0);
  async function etapa<T>(fn: () => Promise<T>, aplicar: (v: T) => void) {
    const n = ++pedido.current;
    setErro(null); setOcupado(true);
    try { const v = await fn(); if (n === pedido.current) aplicar(v); }
    catch (e) { if (n === pedido.current) setErro((e as Error).message); }
    if (n === pedido.current) setOcupado(false);
  }
  const carregarMarcas = (type: string) => etapa(() => fipeGet<Opcao[]>("brands", { type }), brands => setListas({ brands }));
  useEffect(() => { void carregarMarcas("cars"); }, []); // só na abertura da página

  const onTipo = (type: string) => { setSel({ type, brand: "", model: "", year: "" }); setResultado(null); setListas({}); setFiltro(""); void carregarMarcas(type); };
  const onMarca = (brand: string) => {
    const s = { ...sel, brand, model: "", year: "" };
    setSel(s); setResultado(null); setFiltro(""); setListas(l => ({ brands: l.brands }));
    if (brand) void etapa(() => fipeGet<Opcao[]>("models", { type: s.type, brand }), models => setListas(l => ({ brands: l.brands, models })));
  };
  const onModelo = (model: string) => {
    const s = { ...sel, model, year: "" };
    setSel(s); setResultado(null); setListas(l => ({ ...l, years: undefined }));
    if (model) void etapa(() => fipeGet<Opcao[]>("years", { type: s.type, brand: s.brand, model }), years => setListas(l => ({ ...l, years })));
  };
  const onAno = (year: string) => {
    const s = { ...sel, year };
    setSel(s); setResultado(null);
    if (year) void etapa(() => fipeGet<PrecoFipe>("price", s), setResultado);
  };

  const termos = filtro.toLowerCase().split(/\s+/).filter(Boolean);
  const modelos = (listas.models || []).filter(m => termos.every(t => m.name.toLowerCase().includes(t)));
  const jaSalvo = resultado && bens.some(b => b.type === sel.type && b.brand === sel.brand && b.model === sel.model && b.year === sel.year);
  const opcoes = (lista: Opcao[] | undefined, ph: string) => <>
    <option value="">{ph}</option>
    {(lista || []).map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
  </>;

  return (
    <div className="panel">
      <h2>Consultar tabela FIPE</h2>
      <div className="hint">Escolha o veículo. O valor é o da tabela FIPE do mês (fonte: parallelum.com.br).</div>
      <div className="w-add rf-form fipe-form">
        <label>Tipo<Selecao value={sel.type} onChange={e => onTipo(e.target.value)}>
          {Object.entries(FIPE_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Selecao></label>
        <label>Marca<Selecao value={sel.brand} disabled={!listas.brands} onChange={e => onMarca(e.target.value)}>{opcoes(listas.brands, "Escolha a marca")}</Selecao></label>
        <label>Modelo <Entrada placeholder="filtrar (ex.: onix 1.0)" disabled={!listas.models} value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar modelos" />
          <Selecao value={sel.model} disabled={!listas.models} onChange={e => onModelo(e.target.value)}>
            {opcoes(modelos, listas.models ? `Escolha o modelo (${modelos.length})` : "Escolha a marca antes")}
          </Selecao></label>
        <label>Ano<Selecao value={sel.year} disabled={!listas.years} onChange={e => onAno(e.target.value)}>{opcoes(listas.years, "Escolha o ano")}</Selecao></label>
      </div>
      {ocupado && <div className="status" style={{ marginTop: 8 }}>Consultando…</div>}
      {erro && <div className="err" style={{ marginTop: 8 }}>{erro}</div>}
      {resultado && (
        <div className="fipe-result">
          <div>
            <div className="name">{resultado.brand} · {String(resultado.modelYear)} · {resultado.fuel} · FIPE {resultado.codeFipe}</div>
            <div className="tk" style={{ fontSize: 16 }}>{resultado.model}</div>
            <div className="price" style={{ textAlign: "left", marginTop: 6 }}>{money(resultado.price)}</div>
            <div className="status">{resultado.month} {resultado.history.length > 1 && <>· <Variacao h={resultado.history} /></>}</div>
          </div>
          <div className="fipe-save">
            {jaSalvo ? <span className="status">Já está nos seus bens.</span> : <>
              <Entrada placeholder="Apelido (opcional, ex.: Meu carro)" maxLength={40} value={apelido} onChange={e => setApelido(e.target.value)} aria-label="Apelido" />
              <button className="primary" disabled={!podeSalvar} onClick={() => { onSalvar(sel, resultado, apelido); setApelido(""); }}>Salvar nos meus bens</button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
