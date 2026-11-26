// Renda fixa no formulário de Operações: aplicação (cada aplicação é um título novo) e resgate de um título da carteira,
// escolhido na lista (total ou parcial). Os dois viram operações (motor/operacoes.ts: titulosDaCarteira).
import { useState } from "react";
import { hojeISO, isoBR } from "../../lib/dados";
import { money } from "../../lib/formato";
import { novoIdOp } from "../../lib/operacoes";
import { rfCalc, type Indexador, type Operacao, type TaxasBCB, type TituloRF } from "../../motor";
import { Entrada, Selecao } from "../../componentes/Campos";

const RF_TIPOS = ["CDB", "LCI", "LCA", "CRI", "CRA", "Tesouro Selic", "Tesouro Prefixado", "Tesouro IPCA+", "Debênture", "Poupança/Outro"];
const RF_ISENTOS = ["LCI", "LCA", "CRI", "CRA"];

export type CamposRF = { nome: string; tipo: string; idx: Indexador; taxa: string; aplicado: string; data: string; venc: string; isento: boolean; instituicao: string; liquidez: boolean };
const VAZIO: CamposRF = { nome: "", tipo: RF_TIPOS[0], idx: "cdi", taxa: "", aplicado: "", data: "", venc: "", isento: false, instituicao: "", liquidez: false };

// Campos de uma aplicação já lançada (para lançar de novo, corrigida, depois do estorno)
export const deAplicacao = (o: Operacao): Partial<CamposRF> => o.titulo ? {
  nome: o.titulo.nome, tipo: o.titulo.tipo, idx: o.titulo.idx, taxa: String(o.titulo.taxa), aplicado: String(o.qtd ?? ""), data: o.data,
  venc: o.titulo.venc ?? "", isento: !!o.titulo.isento, instituicao: o.titulo.instituicao ?? "", liquidez: !!o.titulo.liquidezDiaria,
} : {};

export function FormAplicacao({ inicial, onSalvar, botoes }: { inicial?: Partial<CamposRF>; onSalvar: (o: Operacao) => void; botoes?: React.ReactNode }) {
  const [f, setF] = useState<CamposRF>(() => ({ ...VAZIO, data: hojeISO(), ...inicial }));
  const muda = (p: Partial<CamposRF>) => setF(x => ({ ...x, ...p }));

  // O tipo sugere a isenção e o indexador (Tesouro Selic = 100% do CDI)
  const mudaTipo = (tipo: string) => {
    const p: Partial<CamposRF> = { tipo, isento: RF_ISENTOS.includes(tipo), liquidez: tipo === "Tesouro Selic" };
    if (tipo === "Tesouro Selic") { p.idx = "cdi"; p.taxa = "100"; }
    if (tipo === "Tesouro Prefixado") p.idx = "pre";
    if (tipo === "Tesouro IPCA+") p.idx = "ipca";
    muda(p);
  };
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const aplicado = Number(f.aplicado);
    if (!(aplicado > 0)) return;
    onSalvar({
      id: novoIdOp(), data: f.data, tipo: "aplicacao", classe: "rf", ativo: novoIdOp(), qtd: aplicado, valor: aplicado, valorPresente: 0,
      titulo: {
        nome: f.nome.trim(), tipo: f.tipo, idx: f.idx, taxa: Number(f.taxa), venc: f.venc || null, isento: f.isento,
        instituicao: f.instituicao.trim() || null, liquidezDiaria: f.liquidez,
      },
    });
    setF({ ...VAZIO, data: f.data });
  };

  return <>
    <form className="w-add rf-form" onSubmit={salvar} aria-label="Aplicação em renda fixa">
      <label>Nome<Entrada name="nome" placeholder="Ex.: CDB Banco Inter" required value={f.nome} onChange={e => muda({ nome: e.target.value })} /></label>
      <label>Tipo do título<Selecao name="tipo" value={f.tipo} onChange={e => mudaTipo(e.target.value)}>{RF_TIPOS.map(t => <option key={t}>{t}</option>)}</Selecao></label>
      <label>Rentabilidade<span className="pair">
        <Selecao name="idx" value={f.idx} onChange={e => muda({ idx: e.target.value as Indexador })} aria-label="Indexador">
          <option value="cdi">% do CDI</option><option value="pre">Prefixado % a.a.</option><option value="ipca">IPCA + % a.a.</option>
        </Selecao>
        <Entrada name="taxa" type="number" step="any" min="0" placeholder="Ex.: 110" required value={f.taxa} onChange={e => muda({ taxa: e.target.value })} aria-label="Taxa" />
      </span></label>
      <label>Valor aplicado (R$) — quanto saiu da sua conta<Entrada name="aplicado" type="number" step="0.01" min="0.01" required value={f.aplicado} onChange={e => muda({ aplicado: e.target.value })} /></label>
      <label>Data da aplicação<Entrada name="data" type="date" max={hojeISO()} required value={f.data} onChange={e => muda({ data: e.target.value })} /></label>
      <label>Vencimento<Entrada name="venc" type="date" value={f.venc} onChange={e => muda({ venc: e.target.value })} /></label>
      <label>Banco ou corretora (para o limite do FGC)<Entrada name="instituicao" placeholder="Ex.: Banco Inter" value={f.instituicao} onChange={e => muda({ instituicao: e.target.value })} /></label>
      <label className="chk"><Entrada name="isento" type="checkbox" checked={f.isento} onChange={e => muda({ isento: e.target.checked })} /> Isento de IR</label>
      <label className="chk"><Entrada name="liquidez" type="checkbox" checked={f.liquidez} onChange={e => muda({ liquidez: e.target.checked })} /> Liquidez diária (conta na reserva de emergência)</label>
      <span className="pair"><button className="primary" type="submit">Aplicar</button>{botoes}</span>
    </form>
    <div className="status" style={{ marginTop: 6 }}>Cada aplicação é um título novo. Valor estimado "na curva" com o CDI e o IPCA do Banco Central, descontando o IR (tabela regressiva). Não considera IOF (só vale para menos de 30 dias) nem a marcação a mercado do Tesouro.</div>
  </>;
}

