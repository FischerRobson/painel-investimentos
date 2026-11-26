// Carteira: ações, FIIs, cripto, renda fixa, moedas e bens, com os totais, a divisão por classe, o desempenho de cada ativo e a
// evolução do patrimônio. Contas em lib/composicao.ts e no motor.
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTitulo } from "../../lib/useTitulo";
import { carteiraStore } from "../../lib/carteira";
import { useComposicao } from "../../lib/useComposicao";
import { aplicacoesDosTitulosAntigos, operacoesStore } from "../../lib/operacoes";
import { moneyC } from "../../lib/cambio";
import { bemNome } from "../../lib/bens";
import { isoBR, useHistorico } from "../../lib/dados";
import { arrow, brl, money, pct, signCls } from "../../lib/formato";
import type { Composicao } from "../../lib/composicao";
import { rfTaxa } from "../ferramentas/ProjecaoRF";
import { ErroCarteira } from "../../componentes/ErroCarteira";
import { Distribuicao, type Categoria } from "./Distribuicao";
import { useAberto } from "../../lib/useAberto";
import { UltimosDias } from "./UltimosDias";
import { Historico } from "./Historico";
import { exportarBackup, importarBackup } from "./backup";

export const signedMoney = (v: number | null) => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v));

export function Carteira() {
  useTitulo("Carteira");
  const { carteira, doc, composicao, pronta, erroCripto, rf, itens } = useComposicao();
  const historico = useHistorico();

  // Títulos de renda fixa de antes das operações viram uma aplicação com os mesmos dados (uma vez)
  const migrar = doc ? aplicacoesDosTitulosAntigos(doc).length : 0;
  useEffect(() => { if (migrar) operacoesStore.migrarTitulos(); }, [migrar]);

  if (carteira.erro) return <ErroCarteira msg={carteira.erro} />;
  if (!doc || !composicao) return <div className="panel muted">Carregando sua carteira…</div>;
  const c = composicao;

  return <>
    <Painel c={c} comOps={new Set((doc.operacoes ?? []).map(o => o.ativo))} erros={[erroCripto, rf.ratesErr]} semTaxas={!!rf.titulos.length && !rf.rates} ratesErr={rf.ratesErr}
      historico={historico.data ?? {}} />
    {!c.vazia && <UltimosDias c={c} itens={itens} pronta={pronta} />}
    {/* sem /api/historico (erro), o painel trata como histórico vazio */}
    {!c.vazia && !historico.isPending && <Historico hist={historico.data ?? {}} tipos={Object.fromEntries(c.rv.map(r => [r.t, r.type]))} />}
  </>;
}

