// Planejador de metas: aporte mensal para chegar na meta (Motor.aporteMensal), comparado com o orçamento dos últimos 12 meses.
import { useQuery } from "@tanstack/react-query";
import { fmtPrazo, mesAno, useRendaFixa } from "../../lib/dados";
import { usePreferencia } from "../../lib/preferencia";
import { apiFetch } from "../../lib/api";
import { brl, money } from "../../lib/formato";
import { aporteMensal } from "../../motor";
import { Num, Texto } from "../../componentes/Campos";
import { EsqueletoPainel } from "../../componentes/Esqueleto";

type MesResumo = { income: number; expenses: number; areas?: Record<string, number> };
type Orcamento = { meses: MesResumo[]; settings: { referenceIncome?: number | null } };
type Cfg = { nome?: string | null; alvo?: number | null; atual?: number | null; meses?: number | null; taxa?: number | null };

// AUVP, Módulo 2: "Metas (15%)" é a fatia da renda para objetivos específicos, separada da liberdade financeira (25%, aporte de longo prazo)
const FATIA_METAS = 0.15;
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

async function carregarOrcamento(): Promise<Orcamento> {
  const [sum, set] = await Promise.all([apiFetch(`/api/budget/summary?to=${mesAtual()}&months=12`), apiFetch("/api/budget/settings")]);
  if (!sum.ok || !set.ok) throw new Error("Não foi possível ler o orçamento agora.");
  return { meses: await sum.json(), settings: await set.json() };
}

// Médias mensais dos meses com movimento: renda (meses com entrada), despesas, sobra e aporte em liberdade financeira.
function medias(meses: MesResumo[], settings: Orcamento["settings"]) {
  const ativos = meses.filter(m => m.income > 0 || m.expenses > 0 || (m.areas?.financialFreedom ?? 0) > 0);
  const media = (lista: MesResumo[], f: (m: MesResumo) => number) => lista.length ? lista.reduce((a, m) => a + f(m), 0) / lista.length : null;
  const renda = media(meses.filter(m => m.income > 0), m => m.income) ?? settings?.referenceIncome ?? null;
  const despesas = media(ativos, m => m.expenses);
  const aporteHist = media(ativos, m => m.areas?.financialFreedom ?? 0);
  return { renda, despesas, aporteHist, meses: ativos.length, sobra: renda != null && despesas != null ? renda - despesas : null };
}

