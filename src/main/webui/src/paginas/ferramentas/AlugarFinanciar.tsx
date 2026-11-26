// Alugar × Financiar: patrimônio de quem compra com financiamento e de quem aluga e investe, gastando o mesmo por mês.
// Contas em motor/moradia.ts. As preferências ficam na carteira (preferencias.moradia), no servidor.
import { useRendaFixa, fmtPrazo } from "../../lib/dados";
import { usePrefCarteira } from "../../lib/preferencia";
import { big, brl, money } from "../../lib/formato";
import { nominalParaReal, REGRA_ALUGUEL, simulaMoradia, type CfgMoradia } from "../../motor";
import { configLinha, css } from "../../lib/graficos";
import { Grafico } from "../../componentes/Grafico";
import { Legenda, Num, Selecao } from "../../componentes/Campos";
import { ErroCarteira } from "../../componentes/ErroCarteira";

// Rendimento padrão de longo prazo: o CDI de hoje não vale por 30 anos
const JURO_REAL_PADRAO = 5;

type Cfg = { [K in keyof CfgMoradia]?: CfgMoradia[K] | null };

export function AlugarFinanciar() {
  const rf = useRendaFixa();
  const [salvo, setCfg] = usePrefCarteira<Cfg>("moradia", {});
  if (rf.erroCarteira) return <ErroCarteira msg={rf.erroCarteira} />;
  if (!salvo) return null;

  const ipca = rf.atuais ? +rf.atuais.ipca.toFixed(2) : 4.5;
  const def: CfgMoradia = {
    valor: 500_000, entrada: 100_000, custosCompra: 5, juros: 11.5, prazo: 360, sistema: "sac", seguros: 100, tarifas: 0,
    manutencao: 1, aluguel: 2500, reajuste: ipca, valorizacao: ipca, rendimento: +nominalParaReal(JURO_REAL_PADRAO, ipca).toFixed(2), anos: 30,
  };
  const c = { ...def };
  for (const k of Object.keys(def) as (keyof CfgMoradia)[]) if (salvo[k] != null) (c as Record<string, unknown>)[k] = salvo[k];
  c.prazo = Math.min(420, c.prazo); c.anos = Math.min(50, c.anos);
  const s = simulaMoradia(c);
  const campo = (n: keyof CfgMoradia) => (v: number | null) => setCfg({ [n]: v });
  const hoje = new Date(); hoje.setDate(1);
  const tx = (m: number) => { const d = new Date(hoje); d.setMonth(d.getMonth() + m); return d.getTime(); };
  const marcos = [...new Set([1, 5, 10, 15, 20, 25, 30, 40, 50].filter(a => a < c.anos).concat(c.anos))];

  return (
    <div className="panel">
      <h2>Alugar × Financiar</h2>
      <div className="hint">Os dois gastam o mesmo por mês. Quem aluga começa investindo a entrada e os custos da compra, e em cada mês quem paga menos investe a diferença. Os valores iniciais são só um exemplo: use os da sua proposta.</div>
      <form className="w-add proj-form" onSubmit={e => e.preventDefault()}>
        <Num rotulo="Valor do imóvel (R$)" min="0" step="10000" valor={c.valor} onValor={campo("valor")} />
        <Num rotulo="Entrada (R$)" min="0" step="5000" valor={c.entrada} onValor={campo("entrada")} />
        <Num rotulo="ITBI e cartório (% do imóvel)" min="0" step="0.5" valor={c.custosCompra} onValor={campo("custosCompra")} />
        <Num rotulo="Juros do financiamento (% a.a.)" min="0" step="0.1" valor={c.juros} onValor={campo("juros")} />
        <Num rotulo="Prazo do financiamento (meses)" min="1" max="420" step="12" valor={c.prazo} onValor={campo("prazo")} />
        <label>Tabela<Selecao value={c.sistema} onChange={e => setCfg({ sistema: e.target.value as CfgMoradia["sistema"] })}>
          <option value="sac">SAC (prestação cai)</option><option value="price">Price (prestação fixa)</option></Selecao></label>
        <Num rotulo="Seguros e taxa mensal (R$)" min="0" step="10" valor={c.seguros} onValor={campo("seguros")} />
        <Num rotulo="Tarifas do banco na contratação (R$)" min="0" step="100" valor={c.tarifas} onValor={campo("tarifas")} />
        <Num rotulo="Aluguel de um imóvel igual (R$/mês)" min="0" step="100" valor={c.aluguel} onValor={campo("aluguel")} />
        <Num rotulo="Reajuste do aluguel (% a.a.)" step="0.1" valor={c.reajuste} onValor={campo("reajuste")} />
        <Num rotulo="Valorização do imóvel (% a.a.)" step="0.1" valor={c.valorizacao} onValor={campo("valorizacao")} />
        <Num rotulo="Manutenção só do dono (% do imóvel ao ano)" min="0" step="0.1" valor={c.manutencao} onValor={campo("manutencao")} />
        <Num rotulo="Rendimento dos investimentos (% a.a., antes do IR)" min="0" step="0.1" valor={c.rendimento} onValor={campo("rendimento")} />
        <Num rotulo="Comparar depois de (anos)" min="1" max="50" step="1" valor={c.anos} onValor={campo("anos")} />
      </form>
      <div className="hint">Padrões: reajuste e valorização = IPCA dos últimos 12 meses; rendimento = {JURO_REAL_PADRAO}% acima desse IPCA, uma premissa de longo prazo (o resultado depende muito dela). Condomínio e IPTU ficam de fora, supondo que o inquilino também os paga.</div>
      {!s && <div className="status down">Confira os valores: a entrada não pode passar do valor do imóvel.</div>}
      {s && <>
        <div className={"status " + (s.vencedor === "empate" ? "muted" : "up")} style={{ margin: "12px 0" }}>
          {s.vencedor === "empate" ? `Em ${c.anos} anos os dois terminam iguais.`
            : `Em ${c.anos} anos, ${s.vencedor === "comprar" ? "comprar" : "alugar e investir"} deixa você com ${money(Math.abs(s.fim.comprar - s.fim.alugar))} a mais (${money(Math.abs(s.fim.comprar - s.fim.alugar) / Math.pow(1 + ipca / 100, c.anos))} em reais de hoje, com o IPCA atual).`}
          {s.vencedor === "comprar" && s.virada != null && s.virada > 1 && ` Comprar passa à frente depois de ${fmtPrazo(s.virada)}.`}
        </div>
        <div className="tiles">
          <div className="tile"><div className="k">Aluguel ÷ valor do imóvel</div><div className="v">{brl(s.razaoAluguel * 100, 2)}% ao mês</div>
            <div className="s">{s.razaoAluguel < REGRA_ALUGUEL ? "abaixo de 0,5%: pela regra do AUVP, o aluguel está barato" : "0,5% ou mais: pela regra do AUVP, o aluguel não está barato"}</div></div>
          <div className="tile"><div className="k">Aluguel de equilíbrio</div><div className="v">{s.equilibrio != null ? money(s.equilibrio) : "—"}</div>
            <div className="s">{s.equilibrio != null ? "abaixo disso, alugar ganha com estas premissas" : "nenhum aluguel até 5% do imóvel por mês muda o resultado"}</div></div>
          <div className="tile"><div className="k">CET do financiamento</div><div className="v">{s.cet != null ? brl(s.cet, 2) + "% a.a." : "—"}</div><div className="s">juros, seguros e tarifas ({brl(c.juros, 2)}% só de juros)</div></div>
          <div className="tile"><div className="k">Primeira prestação</div><div className="v">{s.tabela.length ? money(s.tabela[0].prestacao + c.seguros) : "—"}</div>
            <div className="s">{s.tabela.length ? `última ${money(s.tabela[s.tabela.length - 1].prestacao + c.seguros)} · juros no total ${money(s.totalJuros)}` : "sem financiamento"}</div></div>
        </div>
        <Legenda itens={[["Comprar: imóvel − dívida + investimentos", css("--s1")], ["Alugar e investir", css("--s2")]]} />
        <div className="proj-box">
          <Grafico rotulo="Patrimônio comprando e alugando" deps={[JSON.stringify(c)]} config={canvas => configLinha(canvas, [
            { label: "Comprar", color: css("--s1"), data: s.pontos.map(p => ({ x: tx(p.m), y: p.comprar })) },
            { label: "Alugar", color: css("--s2"), data: s.pontos.map(p => ({ x: tx(p.m), y: p.alugar })) },
          ], { fmtY: v => "R$ " + big(v), fmtTip: v => money(v), height: 230, fill: false })} />
        </div>
        <div className="table-wrap"><table className="w-table">
          <thead><tr><th>Prazo</th><th>Imóvel</th><th>Dívida</th><th>Patrimônio comprando</th><th>Patrimônio alugando</th></tr></thead>
          <tbody>{marcos.map(a => { const x = s.pontos[Math.round(a * 12)]; return x && (
            <tr key={a}><td>{a} ano{a > 1 ? "s" : ""}</td><td>{money(x.imovel)}</td><td>{money(x.saldoDevedor)}</td><td><b>{money(x.comprar)}</b></td><td><b>{money(x.alugar)}</b></td></tr>
          ); })}</tbody>
        </table></div>
        <div className="status">Estimativa com taxas constantes. Não entram a correção do saldo devedor (TR ou IPCA), FGTS, amortização antecipada, nem corretagem e IR na venda do imóvel. Investimentos já líquidos de IR.
          {" "}A decisão também depende de prazo, localização e do quanto você quer ter a casa própria.</div>
      </>}
    </div>
  );
}