function Painel({ c, comOps, erros, semTaxas, ratesErr, historico }: {
  c: Composicao; comOps: Set<string>; erros: (string | null)[]; semTaxas: boolean; ratesErr: string | null; historico: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const arquivo = useRef<HTMLInputElement>(null);
  const share = (v: number | null) => c.total && v ? v / c.total * 100 : 0;
  const { vAcoes, vFiis, vCripto, vRf, vFx, vBens, vExt, total } = c;

  const cats: Categoria[] = [
    {
      name: "Renda variável", color: "--s1", value: vAcoes + vFiis,
      items: c.rv.filter(r => r.value).map(r => ({ name: r.t, sub: r.rotulo, value: r.value! })),
      note: vAcoes + vFiis ? `Ações ${money(vAcoes - vExt)} · FIIs ${money(vFiis)}${vExt ? ` · Exterior ${money(vExt)}` : ""}` : "",
    },
    { name: "Renda fixa", color: "--s2", value: vRf, items: c.rf.filter(r => r.calc).map(r => ({ name: r.nome, sub: rfTaxa(r), value: r.calc!.liquido })), note: "valores líquidos de IR" },
    { name: "Cripto", color: "--s3", value: vCripto, items: c.cr.filter(r => r.value).map(r => ({ name: r.t, sub: brl(r.q, 8).replace(/0+$/, "").replace(/,$/, ""), value: r.value! })), note: "" },
    { name: "Moedas", color: "--s4", value: vFx, items: c.mo.filter(r => r.value).map(r => ({ name: r.c, sub: moneyC(r.q, r.c), value: r.value! })), note: "valores convertidos para reais" },
  ].filter(x => x.value > 0);

  const importar = async (f: File) => {
    if (!(await importarBackup(f))) return;
    await carteiraStore.recarregar();
    void qc.invalidateQueries(); // histórico, taxas e cotações dos ativos novos
  };

  const rvRows = [...c.rv, ...c.cr].sort((a, b) => (b.value || 0) - (a.value || 0));
  const rfRows = [...c.rf].sort((a, b) => (b.calc?.liquido || 0) - (a.calc?.liquido || 0));
  const Alloc = ({ v }: { v: number | null | undefined }) => (
    <div className="alloc">{v ? brl(share(v), 1) + "%" : "—"}<div className="track"><div className="fill" style={{ width: `${share(v ?? null)}%` }} /></div></div>
  );
  const Resumo = ({ titulo, n, v, nomes: [um, varios] = ["ativo", "ativos"] }: { titulo: string; n: number; v: number; nomes?: [string, string] }) => (
    <summary><span className="acc-t">{titulo}</span><span className="acc-s">{n} {n === 1 ? um : varios} · {money(v)} · {brl(share(v), 1)}%</span></summary>
  );

  return (
    <div className="panel">
      <div className="w-head">
        <div><h2>Minha carteira</h2><div className="hint" style={{ margin: 0 }}>Salva no servidor: disponível em qualquer dispositivo. Proventos estimados com base no que foi pago nos últimos 12 meses.</div></div>
        <div className="w-actions">
          {c.rv.length > 0 && (
            <button onClick={() => navigate("/ativos#" + encodeURIComponent(c.rv.map(w => w.t).join(",")))}>Ver ações e FIIs em Ativos</button>
          )}
          <button disabled={c.vazia} onClick={() => void exportarBackup(historico)}>Exportar backup</button>
          <button onClick={() => arquivo.current?.click()}>Importar backup</button>
          <input type="file" ref={arquivo} accept=".json,application/json" hidden aria-label="Arquivo de backup"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importar(f); }} />
        </div>
      </div>
      {erros.filter(Boolean).map(m => <div key={m} className="err" style={{ marginTop: 8 }}>{m}</div>)}
      {!c.vazia && (
        <div className="tiles">
          <div className="tile"><div className="k">Patrimônio total</div><div className="v">{money(c.patrimonio)}</div>
            <div className="s">{semTaxas ? "sem a renda fixa (aguardando taxas)" : vBens ? `investimentos ${money(total)} + bens ${money(vBens)}` : "renda fixa líquida de IR"}</div></div>
          {vBens > 0 && <div className="tile"><div className="k">Investimentos</div><div className="v">{money(total)}</div><div className="s">sem contar bens</div></div>}
          <div className="tile"><div className="k">Hoje (renda variável)</div><div className={"v " + signCls(c.dayTotal)}>{arrow(c.dayTotal)} {money(Math.abs(c.dayTotal))}</div>
            <div className={"s " + signCls(c.dayPct ?? 0)}>{pct(c.dayPct)}</div></div>
          <div className="tile"><div className="k">Proventos 12 meses</div><div className="v">{money(c.div12)}</div>
            <div className="s">{money(c.div12 / 12)} por mês · DY {vAcoes + vFiis ? brl(c.div12 / (vAcoes + vFiis) * 100) + "%" : "—"}</div></div>
          {c.rf.length > 0 && <div className="tile"><div className="k">Rendimento renda fixa</div><div className={"v " + signCls(c.rfRend)}>{semTaxas ? "—" : signedMoney(c.rfRend)}</div>
            <div className="s">líquido · {c.rfAplic ? pct(c.rfRend / c.rfAplic * 100) : "—"} sobre {money(c.rfAplic)}</div></div>}
        </div>
      )}
      {cats.length > 0 && <Distribuicao cats={cats} total={total} vBens={vBens} share={share} />}
      {c.vazia && <div className="hint" style={{ marginTop: 8 }}>Sua carteira está vazia. Adicione algo abaixo.</div>}

      {rvRows.length > 0 && (
        <Acordeao k="rv" resumo={<Resumo titulo="Ações, FIIs e cripto" n={rvRows.length} v={vAcoes + vFiis + vCripto} />}>
          <div className="table-wrap"><table className="w-table">
            <thead><tr><th>Ativo</th><th>Quantidade</th><th>Preço</th><th>Valor</th><th>% da carteira</th><th>Hoje</th><th>Proventos 12m</th><th>Por mês</th></tr></thead>
            <tbody>{rvRows.map(r => (
              <tr key={r.kind + r.t}>
                <td><span className="tk">{r.t}</span> <span className="muted">{r.rotulo}</span></td>
                <td>{comOps.has(r.t)
                  ? <Link to={`/operacoes?classe=${r.kind === "cr" ? "cripto" : "rv"}&mov=saida&ativo=${encodeURIComponent(r.t)}`} title="A quantidade vem das operações: abre a venda deste ativo">{brl(r.q, r.q % 1 ? 4 : 0)}</Link>
                  : <>{brl(r.q, r.q % 1 ? 4 : 0)} <Link to="/operacoes" className="muted" title="Este ativo ainda não tem operações">sem histórico</Link></>}</td>
                <td>{r.price != null ? moneyC(r.price, r.cur || "BRL") : <span className="muted">{r.err ? "não encontrado" : "carregando…"}</span>}</td>
                <td>{money(r.value)}</td>
                <td><Alloc v={r.value} /></td>
                <td className={signCls(r.dayChg ?? 0)} title={r.kind === "cr" ? "Variação em 24 horas" : undefined}>
                  {signedMoney(r.dayChg)}{r.kind === "cr" && r.dayChg != null && <> <span className="muted">24h</span></>}</td>
                <td>{r.div12 ? money(r.div12) : "—"}</td>
                <td>{r.div12 ? money(r.div12 / 12) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="status">Para mudar a quantidade, lance uma compra ou venda em <Link to="/operacoes">Operações</Link>.</div>
        </Acordeao>
      )}

      {rfRows.length > 0 && (
        <Acordeao k="rf" resumo={<Resumo titulo="Renda fixa" n={rfRows.length} v={vRf} nomes={["título", "títulos"]} />}>
          <div className="table-wrap"><table className="w-table">
            <thead><tr><th>Título</th><th>Rentabilidade</th><th>Aplicado</th><th>Aplicação</th><th>Vencimento</th><th>Valor bruto</th><th>IR</th><th>Valor líquido</th><th>Rendimento líq.</th><th>% da carteira</th><th></th></tr></thead>
            <tbody>{rfRows.map(r => {
              const k = r.calc, rendLiq = k ? k.liquido - r.aplicado : null;
              return (
                <tr key={r.id}>
                  <td><span className="tk">{r.nome}</span> <span className="muted">{r.tipo}</span></td>
                  <td>{rfTaxa(r)}</td>
                  <td>{money(r.aplicado)}</td>
                  <td>{isoBR(r.data)}</td>
                  <td>{r.venc ? <>{isoBR(r.venc)}{k?.venceu && <> <span className="muted">(venceu)</span></>}</> : "—"}</td>
                  <td>{k ? money(k.bruto) : <span className="muted">{ratesErr ? "sem taxas" : "calculando…"}</span>}</td>
                  <td>{k ? (r.isento ? <span className="muted">isento</span> : <>{money(k.ir)} <span className="muted">{brl(k.aliq * 100, 1)}%</span></>) : "—"}</td>
                  <td>{k ? money(k.liquido) : "—"}</td>
                  <td className={signCls(rendLiq ?? 0)}>{k ? <>{signedMoney(rendLiq)} <span className="muted">{pct(rendLiq! / r.aplicado * 100)}</span></> : "—"}</td>
                  <td><Alloc v={k?.liquido} /></td>
                  <td><Link to={`/operacoes?classe=rf&mov=saida&ativo=${encodeURIComponent(r.id)}`} aria-label={`Resgatar ${r.nome}`}>Resgatar</Link></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div className="status">Errou algum dado do título? Estorne a aplicação em <Link to="/operacoes">Operações</Link> e aplique de novo.</div>
        </Acordeao>
      )}

      {c.mo.length > 0 && (
        <Acordeao k="fx" resumo={<Resumo titulo="Moedas" n={c.mo.length} v={vFx} nomes={["moeda", "moedas"]} />}>
          <div className="table-wrap"><table className="w-table"><thead><tr><th>Moeda</th><th>Quantidade</th><th>Cotação</th><th>Valor</th><th>% da carteira</th><th>Hoje</th></tr></thead>
            <tbody>{c.mo.map(r => (
              <tr key={r.c}><td><span className="tk">{r.c}</span></td><td>{moneyC(r.q, r.c)}</td>
                <td>{r.ok ? "R$ " + brl(r.rate!, r.rate! < 0.1 ? 5 : 4) : "—"}</td><td>{money(r.value)}</td><td><Alloc v={r.value} /></td>
                <td className={signCls(r.dayChg ?? 0)}>{signedMoney(r.dayChg)}</td></tr>
            ))}</tbody></table></div>
          <div className="status">Para comprar ou vender, use a página <Link to="/moedas">Moedas</Link>.</div>
        </Acordeao>
      )}

      {c.bens.length > 0 && (
        <Acordeao k="bens" resumo={<summary><span className="acc-t">Bens</span><span className="acc-s">{c.bens.length} · {money(vBens)} · fora dos investimentos</span></summary>}>
          <div className="table-wrap"><table className="w-table"><thead><tr><th>Bem</th><th>Ano</th><th>Código FIPE</th><th>Referência</th><th>Valor FIPE</th></tr></thead>
            <tbody>{c.bens.map(b => (
              <tr key={b.id}><td><span className="tk">{bemNome(b)}</span> <span className="muted">{b.info?.model || ""}</span></td>
                <td>{String(b.info?.modelYear || "")}</td><td>{b.info?.codeFipe || ""}</td><td>{b.last?.month || ""}</td><td>{money(b.value)}</td></tr>
            ))}</tbody></table></div>
          <div className="status">Para adicionar ou remover, use a página <Link to="/bens">Bens</Link>.</div>
        </Acordeao>
      )}

      <div className="w-add" style={{ marginTop: 16, alignItems: "center" }}>
        <Link className="btn primary" to="/operacoes">Lançar operação</Link>
        <span className="status">Comprar, vender, aplicar ou resgatar: tudo entra como operação, na página <Link to="/operacoes">Operações</Link>. Moedas, na página <Link to="/moedas">Moedas</Link>.</span>
      </div>
    </div>
  );
}

// Seção recolhível, fechada por padrão; o que você abrir fica guardado (acc2_rv, acc2_rf, acc2_fx, acc2_bens). As chaves
// antigas (acc_*) são ignoradas: o navegador as gravava como "aberto" mesmo sem clique, quando esse era o padrão.
function Acordeao({ k, resumo, children }: { k: string; resumo: React.ReactNode; children: React.ReactNode }) {
  const [aberto, setAberto] = useAberto("acc2_" + k, "0");
  return <details className="acc" open={aberto} onToggle={e => setAberto(e.currentTarget.open)}>{resumo}{children}</details>;
}
