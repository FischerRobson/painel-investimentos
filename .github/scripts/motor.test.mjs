// Testes do motor financeiro (src/main/resources/META-INF/resources/motor.js). Rodar: node --test .github/scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Motor = require("../../src/main/resources/META-INF/resources/motor.js");
const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test("tabela regressiva do IR", () => {
  assert.equal(Motor.aliqIR(180), 0.225);
  assert.equal(Motor.aliqIR(181), 0.20);
  assert.equal(Motor.aliqIR(360), 0.20);
  assert.equal(Motor.aliqIR(720), 0.175);
  assert.equal(Motor.aliqIR(721), 0.15);
});

test("inflação de equilíbrio: 12% pré × IPCA + 6,5% ≈ 5,16%", () => {
  perto(Motor.ipcaEquilibrio(12, 6.5), 5.164, 0.001);
});

test("no equilíbrio os dois títulos empatam, inclusive depois do IR", () => {
  const eq = Motor.ipcaEquilibrio(12, 6.5);
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 5, pre: 12, real: 6.5, ipca: eq });
  perto(r.pre.bruto, r.ipca.bruto);
  perto(r.pre.liquido, r.ipca.liquido);
  assert.equal(r.vencedor, "empate");
});

test("prefixado 12% por 5 anos: R$ 10.000 viram R$ 17.623 brutos, IR de 15%", () => {
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 5, pre: 12, real: 6.5, ipca: 3 });
  perto(r.pre.bruto, 17623.42);
  perto(r.pre.ir, 7623.42 * 0.15);
  assert.equal(r.vencedor, "pre");
});

test("inflação acima do equilíbrio favorece o IPCA+", () => {
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 5, pre: 12, real: 6.5, ipca: 6 });
  perto(r.ipca.bruto, 10000 * (1.06 * 1.065) ** 5);
  assert.equal(r.vencedor, "ipca");
  assert.ok(r.dif > 0);
});

test("valor real desconta a inflação do período", () => {
  const r = Motor.ipcaVsPre({ valor: 10000, anos: 2, pre: 10, real: 5, ipca: 4 });
  perto(r.pre.real, r.pre.liquido / 1.04 ** 2);
});

test("simulador de aportes: sem rentabilidade, o saldo é a soma dos aportes", () => {
  const s = Motor.simulate({ inicial: 1000, aporte: 100, taxa: 0, inflacao: 0, real: false, meta: 2200, renda: 0 });
  assert.equal(s.rows[12].saldo, 2200);
  assert.equal(s.mMeta, 12);
  assert.equal(s.mRenda, null);
});

test("simulador de aportes: juros compostos mensais equivalentes à taxa anual", () => {
  const s = Motor.simulate({ inicial: 1000, aporte: 0, taxa: 12, inflacao: 4, real: false, meta: 0, renda: 0 });
  perto(s.rows[12].saldo, 1120);
  const real = Motor.simulate({ inicial: 1000, aporte: 0, taxa: 12, inflacao: 4, real: true, meta: 0, renda: 0 });
  perto(real.rows[12].saldo, 1000 * 1.12 / 1.04);
});

test("IPCA acumulado em 12 meses: 12 meses de 1% dão 12,68%", () => {
  const mensal = Array.from({ length: 14 }, (_, i) => ({ date: `2025-${String(i + 1).padStart(2, "0")}-01`, value: 1 }));
  const out = Motor.acumulado12(mensal);
  assert.equal(out.length, 3);
  perto(out[0].value, (1.01 ** 12 - 1) * 100, 1e-9);
  assert.equal(out[0].date, "2025-12-01");
});

test("IPCA acumulado em 12 meses: série curta não gera pontos", () => {
  assert.equal(Motor.acumulado12([{ date: "2025-01-01", value: 1 }]).length, 0);
});

test("CDI diário para anual em base 252", () => {
  perto(Motor.cdiAnual(0.050788), ((1.00050788) ** 252 - 1) * 100, 1e-9);
  perto(Motor.cdiAnual(0), 0);
});

