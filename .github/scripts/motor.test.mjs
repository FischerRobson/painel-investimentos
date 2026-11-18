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
