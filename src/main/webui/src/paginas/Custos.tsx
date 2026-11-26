// Custos da AWS (Cost Explorer, cache de 12 h no servidor) e consumo do plano da brapi.dev (cache de 10 min).
import { useQuery } from "@tanstack/react-query";
import { useTitulo } from "../lib/useTitulo";
import { brl, money } from "../lib/formato";
import { ErroApi, getJson } from "../lib/api";
import { useCambio } from "../lib/cambio";
import { configBarras } from "../lib/graficos";
import { Grafico } from "../componentes/Grafico";
import { EsqueletoPainel } from "../componentes/Esqueleto";

type Custos = {
  aviso?: string; fetchedAt: number; previsaoMes: number | null;
  meses: { mes: string; total: number; servicos?: { nome: string; valor: number }[] }[];
  diario?: { dia: string; valor: number }[];
};
type UsoBrapi = { enabled: false } | {
  enabled: true; plano?: string; limite: number; usado: number; restante: number;
  janela: "billing-cycle" | "rolling-30d" | string; inicio?: string; fim?: string; fetchedAt: number;
};

const usd = (v: number | null | undefined) => v == null ? "—" : "US$ " + brl(v, v > 0 && v < 0.01 ? 4 : 2);
const usdEixo = (v: number) => "US$ " + brl(v, v < 1 ? 2 : 0);
const hora = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const isoBR = (d?: string | null) => d ? d.split("-").reverse().join("/") : "—";
const nomeMes = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
const msg = (e: unknown, padrao: string) => e instanceof ErroApi ? e.message : padrao;

export function Custos() {
  useTitulo("Custos");
  const custos = useQuery({ queryKey: ["custos"], queryFn: () => getJson<Custos>("/api/custos") });
  const dolar = useCambio(2).data?.quotes.USD?.bid;
  const reais = (v: number | null | undefined) => dolar && v != null ? `≈ ${money(v * dolar)}` : "";

  let corpo;
  if (custos.isError) corpo = <div className="panel err">{msg(custos.error, "Não consegui carregar os custos agora.")}</div>;
  else if (!custos.data) corpo = <EsqueletoPainel tiles={3} grafico texto="Carregando os custos…" />;
  else {
    const c = custos.data, meses = c.meses || [], atual = meses[meses.length - 1], anterior = meses[meses.length - 2];
    corpo = <>
      <div className="panel">
        <h2>Custos da AWS</h2>
        <div className="hint">Total da conta AWS (que só tem este app), em dólar, antes de créditos. Atualiza a cada 12 h, porque cada consulta à API de custos da AWS custa US$ 0,01.</div>
        {c.aviso && <div className="offline" style={{ marginTop: 8 }}>{c.aviso}</div>}
        {atual && (
          <div className="tiles">
            <div className="tile"><div className="k">Este mês (até agora)</div><div className="v">{usd(atual.total)}</div><div className="s">{reais(atual.total)}</div></div>
            <div className="tile"><div className="k">Previsão para o mês</div><div className="v">{usd(c.previsaoMes)}</div>
              <div className="s">{c.previsaoMes != null ? reais(c.previsaoMes) : "a AWS ainda não tem dados suficientes"}</div></div>
            <div className="tile"><div className="k">Mês passado</div><div className="v">{anterior ? usd(anterior.total) : "—"}</div><div className="s">{anterior ? reais(anterior.total) : ""}</div></div>
          </div>
        )}
      </div>
      {meses.length > 0 && (
        <div className="panel"><h2>Últimos meses</h2><div className="proj-box">
          <Grafico deps={[c.fetchedAt]} config={() => configBarras(meses.map(m => nomeMes(m.mes)), meses.map(m => m.total), usd, usdEixo)} />
        </div></div>
      )}
      {atual?.servicos?.length
        ? <div className="panel"><h2>Por serviço neste mês</h2>
            <div className="table-wrap"><table className="w-table">
              <thead><tr><th>Serviço</th><th>Custo</th><th>Em reais</th><th>% do mês</th></tr></thead>
              <tbody>{atual.servicos.map(s => (
                <tr key={s.nome}><td>{s.nome}</td><td>{usd(s.valor)}</td><td>{reais(s.valor)}</td><td>{atual.total ? brl(s.valor / atual.total * 100, 1) + "%" : "—"}</td></tr>
              ))}</tbody>
            </table></div></div>
        : atual && <div className="panel hint">Nenhum custo registrado neste mês até agora (tudo dentro do nível gratuito).</div>}
      {c.diario?.length ? (
        <div className="panel"><h2>Dia a dia neste mês</h2><div className="proj-box">
          <Grafico deps={[c.fetchedAt]} config={() => configBarras(c.diario!.map(d => d.dia.slice(8, 10)), c.diario!.map(d => d.valor), usd, usdEixo)} />
        </div></div>
      ) : null}
      <div className="status" style={{ margin: "4px 2px 16px" }}>Dados de {hora(c.fetchedAt)}.</div>
    </>;
  }
  return <>{corpo}<PainelBrapi /></>;
}

function PainelBrapi() {
  const uso = useQuery({ queryKey: ["brapi-uso"], queryFn: () => getJson<UsoBrapi>("/api/brapi/uso") });
  if (uso.isError) return <div className="panel err">{msg(uso.error, "Não consegui carregar o consumo da brapi agora.")}</div>;
  const u = uso.data;
  if (!u) return null;
  if (!u.enabled) return <div className="panel"><h2>Consultas da brapi.dev</h2><div className="hint">Sem token da brapi configurado: as cotações vêm só do Yahoo Finance.</div></div>;
  const n = (v: number) => v.toLocaleString("pt-BR"), p = u.limite ? Math.min(100, u.usado / u.limite * 100) : 0;
  const plano = ({ free: "gratuito", startup: "Startup", pro: "Pro" } as Record<string, string>)[u.plano ?? ""] || u.plano || "atual";
  const dia = (iso?: string) => iso ? isoBR(iso.slice(0, 10)) : "—";
  const janela = u.janela === "billing-cycle"
    ? { k: "Renova em", v: dia(u.fim), s: `ciclo de cobrança desde ${dia(u.inicio)}` }
    : { k: "Janela", v: "30 dias", s: `contagem corrida, desde ${dia(u.inicio)}` };
  return (
    <div className="panel">
      <h2>Consultas da brapi.dev</h2>
      <div className="hint">Cotações da B3. O plano {plano} permite {n(u.limite)} consultas; acima disso, as cotações passam a vir do Yahoo Finance.</div>
      <div className="tiles">
        <div className="tile"><div className="k">Usadas</div><div className="v">{n(u.usado)}</div><div className="s">{brl(p, 1)}% do limite</div></div>
        <div className="tile"><div className="k">Restantes</div><div className="v">{n(u.restante)}</div><div className="s">de {n(u.limite)}</div></div>
        <div className="tile"><div className="k">{janela.k}</div><div className="v">{janela.v}</div><div className="s">{janela.s}</div></div>
      </div>
      <div className="uso-bar" role="meter" aria-label="Consultas usadas" aria-valuemin={0} aria-valuemax={u.limite} aria-valuenow={u.usado}>
        <span className={p >= 80 ? "alto" : undefined} style={{ width: p + "%" }} />
      </div>
      <div className="status" style={{ marginTop: 8 }}>Dados de {hora(u.fetchedAt)}.</div>
    </div>
  );
}