test("juro real: Selic 15% com IPCA 5% dá 9,52% reais", () => {
  perto(Motor.juroReal(15, 5), (1.15 / 1.05 - 1) * 100, 1e-9);
  perto(Motor.juroReal(10, 10), 0, 1e-9);
});

const produtos = [
  { nome: "Pre 12", tipo: "Tesouro Prefixado", idx: "pre", taxa: 12, isento: false, anosVenc: 5 },
  { nome: "IPCA+ 6", tipo: "Tesouro IPCA+", idx: "ipca", taxa: 6, isento: false, anosVenc: 5 },
  { nome: "CDB 110", tipo: "CDB", idx: "cdi", taxa: 110, isento: false, anosVenc: 5 },
  { nome: "LCI 90", tipo: "LCI", idx: "cdi", taxa: 90, isento: true, anosVenc: 5 },
];

test("comparador: prefixado bate com a conta direta e IR de 15% em 5 anos", () => {
  const [pre] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [produtos[0]] });
  perto(pre.bruto, 10000 * 1.12 ** 5, 0.01);
  perto(pre.ir, (pre.bruto - 10000) * 0.15, 0.01);
  perto(pre.liquido, pre.bruto - pre.ir, 0.01);
  assert.equal(pre.status, "ok");
});

test("comparador: CDB a 110% do CDI usa CDI = Selic − 0,10 p.p.", () => {
  const [cdb] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [produtos[2]] });
  perto(cdb.bruto, 10000 * (1 + 0.099 * 1.10) ** 5, 0.01);
});

test("comparador: LCI é isenta de IR", () => {
  const [lci] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [produtos[3]] });
  assert.equal(lci.ir, 0);
  assert.equal(lci.liquido, lci.bruto);
});

test("comparador: IPCA+ depende da inflação do cenário, o prefixado não", () => {
  const a = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 3, produtos })[1];
  const b = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 8, produtos })[1];
  assert.ok(b.bruto > a.bruto);
  const pa = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 3, produtos })[0];
  const pb = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 8, produtos })[0];
  assert.equal(pa.bruto, pb.bruto);
});

test("comparador: vencimento depois do prazo não é comparável; antes reaplica no CDI", () => {
  const longo = { ...produtos[0], anosVenc: 10 };
  const curto = { ...produtos[0], anosVenc: 2 };
  const [l, c] = Motor.comparaRF({ valor: 10000, anos: 5, selic: 10, ipca: 4, produtos: [longo, curto] });
  assert.equal(l.status, "depois");
  assert.equal(l.liquido, null);
  assert.equal(c.status, "antes");
  perto(c.bruto, 10000 * 1.12 ** 2 * 1.099 ** 3, 0.01); // reaplica a 100% do CDI (Selic − 0,10)
});

test("cenário Focus: média do prazo e o último ano vale para os seguintes", () => {
  const focus = [
    { indicador: "Selic", ano: "2026", mediana: 14, minimo: 13, maximo: 15 },
    { indicador: "Selic", ano: "2027", mediana: 12, minimo: 10, maximo: 14 },
    { indicador: "IPCA", ano: "2026", mediana: 5, minimo: 4, maximo: 6 },
    { indicador: "IPCA", ano: "2027", mediana: 4, minimo: 3, maximo: 7 },
  ];
  const base = Motor.cenarioFocus(focus, 2026, 2, "base");
  perto(base.selic, 13, 1e-9);
  perto(base.ipca, 4.5, 1e-9);
  const longo = Motor.cenarioFocus(focus, 2026, 4, "base");
  perto(longo.selic, (14 + 12 + 12 + 12) / 4, 1e-9);
  assert.equal(Motor.cenarioFocus(focus, 2026, 2, "juros-caem").selic, 11.5);
  assert.equal(Motor.cenarioFocus(focus, 2026, 2, "juros-sobem").selic, 14.5);
  assert.equal(Motor.cenarioFocus(focus, 2026, 2, "inflacao-sobe").ipca, 6.5);
});

