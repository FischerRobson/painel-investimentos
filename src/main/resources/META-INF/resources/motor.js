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

  // ---------- Marcação a mercado (Tesouro Prefixado e IPCA+) ----------
  // Datas "YYYY-MM-DD". Dias úteis = seg a sex, sem feriados (aproximação da convenção de 252 dias úteis).
  const DIA = 86400000;
  const dataLocal = d => new Date(d + "T12:00:00").getTime();
  const diasCorridos = (a, b) => Math.round((dataLocal(b) - dataLocal(a)) / DIA);
  function diasUteis(a, b) {
    let n = 0;
    for (let t = dataLocal(a) + DIA; t <= dataLocal(b); t += DIA) {
      const w = new Date(t).getDay();
      if (w !== 0 && w !== 6) n++;
    }
    return n;
  }
  // Inflação acumulada de inicio até fim (mês a mês). Meses sem IPCA divulgado usam ipcaProj.
  // mensal: [{date: "YYYY-MM-DD", value: %}]. O VNA do IPCA+ reflete o IPCA com defasagem; aqui usamos o mês da data.
  function fatorIpcaPeriodo(mensal, inicio, fim, ipcaProj) {
    const mapa = new Map(mensal.map(p => [p.date.slice(0, 7), p.value]));
    let [y, m] = inicio.slice(0, 7).split("-").map(Number);
    const [fy, fm] = fim.slice(0, 7).split("-").map(Number);
    let f = 1;
    while (y < fy || (y === fy && m < fm)) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      f *= mapa.has(k) ? 1 + mapa.get(k) / 100 : Math.pow(1 + ipcaProj / 100, 1 / 12);
      if (++m > 12) { m = 1; y++; }
    }
    return f;
  }
  // Valor de um título comprado a PU puCompra e taxa contratada taxaCont (% a.a.; real no IPCA+).
  // accrHoje/accrVenc: fator de correção pelo IPCA (1 no prefixado). Mercado: taxaMerc (mesma convenção).
  // Vender agora: IR pelo tempo da compra até hoje. Manter: IR pelo prazo total. Reaplicar: taxa = reinvestPct% do CDI (cdiTaxa), IR pelo prazo restante.
  function marcacao({ qtd, puCompra, taxaCont, taxaMerc, dataCompra, dataAnalise, dataVenc, accrHoje = 1, accrVenc = 1, cdiTaxa, reinvestPct = 100 }) {
    if (dataAnalise >= dataVenc) return null;
    const r = taxaCont / 100, rm = taxaMerc / 100;
    const duDec = diasUteis(dataCompra, dataAnalise), duRem = diasUteis(dataAnalise, dataVenc), duTot = diasUteis(dataCompra, dataVenc);
    const dcDec = diasCorridos(dataCompra, dataAnalise), dcRem = diasCorridos(dataAnalise, dataVenc), dcTot = diasCorridos(dataCompra, dataVenc);
    const puTeorico = puCompra * accrHoje * Math.pow(1 + r, duDec / 252);          // valor na curva, à taxa contratada
    const puMercado = puTeorico * Math.pow((1 + r) / (1 + rm), duRem / 252);       // preço se a taxa de mercado for taxaMerc
    const puVenc = puCompra * Math.pow(1 + r, duTot / 252) * accrVenc;             // valor de vencimento (face)
    const custo = qtd * puCompra;
    const brutoVenda = qtd * puMercado;
    const irVenda = Math.max(0, brutoVenda - custo) * aliqIR(dcDec);
    const liqVenda = brutoVenda - irVenda;
    const taxaReinv = cdiTaxa * reinvestPct / 100;
    const reinvBruto = liqVenda * Math.pow(1 + taxaReinv / 100, duRem / 252);
    const irReinv = Math.max(0, reinvBruto - liqVenda) * aliqIR(dcRem);
    const liqReinv = reinvBruto - irReinv;
    const brutoVenc = qtd * puVenc;
    const irVenc = Math.max(0, brutoVenc - custo) * aliqIR(dcTot);
    const liqVenc = brutoVenc - irVenc;
    return {
      puTeorico, puMercado, puVenc,
      valorTeorico: qtd * puTeorico, valorMercado: brutoVenda,
      lucroBruto: brutoVenda - custo, irVenda, liqVenda,
      vendaReaplicada: liqReinv, taxaReinv,
      brutoVenc, irVenc, liqVenc,
      diferenca: liqReinv - liqVenc,
      duRem, dcRem,
    };
  }

  // ---------- Planejador de metas ----------
  // Taxa mensal equivalente à anual (mesma convenção do simulador). Sem IR: é uma estimativa bruta.
  const taxaMensal = taxaAa => Math.pow(1 + taxaAa / 100, 1 / 12) - 1;

  // Aporte mensal (no fim de cada mês) para chegar em `alvo` em `meses`, partindo de `atual`.
  // Zero se o patrimônio atual já basta. Null se o prazo não for positivo.
  function aporteMensal({ alvo, atual = 0, meses, taxaAa }) {
    if (!(meses > 0)) return null;
    const r = taxaMensal(taxaAa), n = meses;
    const futuroAtual = atual * Math.pow(1 + r, n);
    if (futuroAtual >= alvo) return 0;
    if (r === 0) return (alvo - atual) / n;
    return (alvo - futuroAtual) * r / (Math.pow(1 + r, n) - 1);
  }

  // Meses até chegar em `alvo` com aporte fixo mensal. Zero se já atingiu. Null se nunca chega (aporte e patrimônio zerados).
  function mesesAteMeta({ alvo, atual = 0, aporte, taxaAa }) {
    if (atual >= alvo) return 0;
    const r = taxaMensal(taxaAa);
    if (r === 0) return aporte > 0 ? (alvo - atual) / aporte : null;
    const num = alvo * r + aporte, den = atual * r + aporte;
    if (num <= 0 || den <= 0) return null;
    return Math.log(num / den) / Math.log(1 + r);
  }

  // ---------- Analisador de ações e FIIs ----------
  // Cada critério vira nota de 0 a 100 por interpolação linear entre `zero` (nota 0) e `cem` (nota 100).
  // Vale para métrica em que subir é bom (zero < cem) e para a que é ruim (zero > cem, como dívida e P/L).
  // Valor 0 ou ausente é "sem dado" (o Fundamentus usa 0 quando não tem o número): o critério sai da média e o peso se redistribui.
  // Negativo em múltiplos de preço (P/L, P/VP, EV/EBITDA) não é "barato": nota 0.
  const notaLinear = (v, zero, cem) => Math.max(0, Math.min(100, (v - zero) / (cem - zero) * 100));

  const CRITERIOS_ACAO = [
    { id: "pl", nome: "P/L", peso: 13, zero: 25, cem: 8, negativoZera: true, valor: f => f.pl, fmt: "x" },
    { id: "pvp", nome: "P/VP", peso: 10, zero: 4, cem: 1, negativoZera: true, valor: f => f.pvp, fmt: "x" },
    { id: "evEbitda", nome: "EV/EBITDA", peso: 9, zero: 15, cem: 5, negativoZera: true, valor: f => f.evEbitda, fmt: "x" },
    { id: "roe", nome: "ROE", peso: 13, zero: 0, cem: 0.20, valor: f => f.roe, fmt: "%" },
    { id: "roic", nome: "ROIC", peso: 10, zero: 0, cem: 0.15, valor: f => f.roic, fmt: "%" },
    { id: "margem", nome: "Margem líquida", peso: 10, zero: 0, cem: 0.20, valor: f => f.margemLiq, fmt: "%" },
    { id: "divida", nome: "Dívida líquida / patrimônio", peso: 10, zero: 3, cem: 0, valor: f => f.divLiqPatrim, fmt: "x" },
    { id: "cresc", nome: "Crescimento da receita (5 anos)", peso: 10, zero: -0.10, cem: 0.15, valor: f => f.crescRec5a, fmt: "%" },
    { id: "dy", nome: "Dividend yield", peso: 15, zero: 0, cem: 0.10, valor: f => f.dy, fmt: "%" },
  ];

  // FIIs de tijolo (imóveis físicos) são avaliados também por vacância, cap rate e diversificação.
  // FIIs de papel, fundos de fundos e híbridos não têm imóvel próprio para medir isso.
  const CRITERIOS_FII_PAPEL = [
    { id: "dy", nome: "Dividend yield", peso: 30, zero: 0, cem: 0.12, valor: f => f.dy, fmt: "%" },
    { id: "pvp", nome: "P/VP", peso: 25, zero: 1.3, cem: 0.9, negativoZera: true, valor: f => f.pvp, fmt: "x" },
    { id: "ffo", nome: "FFO cobre o dividendo", peso: 25, zero: 0.6, cem: 1.0, valor: f => ratioFfo(f), fmt: "x" },
    { id: "liq", nome: "Liquidez", peso: 20, zero: 100000, cem: 2000000, valor: f => f.liquidez, fmt: "R$" },
  ];
  const CRITERIOS_FII_TIJOLO = [
    { id: "dy", nome: "Dividend yield", peso: 25, zero: 0, cem: 0.12, valor: f => f.dy, fmt: "%" },
    { id: "pvp", nome: "P/VP", peso: 20, zero: 1.3, cem: 0.9, negativoZera: true, valor: f => f.pvp, fmt: "x" },
    { id: "ffo", nome: "FFO cobre o dividendo", peso: 15, zero: 0.6, cem: 1.0, valor: f => ratioFfo(f), fmt: "x" },
    { id: "liq", nome: "Liquidez", peso: 10, zero: 100000, cem: 2000000, valor: f => f.liquidez, fmt: "R$" },
    { id: "vacancia", nome: "Vacância média", peso: 15, zero: 0.20, cem: 0, valor: f => f.vacancia, fmt: "%" },
    { id: "capRate", nome: "Cap rate", peso: 10, zero: 0.05, cem: 0.10, valor: f => f.capRate, fmt: "%" },
    { id: "imoveis", nome: "Número de imóveis", peso: 5, zero: 1, cem: 10, valor: f => f.imoveis, fmt: "n" },
  ];

  // FFO / dividendo: acima de 1 o fundo distribui menos do que gera de caixa recorrente
  function ratioFfo(f) {
    return f.ffoYield > 0 && f.dy > 0 ? f.ffoYield / f.dy : null;
  }

  // Segmento do Fundamentus -> tipo de critério. Papel, fundos de fundos e híbridos usam o conjunto de papel.
  function tipoFii(segmento) {
    const s = (segmento || "").toLowerCase();
    if (/papel|cri\b|títulos|titulos|val\.? ?mob|fundo de fundos|fundos de fundos|fof|híbrido|hibrido/.test(s)) return "papel";
    return "tijolo";
  }

  // Avalia um conjunto de critérios. Retorna nota ponderada (0–100), cobertura (fração do peso com dado) e as linhas.
  function pontua(criterios, fund) {
    const linhas = criterios.map(c => {
      const v = c.valor(fund);
      const ausente = v == null || !isFinite(v) || v === 0;
      let nota = null;
      if (!ausente) {
        nota = c.negativoZera && v < 0 ? 0 : notaLinear(v, c.zero, c.cem);
      }
      return { id: c.id, nome: c.nome, peso: c.peso, valor: ausente ? null : v, fmt: c.fmt, nota: nota == null ? null : Math.round(nota) };
    });
    const usados = linhas.filter(l => l.nota != null);
    const pesoTotal = criterios.reduce((a, c) => a + c.peso, 0);
    const pesoUsado = usados.reduce((a, l) => a + l.peso, 0);
    const nota = usados.length ? usados.reduce((a, l) => a + l.nota * l.peso, 0) / pesoUsado : null;
    return { nota: nota == null ? null : Math.round(nota), cobertura: pesoUsado / pesoTotal, criterios: linhas };
  }

  // Faixas da nota: só descrevem a pontuação, não são recomendação de compra ou venda.
  const faixaNota = n => n == null ? "sem dados" : n >= 70 ? "alta" : n >= 50 ? "média" : "baixa";

  function analisaAcao(f) {
    const r = pontua(CRITERIOS_ACAO, f);
    const alertas = [];
    if (f.pl != null && f.pl < 0) alertas.push("Prejuízo nos últimos 12 meses (P/L negativo).");
    if (f.liquidez != null && f.liquidez > 0 && f.liquidez < 1000000) alertas.push("Liquidez baixa: negociação pequena, o preço pode se afastar do valor justo na venda.");
    return { kind: "acao", tipo: "Ação", ...r, faixa: faixaNota(r.nota), alertas };
  }

  function analisaFii(f) {
    const tipo = tipoFii(f.segmento);
    const r = pontua(tipo === "papel" ? CRITERIOS_FII_PAPEL : CRITERIOS_FII_TIJOLO, f);
    const alertas = [];
    if (f.vacancia != null && f.vacancia >= 0.2 && tipo === "tijolo") alertas.push("Vacância alta: mais de 20% dos imóveis sem locatário.");
    if (f.ffoYield > 0 && f.dy > 0 && f.ffoYield < f.dy) alertas.push("O dividendo passa do FFO: pode ser distribuição acima do que o fundo gera.");
    if (f.liquidez != null && f.liquidez > 0 && f.liquidez < 1000000) alertas.push("Liquidez baixa para um FII.");
    return { kind: "fii", tipo: tipo === "papel" ? "Papel / híbrido" : "Tijolo", segmento: f.segmento || null, ...r, faixa: faixaNota(r.nota), alertas };
  }

  return { aliqIR, simulate, ipcaEquilibrio, fatorPre, fatorIpca, ipcaVsPre, acumulado12, cdiAnual, juroReal, comparaRF, cenarioFocus,
    diasUteis, diasCorridos, fatorIpcaPeriodo, marcacao, aporteMensal, mesesAteMeta, notaLinear, tipoFii, analisaAcao, analisaFii };
})();
if (typeof module !== "undefined") module.exports = Motor;