export function Planejador() {
  const orc = useQuery({ queryKey: ["planejador-orcamento"], queryFn: carregarOrcamento, retry: false });
  const { atuais: cur } = useRendaFixa();
  const [planCfg, setPlanCfg] = usePreferencia<Cfg>("planejador", {});
  // "Atualizar orçamento" volta para o carregando
  if (orc.isPending || orc.isFetching) return <EsqueletoPainel campos={4} tiles={3} grafico texto="Carregando o seu orçamento…" />;
  if (orc.isError) return <div className="panel err">{orc.error.message || "Falha ao ler o orçamento."}</div>;

  const def = { nome: "Minha meta", alvo: 100000, atual: 0, meses: 60, taxa: cur ? +cur.cdi.toFixed(2) : 12 };
  const cfg = { ...def };
  for (const k of Object.keys(def) as (keyof typeof def)[]) if (planCfg[k] != null) (cfg as Record<string, unknown>)[k] = planCfg[k];
  const med = medias(orc.data.meses, orc.data.settings);
  const hist = med.aporteHist ?? 0;
  const aporte = cfg.alvo > 0 ? aporteMensal({ alvo: cfg.alvo, atual: cfg.atual, meses: cfg.meses, taxaAa: cfg.taxa }) : null;
  const pctRenda = med.renda && aporte != null ? aporte / med.renda * 100 : null;
  const metas = med.renda != null ? med.renda * FATIA_METAS : null;

  let veredito = "Informe a meta e o prazo para ver o aporte necessário.", classe = "muted";
  if (aporte === 0) { veredito = "O patrimônio que você já tem para essa meta basta. Não precisa aportar."; classe = "up"; }
  else if (aporte != null && metas != null && aporte <= metas) { veredito = `Cabe na fatia de Metas: o AUVP sugere separar 15% da renda (${money(metas)}/mês) para objetivos como este.`; classe = "up"; }
  else if (aporte != null && med.sobra != null && aporte <= med.sobra) {
    veredito = `Passa dos 15% de Metas (${money(metas)}/mês), mas cabe na sobra do orçamento (${money(med.sobra)}/mês): a diferença de ${money(aporte - (metas ?? 0))}/mês sairia de outras áreas.`;
    classe = "muted";
  }
  else if (aporte != null && med.sobra != null) { veredito = `Não cabe no orçamento atual. Mesmo usando toda a sobra (${money(med.sobra)}/mês), faltam ${money(aporte - med.sobra)}/mês.`; classe = "down"; }
  else if (aporte != null) { veredito = "Não há renda e despesas registradas no orçamento para comparar."; }

  const prazos = [6, 12, 24, 36, 60, 120].map(p => ({ p, a: aporteMensal({ alvo: cfg.alvo, atual: cfg.atual, meses: p, taxaAa: cfg.taxa }) }));
  const movimento = med.meses
    ? `Médias dos últimos 12 meses com movimento (${med.meses} ${med.meses > 1 ? "meses" : "mês"}): renda ${money(med.renda)}, despesas ${money(med.despesas)}, sobra ${money(med.sobra)}, aporte em liberdade financeira ${money(hist)}.`
    : "Ainda não há lançamentos no orçamento dos últimos 12 meses. Lance renda e despesas no Orçamento para a comparação.";
  const campo = (n: keyof Cfg) => (v: number | null) => setPlanCfg({ [n]: v });

  return (
    <div className="panel">
      <h2>Planejador de metas</h2>
      <div className="hint">Quanto aportar todo mês para chegar na sua meta, e se isso cabe no seu orçamento. As contas são brutas: sem IR e com rentabilidade constante.
        {" "}Pelo AUVP, o dinheiro de metas (viagem, compra planejada) é separado do aporte de longo prazo e fica no Tesouro Selic, que permite resgatar sem perdas.</div>
      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <Texto rotulo="Nome da meta" maxLength={60} valor={cfg.nome} onValor={v => setPlanCfg({ nome: v })} />
        <Num rotulo="Valor da meta (R$)" min="0" step="1000" valor={cfg.alvo} onValor={campo("alvo")} />
        <Num rotulo="Já guardado para ela (R$)" min="0" step="100" valor={cfg.atual} onValor={campo("atual")} />
        <Num rotulo="Prazo (meses)" min="1" max="600" step="1" valor={cfg.meses} onValor={campo("meses")} />
        <Num rotulo="Rentabilidade (% a.a.)" min="0" step="0.1" valor={cfg.taxa} onValor={campo("taxa")} />
        <div className="quick">
          <button type="button" title="Volta a rentabilidade para o CDI atual" onClick={() => setPlanCfg({ taxa: null })}>Usar CDI atual</button>
          <button type="button" title="Lê o orçamento de novo" onClick={() => void orc.refetch()}>Atualizar orçamento</button>
        </div>
      </form>
      <div className={"status " + classe} style={{ margin: "12px 0" }}>{veredito}</div>
      <div className="tiles">
        <div className="tile"><div className="k">Aporte mensal necessário</div><div className="v">{aporte != null ? money(aporte) : "—"}</div><div className="s">{pctRenda != null ? brl(pctRenda, 1) + "% da renda média" : "—"}</div></div>
        <div className="tile"><div className="k">Fatia de Metas (15% da renda)</div><div className="v">{metas != null ? money(metas) : "—"}</div><div className="s">sugestão do AUVP para objetivos de curto e médio prazo</div></div>
        <div className="tile"><div className="k">Sobra do orçamento</div><div className="v">{med.sobra != null ? money(med.sobra) : "—"}</div><div className="s">renda média menos despesas médias</div></div>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}><table className="w-table">
        <thead><tr><th>Prazo</th><th>Quando</th><th>Aporte mensal</th><th>% da renda</th></tr></thead>
        <tbody>{prazos.map(({ p, a }) => (
          <tr key={p}><td>{fmtPrazo(p)}</td><td>{mesAno(p)}</td><td><b>{money(a)}</b></td><td>{a != null && med.renda ? brl(a / med.renda * 100, 1) + "%" : "—"}</td></tr>
        ))}</tbody>
      </table></div>
      <div className="status">{movimento}</div>
    </div>
  );
}