// ---------- Marcação a mercado ----------
const base = { qtd: 1, dataCompra: "2025-01-02", dataAnalise: "2026-01-02", dataVenc: "2030-01-01", cdiTaxa: 12, reinvestPct: 100 };

test("dias úteis e corridos", () => {
  assert.equal(Motor.diasUteis("2026-11-13", "2026-11-20"), 5); // sex 13 (excl.) a sex 20
  assert.equal(Motor.diasCorridos("2026-01-01", "2026-01-31"), 30);
});

test("prefixado: sem mudança de taxa, o preço de mercado é o valor na curva", () => {
  const r = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 12 });
  perto(r.puMercado, r.puTeorico, 1e-9);
  perto(r.puTeorico, 900 * 1.12 ** (Motor.diasUteis(base.dataCompra, base.dataAnalise) / 252), 1e-6);
});

test("prefixado: taxa de mercado sobe, preço cai; desce, preço sobe", () => {
  const sobe = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 13 });
  const cai = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 11 });
  assert.ok(sobe.puMercado < sobe.puTeorico);
  assert.ok(cai.puMercado > cai.puTeorico);
});

test("prefixado comprado a PU de vencimento: valor de vencimento é o face de 1.000", () => {
  const du = Motor.diasUteis("2025-01-02", "2030-01-01");
  const puCompra = 1000 / 1.12 ** (du / 252);
  const r = Motor.marcacao({ ...base, dataVenc: "2030-01-01", puCompra, taxaCont: 12, taxaMerc: 12 });
  perto(r.puVenc, 1000, 1e-6);
});

test("IPCA+: correção pelo IPCA entra no valor na curva e no vencimento", () => {
  const r = Motor.marcacao({ ...base, puCompra: 1000, taxaCont: 6, taxaMerc: 6, accrHoje: 1.05, accrVenc: 1.20 });
  perto(r.puTeorico, 1000 * 1.05 * 1.06 ** (Motor.diasUteis(base.dataCompra, base.dataAnalise) / 252), 1e-6);
  perto(r.puVenc, 1000 * 1.06 ** (Motor.diasUteis(base.dataCompra, base.dataVenc) / 252) * 1.20, 1e-6);
});

test("IR da venda: lucro tributado pela alíquota do tempo de compra até hoje", () => {
  const r = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 12 });
  const lucro = r.valorMercado - 900;
  perto(r.irVenda, lucro * 0.175, 1e-6); // 365 dias corridos: faixa de 17,5% (361 a 720 dias)
  perto(r.liqVenda, r.valorMercado - r.irVenda, 1e-9);
});

test("sem prejuízo fiscal: prejuízo na venda não gera IR", () => {
  const r = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 20 });
  assert.equal(r.irVenda, 0);
});

test("data de análise depois do vencimento não é calculada", () => {
  assert.equal(Motor.marcacao({ ...base, dataAnalise: "2031-01-01", puCompra: 900, taxaCont: 12, taxaMerc: 12 }), null);
});

test("fator de IPCA: meses realizados e projeção para os demais", () => {
  const mensal = [{ date: "2025-01-01", value: 1 }, { date: "2025-02-01", value: 2 }];
  const f = Motor.fatorIpcaPeriodo(mensal, "2025-01-15", "2025-04-01", 12);
  // jan (1%) e fev (2%) realizados; mar projetado a 12% a.a. (≈ 0,949% no mês)
  perto(f, 1.01 * 1.02 * 1.12 ** (1 / 12), 1e-9);
  perto(Motor.fatorIpcaPeriodo([], "2025-01-01", "2026-01-01", 10), 1.10, 1e-9);
});

// ---------- Analisador de ações e FIIs ----------
const acao = o => ({ kind: "acao", ...o });
const fii = o => ({ kind: "fii", ...o });

