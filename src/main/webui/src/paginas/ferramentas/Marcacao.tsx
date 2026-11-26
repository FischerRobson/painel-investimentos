// Marcação a mercado (Tesouro Prefixado e IPCA+): quanto se recebe vendendo hoje e se compensa mais que manter até o vencimento.
// Conta em Motor.marcacao; correção do IPCA em Motor.fatorIpcaPeriodo; cenário do Focus; taxa de mercado do Tesouro Direto.
import { useState } from "react";
import { Link } from "react-router";
import { cenarioDoTermometro, hojeISO, isoBR, useRendaFixa, useTermometro, useTesouro } from "../../lib/dados";
import { usePreferencia } from "../../lib/preferencia";
import { brl, money, signCls } from "../../lib/formato";
import { addDays, cdiDaSelic, diasCorridos, fatorIpcaPeriodo, marcacao, tesouroMaisProximo, type ModoCenario } from "../../motor";
import { Num, Texto } from "../../componentes/Campos";
import { CENARIOS_RF, TAXA_TXT } from "./Comparador";

type Cfg = {
  tipo: "Tesouro IPCA+" | "Tesouro Prefixado"; qtd: number | null; pu: number | null; taxa: number | null;
  dataCompra: string; dataVenc: string; dataAnal: string | null; taxaMerc: number | null; reinv: number | null; modo: ModoCenario;
  carteiraId?: string;
};
const EXEMPLO = { tipo: "Tesouro IPCA+", qtd: 1, pu: 1000, taxa: 6, dataCompra: "2024-01-02", dataVenc: "2035-05-15", dataAnal: null, taxaMerc: null, reinv: 100 } as const;

