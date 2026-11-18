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

  // ---------- Termômetro econômico ----------
  // IPCA acumulado em 12 meses a partir da série mensal ([{date, value}] com value em %). Começa no 12º mês.
  function acumulado12(mensal) {
    const out = [];
    for (let i = 11; i < mensal.length; i++) {
      const fator = mensal.slice(i - 11, i + 1).reduce((a, p) => a * (1 + p.value / 100), 1);
      out.push({ date: mensal[i].date, value: (fator - 1) * 100 });
    }
    return out;
  }
  // CDI diário (% ao dia útil) para taxa anual equivalente em base 252 dias úteis (%).
  const cdiAnual = diario => (Math.pow(1 + diario / 100, 252) - 1) * 100;
  // Juro real ex-post: taxa nominal (Selic) descontada do IPCA acumulado em 12 meses (%).
  const juroReal = (nominal, inflacao) => ((1 + nominal / 100) / (1 + inflacao / 100) - 1) * 100;

  // ---------- Comparador de renda fixa ----------
  // Taxas do cenário em % a.a., médias do período. O CDI é tratado como a Selic meta (aproximação; o CDI real fica ~0,10 p.p. abaixo).
  // Produto: { nome, tipo, idx: "cdi"|"pre"|"ipca", taxa, isento, anosVenc }.
  // Estimativa: IR pela tabela regressiva com o prazo total da comparação; vencimento antes do prazo é reaplicado no CDI.
  function comparaRF({ valor, anos, selic, ipca, produtos }) {
    return produtos.map(p => {
      const m = Math.min(p.anosVenc, anos);
      const fator = p.idx === "cdi" ? Math.pow(1 + (selic / 100) * (p.taxa / 100), m)
        : p.idx === "pre" ? fatorPre(p.taxa, m)
        : fatorIpca(p.taxa, ipca, m);
      let bruto = valor * fator;
      if (p.anosVenc < anos) bruto *= Math.pow(1 + selic / 100, anos - p.anosVenc); // reaplica no CDI após o vencimento
      const status = p.anosVenc > anos ? "depois" : p.anosVenc < anos ? "antes" : "ok";
      if (status === "depois") return { ...p, status, bruto: null, ir: null, liquido: null, real: null };
      const ir = p.isento ? 0 : Math.max(0, bruto - valor) * aliqIR(Math.round(anos * 365));
      const liquido = bruto - ir;
      return { ...p, status, bruto, ir, liquido, real: liquido / Math.pow(1 + ipca / 100, anos) };
    });
  }

  // Taxas de um cenário a partir do Boletim Focus: média dos anos do prazo (o último ano vale para os seguintes).
  // modo: "base" (medianas), "juros-caem" (Selic no mínimo), "juros-sobem" (Selic no máximo), "inflacao-sobe" (IPCA no máximo).
  function cenarioFocus(focus, anoInicial, anos, modo) {
    const at = (ind, ano, campo) => {
      const linhas = focus.filter(f => f.indicador === ind);
      const alvo = linhas.filter(f => Number(f.ano) <= ano).sort((a, b) => Number(b.ano) - Number(a.ano))[0] || linhas.sort((a, b) => Number(a.ano) - Number(b.ano))[0];
      return alvo ? alvo[campo] : null;
    };
    const anosPrazo = Array.from({ length: Math.max(1, Math.ceil(anos)) }, (_, k) => anoInicial + k);
    const media = (ind, campo) => {
      const v = anosPrazo.map(a => at(ind, a, campo)).filter(x => x != null);
      return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
    };
    const selicCampo = modo === "juros-caem" ? "minimo" : modo === "juros-sobem" ? "maximo" : "mediana";
    const ipcaCampo = modo === "inflacao-sobe" ? "maximo" : "mediana";
    return { selic: media("Selic", selicCampo), ipca: media("IPCA", ipcaCampo) };
  }

  return { aliqIR, simulate, ipcaEquilibrio, fatorPre, fatorIpca, ipcaVsPre, acumulado12, cdiAnual, juroReal, comparaRF, cenarioFocus };
})();
if (typeof module !== "undefined") module.exports = Motor;