test("nota linear: interpola entre zero e cem nos dois sentidos e limita entre 0 e 100", () => {
  assert.equal(Motor.notaLinear(0.10, 0, 0.20), 50);
  assert.equal(Motor.notaLinear(8, 25, 8), 100);      // P/L baixo é bom
  assert.equal(Motor.notaLinear(25, 25, 8), 0);
  assert.equal(Motor.notaLinear(99, 0, 0.2), 100);
  assert.equal(Motor.notaLinear(-5, 0, 0.2), 0);
});

test("ação com dados completos: cobertura total e nota dentro de 0–100", () => {
  // PETR4 como veio do Fundamentus
  const r = Motor.analisaAcao(acao({ pl: 4.04, pvp: 1.12, dy: 0.0829, roe: 0.2782, roic: 0.2141, margemLiq: 0.2385, evEbitda: 2.47, divLiqPatrim: 0.59, crescRec5a: -0.0175, liquidez: 2664320000 }));
  perto(r.cobertura, 1, 1e-9);
  assert.ok(r.nota >= 0 && r.nota <= 100);
  assert.equal(r.criterios.length, 9);
});

test("banco: zeros do Fundamentus (EV/EBITDA, ROIC, margem, dívida) saem da média e a cobertura cai", () => {
  // ITUB4: sem dívida líquida, EV/EBITDA, ROIC e margem no formato do Fundamentus
  const r = Motor.analisaAcao(acao({ pl: 9.64, pvp: 2.06, dy: 0.0762, roe: 0.2137, roic: 0, margemLiq: 0, evEbitda: 0, divLiqPatrim: 0, crescRec5a: 0.0359, liquidez: 1635970000 }));
  const usados = r.criterios.filter(c => c.nota != null).map(c => c.id);
  assert.deepEqual(usados, ["pl", "pvp", "roe", "cresc", "dy"]);
  perto(r.cobertura, 0.61, 1e-9);
});

test("ação com prejuízo: P/L negativo vale nota 0 e gera alerta", () => {
  const r = Motor.analisaAcao(acao({ pl: -3, pvp: 0.8, dy: 0.02, roe: -0.1, liquidez: 5000000 }));
  assert.equal(r.criterios.find(c => c.id === "pl").nota, 0);
  assert.ok(r.alertas.some(a => a.includes("Prejuízo")));
});

test("dívida líquida negativa (caixa líquido) é a melhor nota; P/VP negativo é a pior", () => {
  const r = Motor.analisaAcao(acao({ divLiqPatrim: -1, pvp: -0.5 }));
  assert.equal(r.criterios.find(c => c.id === "divida").nota, 100);
  assert.equal(r.criterios.find(c => c.id === "pvp").nota, 0);
});

test("faixas da nota: tudo no melhor dá alta, tudo no pior dá baixa", () => {
  const melhor = Motor.analisaAcao(acao({ pl: 5, pvp: 0.5, evEbitda: 4, roe: 0.3, roic: 0.2, margemLiq: 0.3, divLiqPatrim: -1, crescRec5a: 0.2, dy: 0.12 }));
  assert.equal(melhor.nota, 100);
  assert.equal(melhor.faixa, "alta");
  const pior = Motor.analisaAcao(acao({ pl: 30, pvp: 5, evEbitda: 20, roe: -0.1, roic: -0.1, margemLiq: -0.1, divLiqPatrim: 5, crescRec5a: -0.2, dy: 0.001 }));
  assert.equal(pior.nota, 0);
  assert.equal(pior.faixa, "baixa");
});

test("tipo de FII pelo segmento: tijolo x papel, fundos de fundos e híbridos", () => {
  assert.equal(Motor.tipoFii("Logística"), "tijolo");
  assert.equal(Motor.tipoFii("Multicategoria"), "tijolo");
  assert.equal(Motor.tipoFii("Papel"), "papel");
  assert.equal(Motor.tipoFii("Títulos e Val. Mob."), "papel");
  assert.equal(Motor.tipoFii("Fundo de Fundos"), "papel");
  assert.equal(Motor.tipoFii("Híbrido"), "tijolo"); // híbrido com imóveis (ex.: KNRI11) tem vacância a medir
  assert.equal(Motor.tipoFii(null), "tijolo");
});

