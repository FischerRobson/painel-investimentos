// Motor financeiro: contas puras, sem DOM nem estado da página. As ferramentas da página /ferramentas usam estas funções;
// os testes ficam em .github/scripts/motor.test.mjs. Quando o frontend migrar, este arquivo vira um módulo TypeScript.
const Motor = (() => {
  // Tabela regressiva do IR da renda fixa, por dias corridos desde a aplicação
  const aliqIR = dias => dias <= 180 ? 0.225 : dias <= 360 ? 0.20 : dias <= 720 ? 0.175 : 0.15;

  // Simulador de aportes: aporte no fim de cada mês, rentabilidade constante, sem IR. Até 50 anos.
  // real = true desconta a inflação (valores em reais de hoje).
  function simulate(cfg) {
    const nominal = Math.pow(1 + cfg.taxa / 100, 1 / 12) - 1;
    const r = cfg.real ? Math.pow((1 + cfg.taxa / 100) / (1 + cfg.inflacao / 100), 1 / 12) - 1 : nominal;
    let saldo = cfg.inicial, aportado = cfg.inicial, mMeta = null, mRenda = null;
    const rows = [{ m: 0, saldo, aportado }];
    for (let m = 1; m <= 600; m++) {
      saldo = saldo * (1 + r) + cfg.aporte;
      aportado += cfg.aporte;
      rows.push({ m, saldo, aportado });
      if (mMeta == null && cfg.meta && saldo >= cfg.meta) mMeta = m;
      if (mRenda == null && cfg.renda && saldo * r >= cfg.renda) mRenda = m;
    }
    return { rows, r, mMeta, mRenda };
  }

  // ---------- IPCA+ × Prefixado ----------
  // Taxas em % a.a. Equação de Fisher: (1 + pré) = (1 + IPCA) × (1 + juro real).
  // A inflação de equilíbrio é a média geométrica anual do IPCA que faz os dois renderem o mesmo.
  const ipcaEquilibrio = (pre, real) => ((1 + pre / 100) / (1 + real / 100) - 1) * 100;
  const fatorPre = (pre, anos) => Math.pow(1 + pre / 100, anos);
  const fatorIpca = (real, ipca, anos) => Math.pow((1 + ipca / 100) * (1 + real / 100), anos);

  // Resultado de um título no vencimento: bruto, IR (tabela regressiva pelo prazo), líquido e líquido em reais de hoje.
  function resgate(valor, fator, anos, ipca) {
    const bruto = valor * fator;
    const ir = Math.max(0, bruto - valor) * aliqIR(Math.round(anos * 365));
    const liquido = bruto - ir;
    return { bruto, ir, liquido, real: liquido / Math.pow(1 + ipca / 100, anos) };
  }

  // Compara os dois títulos com o mesmo valor, prazo e inflação média.
  function ipcaVsPre({ valor, anos, pre, real, ipca }) {
    const p = resgate(valor, fatorPre(pre, anos), anos, ipca);
    const i = resgate(valor, fatorIpca(real, ipca, anos), anos, ipca);
    const dif = i.liquido - p.liquido;
    return { pre: p, ipca: i, dif, vencedor: Math.abs(dif) < 0.005 ? "empate" : dif > 0 ? "ipca" : "pre", equilibrio: ipcaEquilibrio(pre, real) };
  }

  return { aliqIR, simulate, ipcaEquilibrio, fatorPre, fatorIpca, ipcaVsPre };
})();
if (typeof module !== "undefined") module.exports = Motor;
