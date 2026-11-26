// Comparador de renda fixa: mesmo valor e prazo, produtos diferentes (% do CDI, prefixado, IPCA+), com cenários do Focus.
// Conta em Motor.comparaRF. Um título da carteira pode entrar na comparação com o valor de hoje (Motor.valorAtualRF).
import { useState } from "react";
import { cenarioDoTermometro, hojeISO, isoBR, useRendaFixa, useTermometro } from "../../lib/dados";
import { usePreferencia } from "../../lib/preferencia";
import { brl, money } from "../../lib/formato";
import { cdiDaSelic, comparaRF, FGC, LIQUIDEZ_TXT, liquidezRF, ordenarRF, RISCO_TXT, riscoRF, valorAtualRF, type ModoCenario, type OrdemRF } from "../../motor";
import { CampoNum, CampoTexto, Num, Entrada, Selecao } from "../../componentes/Campos";
import { EsqueletoPainel } from "../../componentes/Esqueleto";

// Tipos e a forma como cada um rende: cdi = % do CDI (CDI = Selic meta − 0,10 p.p.), pre = % a.a., ipca = IPCA + % a.a.
export const TIPOS_RF: Record<string, { idx: "cdi" | "pre" | "ipca"; padrao: number; isento: boolean; selic?: boolean }> = {
  "CDB": { idx: "cdi", padrao: 110, isento: false },
  "LCI": { idx: "cdi", padrao: 90, isento: true },
  "LCA": { idx: "cdi", padrao: 90, isento: true },
  "Tesouro Selic": { idx: "cdi", padrao: 100, isento: false, selic: true }, // rende a Selic cheia, não o CDI
  "Tesouro Prefixado": { idx: "pre", padrao: 12, isento: false },
  "Tesouro IPCA+": { idx: "ipca", padrao: 6, isento: false },
  "Prefixado (outro)": { idx: "pre", padrao: 13, isento: false },
  "IPCA+ (outro)": { idx: "ipca", padrao: 7, isento: false },
};
export const CENARIOS_RF: Record<ModoCenario, string> = {
  base: "Focus: medianas",
  "juros-caem": "Focus: juros caem (Selic no mínimo)",
  "juros-sobem": "Focus: juros sobem (Selic no máximo)",
  "inflacao-sobe": "Focus: inflação sobe (IPCA no máximo)",
};
export const TAXA_TXT = (p: { idx: string; taxa: number }) => p.idx === "cdi" ? `${brl(p.taxa)}% do CDI` : p.idx === "pre" ? `${brl(p.taxa)}% a.a.` : `IPCA + ${brl(p.taxa)}%`;

type Produto = { id: number; nome: string; tipo: string; taxa: number | null; anosVenc: number | null; minha?: boolean; carteiraId?: string; isento?: boolean; irBase?: number; irDias?: number; liquidezDiaria?: boolean };
type Cfg = { valor: number | null; anos: number | null; modo: ModoCenario; ordem: OrdemRF; produtos: Produto[] };
let seq = 1;
const novoId = () => Date.now() + seq++;

const produtosExemplo = (): Produto[] => [
  { id: novoId(), nome: "", tipo: "Tesouro Prefixado", taxa: 12, anosVenc: 5 },
  { id: novoId(), nome: "", tipo: "Tesouro IPCA+", taxa: 6, anosVenc: 5 },
  { id: novoId(), nome: "", tipo: "CDB", taxa: 110, anosVenc: 5, liquidezDiaria: true },
  { id: novoId(), nome: "", tipo: "Tesouro Selic", taxa: 100, anosVenc: 5 },
];