test("FII de papel não é avaliado por vacância nem cap rate", () => {
  const r = Motor.analisaFii(fii({ segmento: "Papel", dy: 0.12, pvp: 0.9, ffoYield: 0.12, liquidez: 3000000, vacancia: 0, capRate: 0 }));
  assert.equal(r.tipo, "Papel / fundo de fundos");
  assert.deepEqual(r.criterios.map(c => c.id), ["dy", "pvp", "ffo", "liq"]);
  perto(r.cobertura, 1, 1e-9);
});

test("FII de tijolo usa vacância e cap rate; vacância zero (sem dado) fica de fora", () => {
  const r = Motor.analisaFii(fii({ segmento: "Logística", dy: 0.1361, pvp: 0.94, ffoYield: 0.1019, liquidez: 28518200, vacancia: 0, capRate: 0, imoveis: 18 }));
  assert.equal(r.tipo, "Tijolo");
  assert.equal(r.criterios.find(c => c.id === "vacancia").nota, null);   // listado como "sem dado", fora da média
  assert.equal(r.criterios.find(c => c.id === "capRate").nota, null);
  assert.notEqual(r.criterios.find(c => c.id === "imoveis").nota, null);
  perto(r.cobertura, 0.75, 1e-9);   // sem vacância (15) e cap rate (10) de 100
});

test("FII com vacância alta e dividendo acima do FFO gera alertas", () => {
  const r = Motor.analisaFii(fii({ segmento: "Lajes Corporativas", dy: 0.12, pvp: 0.8, ffoYield: 0.08, liquidez: 500000, vacancia: 0.3, capRate: 0.09, imoveis: 4 }));
  assert.ok(r.alertas.some(a => a.includes("Vacância alta")));
  assert.ok(r.alertas.some(a => a.includes("passa do FFO")));
  assert.ok(r.alertas.some(a => a.includes("Liquidez baixa")));
});

test("aporte mensal: sem juro, o aporte é alvo ÷ meses", () => {
  perto(Motor.aporteMensal({ alvo: 12000, meses: 12, taxaAa: 0 }), 1000, 1e-9);
  perto(Motor.aporteMensal({ alvo: 12000, atual: 2000, meses: 10, taxaAa: 0 }), 1000, 1e-9);
});

test("aporte mensal: com juro, o aporte acumulado chega no alvo", () => {
  const aporte = Motor.aporteMensal({ alvo: 100000, atual: 5000, meses: 60, taxaAa: 12 });
  // conferência por simulação mês a mês
  const r = Math.pow(1.12, 1 / 12) - 1;
  let saldo = 5000;
  for (let m = 0; m < 60; m++) saldo = saldo * (1 + r) + aporte;
  perto(saldo, 100000, 0.01);
});

test("aporte mensal: patrimônio atual que já basta dá zero; prazo inválido dá null", () => {
  assert.equal(Motor.aporteMensal({ alvo: 10000, atual: 20000, meses: 12, taxaAa: 10 }), 0);
  assert.equal(Motor.aporteMensal({ alvo: 10000, meses: 0, taxaAa: 10 }), null);
});

test("meses até a meta: inverso do aporte mensal", () => {
  const aporte = Motor.aporteMensal({ alvo: 100000, atual: 5000, meses: 60, taxaAa: 12 });
  perto(Motor.mesesAteMeta({ alvo: 100000, atual: 5000, aporte, taxaAa: 12 }), 60, 1e-6);
  perto(Motor.mesesAteMeta({ alvo: 12000, aporte: 1000, taxaAa: 0 }), 12, 1e-9);
});

test("meses até a meta: sem aporte e sem patrimônio nunca chega; já atingido dá zero", () => {
  assert.equal(Motor.mesesAteMeta({ alvo: 1000, atual: 0, aporte: 0, taxaAa: 10 }), null);
  assert.equal(Motor.mesesAteMeta({ alvo: 1000, atual: 2000, aporte: 0, taxaAa: 10 }), 0);
});