export function Marcacao() {
  const termo = useTermometro();
  const rf = useRendaFixa();
  const tesouro = useTesouro().data;
  const [mkCfg, setMkCfg] = usePreferencia<Cfg>("marcacao", { ...EXEMPLO, modo: "base" });
  const [msg, setMsg] = useState("");
  const [escolhido, setEscolhido] = useState("");
  if (termo.isPending) return <div className="panel"><h2>Marcação a mercado</h2><div className="hint">Carregando as taxas do Banco Central…</div></div>;

  const t = termo.data;
  const hoje = hojeISO();
  const ipca = mkCfg.tipo === "Tesouro IPCA+";
  const qtd = mkCfg.qtd ?? 0, pu = mkCfg.pu ?? 0, taxa = mkCfg.taxa ?? 0, reinv = mkCfg.reinv ?? 0;
  const dataAnal = mkCfg.dataAnal && mkCfg.dataAnal > mkCfg.dataCompra ? mkCfg.dataAnal : hoje;
  const anosRest = Math.max(1, Math.ceil(diasCorridos(hoje, mkCfg.dataVenc) / 365));
  const cen = cenarioDoTermometro(t, anosRest, mkCfg.modo);
  const mensal = (t?.ipca || []).map(([date, value]) => ({ date, value }));
  const accrHoje = ipca ? fatorIpcaPeriodo(mensal, mkCfg.dataCompra, dataAnal, cen.ipca ?? 0) : 1;
  const accrVenc = ipca ? fatorIpcaPeriodo(mensal, mkCfg.dataCompra, mkCfg.dataVenc, cen.ipca ?? 0) : 1;
  const taxaMerc = mkCfg.taxaMerc ?? taxa;
  const calc = (tm: number) => (cen.selic == null || cen.ipca == null) ? null : marcacao({
    qtd, puCompra: pu, taxaCont: taxa, taxaMerc: tm, dataCompra: mkCfg.dataCompra,
    dataAnalise: dataAnal, dataVenc: mkCfg.dataVenc, accrHoje, accrVenc, cdiTaxa: cdiDaSelic(cen.selic), reinvestPct: reinv });
  const r = calc(taxaMerc);
  const taxaTxt = (x: number) => ipca ? `IPCA + ${brl(x)}%` : `${brl(x)}% a.a.`;
  const valido = r && qtd > 0 && pu > 0;
  const melhor = r ? (r.diferenca > 0 ? "Vender e reaplicar" : "Manter até o vencimento") : "";
  const sens = [-1, 0, 1, 2].map(d => { const tx = taxa + d; return { t: tx, x: calc(tx) }; }).filter(o => o.x);
  // Prefixados e IPCA+ da carteira ainda vigentes: o formulário é preenchido a partir do título
  const vivos = rf.titulos.filter(x => x.venc && x.venc > hoje && (x.idx === "pre" || x.idx === "ipca"));
  // Taxa de mercado de verdade: a de resgate (venda) do título do Tesouro com o vencimento mais perto
  const ref = tesouroMaisProximo(tesouro, mkCfg.tipo, mkCfg.dataVenc, "venda");
  const refTxt = ref && `${ref.tipo} ${ref.vencimento.slice(0, 4)}${ref.vencimento === mkCfg.dataVenc ? "" : " (vencimento mais próximo)"}, taxa de resgate em ${isoBR(tesouro!.data)}`;

  const campo = (n: keyof Cfg) => (v: number | null) => setMkCfg({ [n]: v } as Partial<Cfg>);
  const usarMinha = () => {
    const item = rf.titulos.find(x => String(x.id) === (escolhido || String(vivos[0]?.id)));
    if (!item || !item.venc) return;
    const tipo = item.idx === "ipca" ? "Tesouro IPCA+" : "Tesouro Prefixado";
    // Título do Tesouro na carteira: a taxa de mercado já vem do Tesouro Direto; outros (CDB, debênture) começam na contratada
    const doTesouro = /tesouro/i.test(item.tipo) ? tesouroMaisProximo(tesouro, tipo, item.venc, "venda") : null;
    // O título inteiro entra como 1 unidade de preço igual ao valor aplicado; as contas são lineares, então o resultado vale para o total
    setMkCfg({ tipo, qtd: 1, pu: item.aplicado, taxa: item.taxa,
      dataCompra: item.data, dataVenc: item.venc, dataAnal: hojeISO(), taxaMerc: doTesouro?.taxaVenda ?? null, carteiraId: item.id });
    setMsg(`${item.nome}: tratado como 1 título de ${money(item.aplicado)} comprado em ${isoBR(item.data)}. ` + (doTesouro
      ? `A taxa de mercado é a de resgate do ${doTesouro.tipo} ${doTesouro.vencimento.slice(0, 4)} em ${isoBR(tesouro!.data)} (${brl(doTesouro.taxaVenda!)}%).`
      : "A taxa de mercado começa igual à contratada; ajuste para ver o efeito da taxa de hoje."));
  };

  return (
    <div className="panel">
      <h2>Marcação a mercado</h2>
      <div className="hint">Quanto você receberia vendendo o título hoje, e se compensa mais que manter até o vencimento. A taxa de mercado é a que um título equivalente paga hoje; se ela subir, o preço do título cai.</div>
      <h3>Seu investimento</h3>
      {vivos.length
        ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: "100%" }}>
            <select style={{ flex: "1 1 260px", minWidth: 0, maxWidth: "100%" }} value={escolhido || String(vivos[0].id)} onChange={e => setEscolhido(e.target.value)} aria-label="Título da carteira">
              {vivos.map(x => <option key={x.id} value={x.id}>{x.nome} · {x.tipo} · {TAXA_TXT(x)} · vence {isoBR(x.venc)}</option>)}
            </select>
            <button type="button" onClick={usarMinha}>Usar este título</button>
          </div>
        : <div className="hint">Nenhum prefixado ou IPCA+ vigente na carteira. Cadastre em Carteira › Renda fixa.</div>}
      {msg && <div className="status">{msg}</div>}

      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <label>Título<select value={mkCfg.tipo} onChange={e => {
          const tipo = e.target.value as Cfg["tipo"];
          setMkCfg({ tipo, taxa: tipo === "Tesouro Prefixado" ? 12 : 6, taxaMerc: null }); // taxa-padrão de cada título
        }}>{["Tesouro IPCA+", "Tesouro Prefixado"].map(x => <option key={x}>{x}</option>)}</select></label>
        <Num rotulo="Quantidade de títulos" min="0" step="1" valor={mkCfg.qtd} onValor={campo("qtd")} />
        <Num rotulo="Preço de compra por título (R$)" min="0" step="0.01" valor={mkCfg.pu} onValor={campo("pu")} />
        <Num rotulo={ipca ? "Taxa contratada (IPCA + % a.a.)" : "Taxa contratada (% a.a.)"} step="0.01" valor={mkCfg.taxa} onValor={campo("taxa")} />
        <Texto rotulo="Data de compra" type="date" valor={mkCfg.dataCompra} onValor={v => setMkCfg({ dataCompra: v })} />
        <Texto rotulo="Vencimento" type="date" min={addDays(hoje, 1)} valor={mkCfg.dataVenc} onValor={v => setMkCfg({ dataVenc: v })} />
        <Texto rotulo="Data da análise" type="date" min={mkCfg.dataCompra} max={mkCfg.dataVenc} valor={dataAnal} onValor={v => setMkCfg({ dataAnal: v })} />
        <Num rotulo={"Taxa de mercado hoje" + (ipca ? " (IPCA + % a.a.)" : " (% a.a.)")} step="0.01" valor={taxaMerc} onValor={campo("taxaMerc")} />
        <Num rotulo="Reaplicar a % do CDI" min="0" step="1" valor={mkCfg.reinv} onValor={campo("reinv")} />
        <label>Cenário (Focus)<select value={mkCfg.modo} onChange={e => setMkCfg({ modo: e.target.value as ModoCenario })}>
          {Object.entries(CENARIOS_RF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
        <div className="quick">
          <button type="button" onClick={() => setMkCfg({ ...EXEMPLO })}>Carregar exemplo</button>
          <button type="button" title="Volta a taxa de mercado para a taxa contratada" onClick={() => setMkCfg({ taxaMerc: null })}>Taxa de mercado = contratada</button>
          {ref && <button type="button" title={refTxt!} onClick={() => setMkCfg({ taxaMerc: ref.taxaVenda })}>Taxa do Tesouro hoje ({brl(ref.taxaVenda!)}%)</button>}
        </div>
        {ref && <div className="hint">Referência: {refTxt}{tesouro?.stale ? ` · fonte fora do ar, dados salvos em ${tesouro.stale}` : ""}.</div>}
      </form>

      {valido ? <>
        <div className="tiles" style={{ marginTop: 14 }}>
          <div className="tile"><div className="k">Valor na curva (teórico)</div><div className="v">{money(r.valorTeorico)}</div><div className="s">PU {money(r.puTeorico)} à taxa contratada</div></div>
          <div className="tile"><div className="k">Valor de mercado (bruto)</div><div className="v">{money(r.valorMercado)}</div><div className="s">PU {money(r.puMercado)} com taxa de {taxaTxt(taxaMerc)}</div></div>
          <div className="tile"><div className="k">Lucro ou prejuízo bruto</div><div className={"v " + (r.lucroBruto >= 0 ? "up" : "down")}>{r.lucroBruto >= 0 ? "+" : ""}{money(r.lucroBruto)}</div><div className="s">em relação ao que você pagou ({money(qtd * pu)})</div></div>
          <div className="tile"><div className="k">Líquido se vender hoje</div><div className="v">{money(r.liqVenda)}</div><div className="s">IR estimado {money(r.irVenda)} · sem custódia</div></div>
          <div className="tile"><div className="k">Ganho já antecipado</div>
            <div className={"v " + (r.ganhoAntecipado != null && r.ganhoAntecipado >= 0.8 ? "up" : "")}>{r.ganhoAntecipado != null ? brl(Math.max(0, r.ganhoAntecipado) * 100, 0) + "%" : "—"}</div>
            <div className="s">{r.ganhoAntecipado != null && r.ganhoAntecipado >= 0.8 ? "do ganho até o vencimento: pela regra do AUVP (80% a 90%), já vale considerar vender" : "do ganho até o vencimento que a venda de hoje entrega (AUVP: venda a partir de 80% a 90%)"}</div></div>
        </div>

        <h3>Vender agora ou manter até o vencimento</h3>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th>Caminho</th><th>Líquido no vencimento ({isoBR(mkCfg.dataVenc)})</th></tr></thead>
          <tbody>
            <tr className={r.diferenca > 0 ? "on-row" : ""}><td><b>A.</b> Vender hoje e reaplicar a {brl(reinv)}% do CDI</td><td>{money(r.vendaReaplicada)}</td></tr>
            <tr className={r.diferenca <= 0 ? "on-row" : ""}><td><b>B.</b> Manter o título até o vencimento</td><td>{money(r.liqVenc)}</td></tr>
          </tbody>
        </table></div>
        <div className="hint" style={{ marginTop: 8 }}><b>{melhor}</b> rende {money(Math.abs(r.diferenca))} a mais neste cenário. Isso depende de a reaplicação render {brl(r.taxaReinv)}% a.a. e de {ipca ? "a inflação" : "os juros"} seguir o cenário escolhido.</div>

        <h3>Se a taxa de mercado mudar</h3>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th>Taxa de mercado</th><th>Preço por título</th><th>Vender e reaplicar</th><th>Manter</th><th>Diferença</th></tr></thead>
          <tbody>{sens.map(({ t: tx, x }) => x && (
            <tr key={tx} className={Math.abs(tx - taxaMerc) < 1e-9 ? "on-row" : ""}>
              <td>{taxaTxt(tx)}{tx === taxa && <> <span className="muted">contratada</span></>}</td>
              <td>{money(x.puMercado)} <span className="muted">{x.puMercado > x.puTeorico ? "sobe" : x.puMercado < x.puTeorico ? "cai" : "igual"}</span></td>
              <td>{money(x.vendaReaplicada)}</td><td>{money(x.liqVenc)}</td>
              <td className={signCls(x.diferenca)}>{x.diferenca >= 0 ? "+" : "−"}{money(Math.abs(x.diferenca))}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </> : <div className="hint" style={{ marginTop: 10 }}>{!qtd || !pu ? "Informe quantidade e preço de compra." : "Confira as datas: a análise tem que ficar entre a compra e o vencimento."}</div>}

      <div className="status">Estimativa: o preço é calculado aqui, não é o PU do Tesouro Direto (a taxa do Tesouro, quando usada, é a do último dia publicado, com alguns dias de atraso). {cen.semFocus ? "Sem as expectativas do Focus agora: cenário com o último dado realizado. " : ""}Não considera os cupons semestrais do IPCA+ (NTN-B) nem os do prefixado com juros (NTN-F); a custódia da B3 fica de fora; o IR segue a tabela regressiva pelo tempo de cada operação; na reaplicação, o CDI é a Selic meta menos 0,10 ponto; a correção do IPCA é mensal. Conheça o conceito em <Link to="/glossario#marcacao-a-mercado">marcação a mercado</Link>.</div>
    </div>
  );
}