// Resgate de um título da carteira. O valor presente (o título líquido na curva, no dia) vem calculado e pode ser trocado
// pelo do extrato; no parcial, sai do principal a mesma fração que o valor recebido é do valor presente.
export function FormResgate({ titulos, rates, inicial, onSalvar, botoes }: {
  titulos: TituloRF[]; rates: TaxasBCB | null; inicial?: { ativo?: string; data?: string };
  onSalvar: (o: Operacao) => void; botoes?: React.ReactNode;
}) {
  const [id, setId] = useState(() => titulos.some(t => t.id === inicial?.ativo) ? inicial!.ativo! : titulos[0]?.id ?? "");
  const [data, setData] = useState(inicial?.data ?? hojeISO());
  const [total, setTotal] = useState(true);
  const [presente, setPresente] = useState(""), [valor, setValor] = useState("");
  const titulo = titulos.find(t => t.id === id) ?? titulos[0]; // o escolhido pode ter saído (resgate total)
  if (!titulo) return <div className="hint">Nenhum título de renda fixa na carteira para resgatar.</div>;

  const estimado = rates && data >= titulo.data ? +rfCalc(titulo, rates, data).liquido.toFixed(2) : null;
  const vp = presente !== "" ? Number(presente) : estimado ?? 0;
  const recebido = valor !== "" ? Number(valor) : total ? vp : 0;
  const trocaTitulo = (novo: string) => { setId(novo); setPresente(""); setValor(""); };

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(recebido > 0) || data < titulo.data) return;
    const fracao = total || !(vp > 0) ? 1 : Math.min(1, recebido / vp);
    const qtd = fracao >= 0.999 ? titulo.aplicado : Math.round(titulo.aplicado * fracao * 100) / 100;
    onSalvar({ id: novoIdOp(), data, tipo: "resgate", classe: "rf", ativo: titulo.id, qtd, valor: recebido, valorPresente: vp });
  };

  return <>
    <form className="w-add rf-form" onSubmit={salvar} aria-label="Resgate de renda fixa">
      <label style={{ gridColumn: "1 / -1" }}>Título<Selecao name="titulo" value={titulo.id} onChange={e => trocaTitulo(e.target.value)}>
        {titulos.map(t => <option key={t.id} value={t.id}>{t.nome} — aplicado {money(t.aplicado)} em {isoBR(t.data)}</option>)}</Selecao></label>
      <label>Data do resgate<Entrada name="data" type="date" min={titulo.data} max={hojeISO()} required value={data} onChange={e => setData(e.target.value)} /></label>
      <label className="chk"><Entrada name="total" type="checkbox" checked={total} onChange={e => setTotal(e.target.checked)} /> Resgate total (o título sai da carteira)</label>
      <label>Valor presente (R$) — o título líquido no dia, antes do resgate
        <Entrada name="valorPresente" type="number" step="0.01" min="0" required placeholder="do extrato"
          value={presente !== "" ? presente : estimado != null ? String(estimado) : ""} onChange={e => setPresente(e.target.value)} /></label>
      <label>Valor recebido (R$) — o que entrou na conta
        <Entrada name="valor" type="number" step="0.01" min="0.01" required={!total} placeholder={total && vp ? String(vp) : ""}
          value={valor} onChange={e => setValor(e.target.value)} /></label>
      <span className="pair"><button className="primary" type="submit">Resgatar</button>{botoes}</span>
    </form>
    <div className="status" style={{ marginTop: 6 }}>O valor presente vem da curva (CDI e IPCA do Banco Central); se o extrato mostrar outro, use o do extrato.</div>
  </>;
}