// ---------- Investimento que você já tem ----------
test("valor atual de prefixado: aplicado × (1 + taxa)^(dias ÷ 365)", () => {
  const r = Motor.valorAtualRF({ aplicado: 10000, idx: "pre", taxa: 12, data: "2025-01-01", hoje: "2026-01-01" });
  perto(r.valor, 11200, 1e-6);
});

test("valor atual de CDI: rende o % do CDI de cada dia da série", () => {
  const serie = [["2025-01-02", 0.04], ["2025-01-03", 0.04], ["2025-01-06", 0.04], ["2025-01-10", 0.5]];
  const r = Motor.valorAtualRF({ aplicado: 1000, idx: "cdi", taxa: 100, data: "2025-01-02", hoje: "2025-01-07", cdiSerie: serie });
  // três dias com 0,04% (o de 10/01 é depois de hoje e fica de fora)
  perto(r.valor, 1000 * Math.pow(1.0004, 3), 1e-6);
  assert.equal(r.cobertura, true);
});

test("valor atual de CDI sem a série desde a aplicação: sinaliza cobertura incompleta", () => {
  const serie = [["2025-03-03", 0.04]];
  const r = Motor.valorAtualRF({ aplicado: 1000, idx: "cdi", taxa: 100, data: "2025-01-02", hoje: "2025-04-01", cdiSerie: serie });
  assert.equal(r.cobertura, false);
});

test("valor atual de IPCA+: IPCA dos meses realizados × juro real", () => {
  const mensal = [];
  for (let m = 1; m <= 12; m++) mensal.push({ date: `2025-${String(m).padStart(2, "0")}-01`, value: 1 });
  const r = Motor.valorAtualRF({ aplicado: 10000, idx: "ipca", taxa: 6, data: "2025-01-01", hoje: "2026-01-01", ipcaMensal: mensal });
  perto(r.valor, 10000 * Math.pow(1.01, 12) * 1.06, 1e-6);
});

test("comparador: investimento que já existe paga IR pelo prazo total desde a aplicação", () => {
  // valor atual 11.200 (aplicado 10.000), 1 ano restante; prazo total de 1.000 dias → alíquota de 15%
  const [r] = Motor.comparaRF({ valor: 11200, anos: 1, selic: 10, ipca: 4, produtos: [
    { id: 1, idx: "pre", taxa: 12, anosVenc: 1, isento: false, irBase: 10000, irDias: 1000 }] });
  perto(r.bruto, 12544, 1e-6);
  perto(r.ir, (12544 - 10000) * 0.15, 1e-6);
  perto(r.liquido, 12544 - (12544 - 10000) * 0.15, 1e-6);
});

// ---------- Regras do AUVP (material da AUVP Escola) ----------
test("AUVP M7: R$ 200 mil + R$ 1.250/mês por 28 anos a 8% real chegam a R$ 3.207.211,51", () => {
  const s = Motor.simulate({ inicial: 200000, aporte: 1250, taxa: 8, inflacao: 0, real: false });
  perto(s.rows[28 * 12].saldo, 3207211.51, 0.01);
});

test("AUVP M2: R$ 1 milhão a 8% ao ano rende R$ 6.434 no primeiro mês", () => {
  const s = Motor.simulate({ inicial: 1000000, aporte: 0, taxa: 8, inflacao: 0, real: false });
  perto(s.rows[1].saldo - 1000000, 6434, 0.5);
});

test("simulador: renda possível desconta a margem de 25% dos juros do mês", () => {
  const r = Math.pow(1.12, 1 / 12) - 1;
  const base = { inicial: 100000, aporte: 0, taxa: 12, inflacao: 0, real: false };
  assert.equal(Motor.simulate({ ...base, renda: 100000 * r * 0.75 }).mRenda, 1);
  assert.ok(Motor.simulate({ ...base, renda: 100000 * r }).mRenda > 1);
  assert.equal(Motor.simulate({ ...base, renda: 100000 * r, margemRenda: 0 }).mRenda, 1);
});