export function Comparador() {
  const termo = useTermometro();
  const rf = useRendaFixa();
  // Na primeira vez, já abre com os produtos de exemplo (no modo demonstração também)
  const [cmpCfg, setCmpCfg] = usePreferencia<Cfg>("comparador", { valor: 10000, anos: 5, modo: "base", ordem: "liquido", produtos: produtosExemplo() });
  const [msg, setMsg] = useState("");
  const [escolhido, setEscolhido] = useState<string>("");
  if (termo.isPending) return <EsqueletoPainel campos={4} tiles={3} linhas={4} texto="Carregando as expectativas do Banco Central…" />;

  const t = termo.data;
  const valor = cmpCfg.valor ?? 0, anos = cmpCfg.anos ?? 0;
  const cen = cenarioDoTermometro(t, anos, cmpCfg.modo);
  const hoje = hojeISO();
  const vivos = rf.titulos.filter(x => x.venc && x.venc > hoje);

  const produtos = cmpCfg.produtos.map(p => {
    const tp = TIPOS_RF[p.tipo] || TIPOS_RF["CDB"];
    return { id: p.id, nome: p.nome || p.tipo, tipo: p.tipo, idx: tp.idx, taxa: Number(p.taxa) || 0, isento: p.isento ?? tp.isento, anosVenc: Number(p.anosVenc) || 0,
      minha: !!p.minha, irBase: p.irBase, irDias: p.irDias, carteiraId: p.carteiraId, selic: !!tp.selic, liquidezDiaria: !!p.liquidezDiaria };
  }).filter(p => p.anosVenc > 0 && p.taxa >= 0);
  const valido = valor > 0 && anos > 0 && cen.selic != null && cen.ipca != null;
  const res = valido && produtos.length ? comparaRF({ valor, anos, selic: cen.selic!, ipca: cen.ipca!, produtos }) : [];
  const ok = res.filter(r => r.status !== "depois");
  const ordenados = ordenarRF(ok, cmpCfg.ordem ?? "liquido", valor);
  const depois = res.filter(r => r.status === "depois");
  const melhor = ordenados[0];
  const anosTxt = (a: number) => brl(a, Number.isInteger(a) ? 0 : 2);

  const mudarProduto = (id: number, m: Partial<Produto>) => setCmpCfg(c => ({ ...c, produtos: c.produtos.map(p => p.id === id ? { ...p, ...m } : p) }));
  const compararMinha = () => {
    const item = rf.titulos.find(x => String(x.id) === (escolhido || String(vivos[0]?.id)));
    if (!item || !item.venc) return;
    const cdiSerie = (t?.cdi || []).map(([date, value]) => [date, value] as [string, number]);
    const ipcaMensal = (t?.ipca || []).map(([date, value]) => ({ date, value }));
    const anosRest = (new Date(item.venc + "T12:00:00").getTime() - new Date(hoje + "T12:00:00").getTime()) / 86400000 / 365;
    const irDias = Math.round((new Date(item.venc + "T12:00:00").getTime() - new Date(item.data + "T12:00:00").getTime()) / 86400000);
    const v = valorAtualRF({ aplicado: item.aplicado, idx: item.idx, taxa: item.taxa, data: item.data, hoje, cdiSerie, ipcaMensal, ipcaProj: cen.ipca ?? 0 });
    if (v.valor == null) { setMsg("Sem a série do CDI agora para estimar o valor de hoje. Tente de novo mais tarde."); return; }
    // tipo de comparação: o primeiro tipo com o mesmo indexador (e isenção), ou o próprio tipo do título se ele existir
    const mesmos = Object.keys(TIPOS_RF).filter(k => TIPOS_RF[k].idx === item.idx);
    const tipo = mesmos.includes(item.tipo) ? item.tipo : mesmos[0];
    const prod: Produto = { id: novoId(), nome: item.nome, tipo, taxa: item.taxa, anosVenc: Math.round(anosRest * 100) / 100,
      minha: true, carteiraId: item.id, isento: !!item.isento, irBase: item.aplicado, irDias };
    const valorHoje = Math.round(v.valor * 100) / 100;
    // Um investimento da carteira por vez: a escolha nova substitui a anterior (cada prazo tem a sua comparação)
    setCmpCfg(c => ({ ...c, produtos: c.produtos.filter(x => !x.minha).concat(prod), valor: valorHoje, anos: prod.anosVenc }));
    setMsg(`${item.nome}: valor bruto de hoje estimado em ${money(valorHoje)} (aplicado ${money(item.aplicado)} em ${isoBR(item.data)}). O prazo passou a ser os ${brl(prod.anosVenc!, 2)} anos que faltam.` +
      (v.cobertura ? "" : " A série do CDI começa depois da aplicação: o valor de hoje pode estar subestimado.") +
      " Escolher outro título substitui este na comparação.");
  };
  const exemplo = () => setCmpCfg({ produtos: produtosExemplo() });

  return (
    <div className="panel">
      <h2>Comparador de renda fixa</h2>
      <div className="hint">Mesmo valor, mesmo prazo, produtos diferentes. Cada um rende de um jeito: % do CDI, prefixado ou IPCA+. Cadastre os produtos com a taxa da oferta que você tem em mãos.</div>
      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <Num rotulo="Valor investido (R$)" min="0" step="100" valor={cmpCfg.valor} onValor={v => setCmpCfg({ valor: v })} />
        <Num rotulo="Prazo (anos)" min="0.1" max="40" step="any" valor={cmpCfg.anos} onValor={v => setCmpCfg({ anos: v })} />
        <label>Cenário de juros e inflação<Selecao value={cmpCfg.modo} onChange={e => setCmpCfg({ modo: e.target.value as ModoCenario })}>
          {Object.entries(CENARIOS_RF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Selecao></label>
        <label>Ordenar por<Selecao value={cmpCfg.ordem ?? "liquido"} onChange={e => setCmpCfg({ ordem: e.target.value as OrdemRF })}>
          <option value="liquido">Maior patrimônio líquido</option><option value="real">Maior rentabilidade real</option>
          <option value="liquidez">Mais liquidez</option><option value="risco">Menor risco de crédito</option>
        </Selecao></label>
      </form>

      <h3>Seu investimento</h3>
      <div className="hint">Escolha um título da sua carteira. O valor de hoje é estimado pela série do CDI e pelo IPCA desde a aplicação; o prazo passa a ser o que falta, e o IR é calculado pelo prazo total.</div>
      {vivos.length
        ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: "100%" }}>
            <Selecao style={{ flex: "1 1 260px", minWidth: 0, maxWidth: "100%" }} value={escolhido || String(vivos[0].id)} onChange={e => setEscolhido(e.target.value)} aria-label="Título da carteira">
              {vivos.map(x => <option key={x.id} value={x.id}>{x.nome} · {x.tipo} · {TAXA_TXT(x)} · vence {isoBR(x.venc)}</option>)}
            </Selecao>
            <button type="button" onClick={compararMinha}>Comparar este investimento</button>
          </div>
        : <div className="hint">Nenhum título vigente na carteira. Cadastre em Carteira › Renda fixa.</div>}
      {msg && <div className="status">{msg}</div>}

      <h3>Produtos</h3>
      <div className="table-wrap"><table className="w-table cards-m">
        <thead><tr><th>Produto</th><th>Tipo</th><th>Taxa</th><th>Vencimento (anos)</th><th>Liquidez diária</th><th></th></tr></thead>
        <tbody>{cmpCfg.produtos.map(p => {
          const tp = TIPOS_RF[p.tipo] || TIPOS_RF["CDB"];
          return (
            <tr key={p.id}>
              <td data-label="Produto"><CampoTexto valor={p.nome} placeholder={p.tipo} style={{ width: 150 }} aria-label="Nome do produto" onValor={v => mudarProduto(p.id, { nome: v })} /></td>
              <td data-label="Tipo"><Selecao value={p.tipo} aria-label="Tipo" onChange={e => mudarProduto(p.id, { tipo: e.target.value, taxa: TIPOS_RF[e.target.value].padrao })}>
                {Object.keys(TIPOS_RF).map(k => <option key={k}>{k}</option>)}
              </Selecao></td>
              <td data-label="Taxa"><CampoNum step="0.01" min="0" style={{ width: 90 }} aria-label="Taxa" valor={p.taxa ?? tp.padrao} onValor={v => mudarProduto(p.id, { taxa: v })} />{" "}
                <span className="muted">{tp.idx === "cdi" ? "% CDI" : tp.idx === "pre" ? "% a.a." : "IPCA +"}</span></td>
              <td data-label="Vencimento (anos)"><CampoNum step="0.5" min="0.5" max="40" style={{ width: 80 }} aria-label="Vencimento (anos)" valor={p.anosVenc ?? cmpCfg.anos} onValor={v => mudarProduto(p.id, { anosVenc: v })} /></td>
              <td data-label="Liquidez diária">{FGC(p.tipo)
                ? <Entrada type="checkbox" checked={!!p.liquidezDiaria} aria-label="Liquidez diária" onChange={e => mudarProduto(p.id, { liquidezDiaria: e.target.checked })} />
                : <span className="muted">{LIQUIDEZ_TXT[liquidezRF(p)]}</span>}</td>
              <td className="acao"><button type="button" onClick={() => setCmpCfg(c => ({ ...c, produtos: c.produtos.filter(x => x.id !== p.id) }))}>remover</button></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="quick" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => setCmpCfg(c => ({ ...c, produtos: [...c.produtos, { id: novoId(), nome: "", tipo: "CDB", taxa: TIPOS_RF.CDB.padrao, anosVenc: c.anos }] }))}>+ Adicionar produto</button>{" "}
        <button type="button" onClick={exemplo}>Carregar exemplo</button>
      </div>

      <div className="tiles" style={{ marginTop: 14 }}>
        <div className="tile"><div className="k">Cenário: CDI médio</div><div className="v">{cen.selic != null ? brl(cdiDaSelic(cen.selic)) + "%" : "—"}</div>
          <div className="s">Selic {cen.selic != null ? brl(cen.selic) + "%" : "—"} · IPCA {cen.ipca != null ? brl(cen.ipca) + "%" : "—"} a.a.</div></div>
        <div className="tile"><div className="k">Melhor no cenário</div><div className={"v " + (melhor ? "up" : "")}>{melhor ? melhor.nome : "—"}</div>
          <div className="s">{melhor ? `líquido ${money(melhor.liquido)} · real ${money(melhor.real)}` : "adicione produtos com vencimento"}</div></div>
        <div className="tile"><div className="k">Valor investido</div><div className="v">{money(cmpCfg.valor)}</div><div className="s">{cmpCfg.anos} ano{anos > 1 ? "s" : ""} · {CENARIOS_RF[cmpCfg.modo]}</div></div>
      </div>
      {produtos.length && valido ? <>
        <h3>Resultado no vencimento</h3>
        <div className="table-wrap"><table className="w-table cards-m">
          <thead><tr><th>Produto</th><th>Taxa</th><th>Vencimento</th><th>Bruto</th><th>IR</th><th>Líquido</th><th>Real</th><th>Liquidez</th><th>Risco</th><th>Observação</th></tr></thead>
          <tbody>
            {ordenados.map(r => (
              <tr key={r.id}>
                <td className="titulo"><b>{r.nome}</b>{r.nome !== r.tipo && <> <span className="muted">{r.tipo}</span></>}{r.minha && <> <span className="tool-tag">da carteira</span></>}</td>
                <td data-label="Taxa">{TAXA_TXT(r)}</td><td data-label="Vencimento">{anosTxt(r.anosVenc)} ano{r.anosVenc > 1 ? "s" : ""}</td>
                <td data-label="Bruto">{money(r.bruto)}</td><td data-label="IR">{r.isento ? <span className="muted">isento</span> : money(r.ir)}</td>
                <td data-label="Líquido"><b>{money(r.liquido)}</b></td><td data-label="Real">{money(r.real)}</td>
                <td data-label="Liquidez">{LIQUIDEZ_TXT[liquidezRF(r)]}</td><td data-label="Risco">{RISCO_TXT[riscoRF(r, valor)]}</td>
                <td data-label="Observação" className="muted">{[r.status === "antes" ? `vence antes: reaplicado a 100% do CDI até ${anosTxt(anos)} anos` : "",
                  /^LC[IA]$/.test(r.tipo) && r.anosVenc < 0.5 ? "LCI e LCA têm carência mínima de 6 meses" : ""].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
            {depois.map(r => (
              <tr key={r.id}><td className="titulo"><b>{r.nome}</b> <span className="muted">{r.tipo}</span></td><td data-label="Taxa">{TAXA_TXT(r)}</td><td data-label="Vencimento">{r.anosVenc} anos</td>
                <td colSpan={7} className="muted">vence depois do prazo: seria preciso vender antes do vencimento (marcação a mercado, ainda não disponível aqui)</td></tr>
            ))}
          </tbody>
        </table></div>
      </> : <div className="hint" style={{ marginTop: 10 }}>{produtos.length ? "" : "Adicione produtos para comparar."}</div>}
      {valor > 250000 && produtos.some(p => FGC(p.tipo)) && (
        <div className="status down">Acima de R$ 250 mil numa mesma instituição, o FGC não cobre o excedente de CDB, LCI e LCA (o limite total é de R$ 1 milhão por CPF a cada 4 anos). Divida entre bancos. Tesouro Direto não depende do FGC.</div>
      )}
      <div className="status">{cen.semFocus ? "Sem as expectativas do Focus agora: usando o último dado realizado do Banco Central. " : ""}Estimativa: CDI = Selic − 0,10 p.p. e Tesouro Selic = Selic (regras do AUVP), taxas médias constantes no prazo, capitalização anual, IR pela tabela regressiva com o prazo total (inclusive para o que é reaplicado), sem custódia da B3 nem taxas de corretora. "Real" = líquido corrigido pelo IPCA do cenário. Liquidez: Tesouro Selic e CDB, LCI e LCA marcados com liquidez diária resgatam sem perda; os outros Tesouros, a preço de mercado. Risco: Tesouro é soberano; CDB, LCI e LCA têm o FGC até R$ 250 mil; o resto é crédito privado.</div>
    </div>
  );
}