test("premissa de 8% reais: taxa nominal pela equação de Fisher", () => {
  perto(Motor.nominalParaReal(8, 4), (1.08 * 1.04 - 1) * 100, 1e-9);
  assert.equal(Motor.PREMISSA_REAL, 8);
});

test("AUVP M3: Selic 13% e CDB de 108% do CDI rendem 13,932% ao ano", () => {
  const [cdb] = Motor.comparaRF({ valor: 10000, anos: 1, selic: 13, ipca: 4, produtos: [{ ...produtos[2], taxa: 108, anosVenc: 1 }] });
  perto(cdb.bruto, 11393.2, 0.01);
  perto(Motor.cdiDaSelic(13), 12.9, 1e-9);
});

test("comparador: Tesouro Selic rende a Selic cheia, não o CDI", () => {
  const ts = { nome: "TS", tipo: "Tesouro Selic", idx: "cdi", taxa: 100, isento: false, anosVenc: 1, selic: true };
  const [r] = Motor.comparaRF({ valor: 10000, anos: 1, selic: 10, ipca: 4, produtos: [ts] });
  perto(r.bruto, 11000, 0.01);
});

test("marcação: parte do ganho até o vencimento que a venda de hoje já entrega", () => {
  const na = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 12 });
  assert.ok(na.ganhoAntecipado > 0 && na.ganhoAntecipado < 1);
  const caiu = Motor.marcacao({ ...base, puCompra: 900, taxaCont: 12, taxaMerc: 6 });
  assert.ok(caiu.ganhoAntecipado > na.ganhoAntecipado); // taxa de mercado cai, preço sobe, antecipa mais
});

test("nota por faixa: zero fora, sobe até a faixa ideal, cai depois dela", () => {
  assert.equal(Motor.notaFaixa(0.3, 0.5, 0.8, 1.0, 1.3), 0);
  assert.equal(Motor.notaFaixa(0.65, 0.5, 0.8, 1.0, 1.3), 50);
  assert.equal(Motor.notaFaixa(0.9, 0.5, 0.8, 1.0, 1.3), 100);
  perto(Motor.notaFaixa(1.15, 0.5, 0.8, 1.0, 1.3), 50, 1e-9);
  assert.equal(Motor.notaFaixa(1.5, 0.5, 0.8, 1.0, 1.3), 0);
});

test("FII armadilha (perfil do HCTR11): P/VP 0,09 e DY 33% não ganham nota; viram alertas", () => {
  const r = Motor.analisaFii(fii({ segmento: "Multicategoria", imoveis: 0, vacancia: 0, capRate: 0, dy: 0.3324, ffoYield: 0.3653, pvp: 0.09, liquidez: 3000000 }),
    { nome: "Fundo de Investimento Imobiliario Hectare CE" });
  assert.equal(r.tipo, "Papel / fundo de fundos");
  assert.equal(r.criterios.find(c => c.id === "pvp").nota, 0);
  assert.equal(r.criterios.find(c => c.id === "dy").nota, 0);
  assert.ok(r.alertas.some(a => a.includes("muito alto")));
  assert.ok(r.alertas.some(a => a.includes("muito baixo")));
});

test("FII sólido (perfil do KNRI11): híbrido com imóveis é tijolo e tem nota alta", () => {
  const r = Motor.analisaFii(fii({ segmento: "Multicategoria", imoveis: 17, vacancia: 0.0007, capRate: 0.0834, dy: 0.0898, ffoYield: 0.0743, pvp: 0.9, liquidez: 5000000 }),
    { nome: "Kinea Renda Imobiliaria" });
  assert.equal(r.tipo, "Tijolo");
  assert.ok(r.nota >= 70, `nota ${r.nota}`);
});

test("FII de papel reconhecido pelo nome ou por não ter imóveis, mesmo com segmento genérico", () => {
  assert.equal(Motor.tipoFii("Multicategoria", { imoveis: 0 }), "papel");
  assert.equal(Motor.tipoFii("Outros", { nome: "Capitania Securities II" }), "papel");
  assert.equal(Motor.tipoFii("Multicategoria", { nome: "Merito Recebiveis Imobiliarios", imoveis: 3 }), "papel");
  assert.equal(Motor.tipoFii("Logística", { imoveis: 18 }), "tijolo");
});

test("FII monoativo gera alerta", () => {
  const r = Motor.analisaFii(fii({ segmento: "Lajes Corporativas", imoveis: 1, dy: 0.09, pvp: 0.9, liquidez: 3000000 }));
  assert.ok(r.alertas.some(a => a.includes("Monoativo")));
});

test("AUVP M4.2: número mágico do KNRI11 (cota de R$ 144 pagando R$ 1/mês) é 144 cotas", () => {
  const m = Motor.numeroMagico(12 / 144, 144);
  assert.equal(m.cotas, 144);
  perto(m.investimento, 144 * 144, 1e-6);
  assert.equal(Motor.numeroMagico(0, 100), null);
});

test("preço justo de Graham: √(22,5 × LPA × VPA)", () => {
  const g = Motor.precoGraham(10, 5, 1); // LPA 2, VPA 10
  perto(g.justo, Math.sqrt(22.5 * 2 * 10), 1e-9);
  perto(g.margem, Math.sqrt(450) / 10 - 1, 1e-9);
  assert.equal(Motor.precoGraham(10, -3, 1), null);
});

test("preço-teto de Bazin: dividendos de 12 meses ÷ 6%", () => {
  const b = Motor.precoBazin(10, 0.09);
  perto(b.teto, 15, 1e-9);
  perto(b.margem, 0.5, 1e-9);
});

test("setor perene x cíclico, com a indústria separando elétricas de petróleo", () => {
  const t = (s, i) => Motor.classificaSetor(s, i).tipo;
  assert.equal(t("Energia", "Petróleo e Gás Integrado"), "ciclico");
  assert.equal(t("Energia", "Energia Elétrica"), "perene");
  assert.equal(t("Serviços Financeiros", "Bancos Diversificados"), "perene");
  assert.equal(t("Materiais Básicos", "Mineração de Minerais Metálicos"), "perene");
  assert.equal(t("Saneamento", "Água e Saneamento"), "perene");
  assert.equal(t("Consumo Não Cíclico", "Medicamentos e Outros Produtos"), "perene");
  assert.equal(t("Consumo Cíclico", "Varejo Especializado"), "ciclico");
  assert.equal(t("Telecomunicações", "Telecomunicações"), "atencao");
  assert.equal(t("Consumo Não Cíclico", "Cervejas e Refrigerantes"), "neutro");
  assert.equal(t("Bens Industriais", "Máquinas e Equipamentos"), "neutro");
});

test("comparação no setor: melhor indicador entre empresas do mesmo setor, ignorando zeros", () => {
  const itens = [
    { ticker: "BBAS3", setor: "Serviços Financeiros", fund: { pl: 4.9, pvp: 0.8, dy: 0.095, roe: 0.17, margemLiq: 0.107, divLiqPatrim: 0 } },
    { ticker: "ITUB4", setor: "Serviços Financeiros", fund: { pl: 9.6, pvp: 2.06, dy: 0.076, roe: 0.21, margemLiq: 0.126, divLiqPatrim: 0 } },
    { ticker: "VALE3", setor: "Materiais Básicos", fund: { pl: 7, pvp: 1.5, dy: 0.08 } },
  ];
  const [g] = Motor.comparaSetor(itens);
  assert.equal(Motor.comparaSetor(itens).length, 1);
  assert.deepEqual(g.tickers, ["BBAS3", "ITUB4"]);
  assert.deepEqual(g.melhores.pl, ["BBAS3"]);
  assert.deepEqual(g.melhores.roe, ["ITUB4"]);
  assert.deepEqual(g.melhores.margem, ["ITUB4"]);
  assert.equal(g.melhores.divida, undefined); // bancos: dívida líquida não se aplica (zero = sem dado)
});
