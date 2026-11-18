// Motor financeiro: contas puras, sem DOM nem estado da página. As ferramentas da página /ferramentas usam estas funções;
// os testes ficam em .github/scripts/motor.test.mjs. Quando o frontend migrar, este arquivo vira um módulo TypeScript.
const Motor = (() => {
  // Tabela regressiva do IR da renda fixa, por dias corridos desde a aplicação
  const aliqIR = dias => dias <= 180 ? 0.225 : dias <= 360 ? 0.20 : dias <= 720 ? 0.175 : 0.15;

  // Simulador de aportes: aporte no fim de cada mês, rentabilidade constante, sem IR. Até 50 anos.
  // real = true desconta a inflação (valores em reais de hoje).
  // Renda possível = juros do mês menos uma margem de segurança (padrão 25%, para impostos e reinvestimento),
  // como na regra do AUVP (Módulo 2: "olhe os juros do último mês e subtraia 25%").
  const MARGEM_RENDA = 0.25;
  function simulate(cfg) {
    const margem = cfg.margemRenda ?? MARGEM_RENDA;
    const nominal = Math.pow(1 + cfg.taxa / 100, 1 / 12) - 1;
    const r = cfg.real ? Math.pow((1 + cfg.taxa / 100) / (1 + cfg.inflacao / 100), 1 / 12) - 1 : nominal;
    let saldo = cfg.inicial, aportado = cfg.inicial, mMeta = null, mRenda = null;
    const rows = [{ m: 0, saldo, aportado }];
    for (let m = 1; m <= 600; m++) {
      saldo = saldo * (1 + r) + cfg.aporte;
      aportado += cfg.aporte;
      rows.push({ m, saldo, aportado });
      if (mMeta == null && cfg.meta && saldo >= cfg.meta) mMeta = m;
      if (mRenda == null && cfg.renda && saldo * r * (1 - margem) >= cfg.renda) mRenda = m;
    }
    return { rows, r, mMeta, mRenda, margem };
  }
  // Taxa nominal (% a.a.) que entrega `real` % acima da inflação (Fisher). Premissa do AUVP: 8% reais no longo prazo.
  const PREMISSA_REAL = 8;
  const nominalParaReal = (real, inflacao) => ((1 + real / 100) * (1 + inflacao / 100) - 1) * 100;

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
  // Taxas do cenário em % a.a., médias do período. CDI = Selic − 0,10 p.p. (AUVP, Módulo 3: "o CDI rende 0,10% abaixo da Selic";
  // exemplo: Selic 13% e CDB de 108% do CDI = 12,90% × 1,08 = 13,932%). O Tesouro Selic (p.selic) rende a própria Selic.
  // Produto: { nome, tipo, idx: "cdi"|"pre"|"ipca", taxa, isento, anosVenc, selic? }.
  // Estimativa: IR pela tabela regressiva com o prazo total da comparação; vencimento antes do prazo é reaplicado no CDI.
  const SPREAD_CDI = 0.10;
  const cdiDaSelic = selic => selic - SPREAD_CDI;
  function comparaRF({ valor, anos, selic, ipca, produtos }) {
    const cdi = cdiDaSelic(selic);
    return produtos.map(p => {
      const m = Math.min(p.anosVenc, anos);
      const base = p.selic ? selic : cdi;
      const fator = p.idx === "cdi" ? Math.pow(1 + (base / 100) * (p.taxa / 100), m)
        : p.idx === "pre" ? fatorPre(p.taxa, m)
        : fatorIpca(p.taxa, ipca, m);
      let bruto = valor * fator;
      if (p.anosVenc < anos) bruto *= Math.pow(1 + cdi / 100, anos - p.anosVenc); // reaplica a 100% do CDI após o vencimento
      const status = p.anosVenc > anos ? "depois" : p.anosVenc < anos ? "antes" : "ok";
      if (status === "depois") return { ...p, status, bruto: null, ir: null, liquido: null, real: null };
      // Investimento que já existe: o IR incide sobre o ganho desde a aplicação, com a alíquota do prazo total (irDias).
      const ir = p.isento ? 0 : p.irBase != null ? Math.max(0, bruto - p.irBase) * aliqIR(p.irDias)
        : Math.max(0, bruto - valor) * aliqIR(Math.round(anos * 365));
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
      // Fração do ganho até o vencimento que a venda de hoje já entrega (bruto, antes do IR).
      // AUVP, Módulo 3: "se o título, muito antecipadamente, entregou 90% ou até 80% da rentabilidade contratada, você já pode vender".
      ganhoAntecipado: brutoVenc > custo ? (brutoVenda - custo) / (brutoVenc - custo) : null,
      duRem, dcRem,
    };
  }

  // ---------- Investimento que você já tem ----------
  // Valor de hoje de uma aplicação de renda fixa feita em `data`. Usa a série diária do CDI (BCB, % ao dia) e
  // o IPCA mensal; meses sem IPCA divulgado usam ipcaProj. Retorna valor null sem a série do CDI.
  // cobertura = false quando a série começa depois da aplicação (o valor fica subestimado).
  function valorAtualRF({ aplicado, idx, taxa, data, hoje, cdiSerie = [], ipcaMensal = [], ipcaProj = 0 }) {
    const anos = diasCorridos(data, hoje) / 365;
    if (idx === "pre") return { valor: aplicado * Math.pow(1 + taxa / 100, anos), cobertura: true };
    if (idx === "ipca") {
      const fator = fatorIpcaPeriodo(ipcaMensal, data, hoje, ipcaProj) * Math.pow(1 + taxa / 100, anos);
      return { valor: aplicado * fator, cobertura: ipcaMensal.length > 0 };
    }
    if (!cdiSerie.length) return { valor: null, cobertura: false };
    let fator = 1;
    for (const [d, v] of cdiSerie) {
      if (d >= data && d < hoje) fator *= 1 + (taxa / 100) * (v / 100);
    }
    return { valor: aplicado * fator, cobertura: cdiSerie[0][0] <= data };
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
  // Nota por faixa ideal: 0 abaixo de zeroBaixo, sobe até 100 em cemBaixo, fica em 100 até cemAlto e cai a 0 em zeroAlto.
  // Para métricas em que pouco é ruim e muito é suspeito, como o P/VP e o DY de FIIs (AUVP, Módulo 4.2).
  function notaFaixa(v, zeroBaixo, cemBaixo, cemAlto, zeroAlto) {
    if (v <= zeroBaixo || v >= zeroAlto) return 0;
    if (v < cemBaixo) return notaLinear(v, zeroBaixo, cemBaixo);
    if (v > cemAlto) return notaLinear(v, zeroAlto, cemAlto);
    return 100;
  }
  const pctBR = (v, d = 1) => (v * 100).toFixed(d).replace(".", ",") + "%";
  const numBR = (v, d = 2) => v.toFixed(d).replace(".", ",");
  const semAcento = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
  // FIIs de papel e fundos de fundos não têm imóvel próprio para medir isso.
  // P/VP e DY por faixa (AUVP, Módulo 4.2): o ideal é P/VP abaixo de 1 ou no preço justo, um pouco acima de 1 só tira margem de
  // segurança, e P/VP "extremamente baixo (0,20 ou 0,30)" costuma esconder um problema. DY de 15% a 20% ao ano é "bom demais
  // para ser verdade" até prova em contrário (calote, venda de imóveis, pagamento extraordinário).
  const FAIXA_PVP_FII = [0.5, 0.8, 1.0, 1.3];
  const FAIXA_DY_FII = [0.04, 0.08, 0.12, 0.20];
  const CRITERIOS_FII_PAPEL = [
    { id: "dy", nome: "Dividend yield", peso: 30, faixa: FAIXA_DY_FII, valor: f => f.dy, fmt: "%" },
    { id: "pvp", nome: "P/VP", peso: 25, faixa: FAIXA_PVP_FII, negativoZera: true, valor: f => f.pvp, fmt: "x" },
    { id: "ffo", nome: "FFO cobre o dividendo", peso: 25, zero: 0.6, cem: 1.0, valor: f => ratioFfo(f), fmt: "x" },
    { id: "liq", nome: "Liquidez", peso: 20, zero: 100000, cem: 2000000, valor: f => f.liquidez, fmt: "R$" },
  ];
  const CRITERIOS_FII_TIJOLO = [
    { id: "dy", nome: "Dividend yield", peso: 25, faixa: FAIXA_DY_FII, valor: f => f.dy, fmt: "%" },
    { id: "pvp", nome: "P/VP", peso: 20, faixa: FAIXA_PVP_FII, negativoZera: true, valor: f => f.pvp, fmt: "x" },
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

  // Tipo de critério de um FII. O segmento do Fundamentus não basta: fundos de papel aparecem como "Multicategoria" ou "Outros"
  // (ex.: KNCR11, HCTR11). Por isso também conta como papel o fundo sem imóvel próprio (imoveis = 0) ou com nome de recebíveis.
  // Híbrido com imóveis (ex.: KNRI11, lajes e galpões) é tijolo: tem vacância e cap rate a medir.
  function tipoFii(segmento, { imoveis, nome } = {}) {
    const s = semAcento(segmento), n = semAcento(nome);
    if (/papel|\bcri\b|titulos|val\.? ?mob|fundo de fundos|fundos de fundos|\bfof\b/.test(s)) return "papel";
    if (imoveis === 0) return "papel";
    if (/receb|securit|\bcri\b|credito imob|rendimentos imob/.test(n)) return "papel";
    return "tijolo";
  }

  // Avalia um conjunto de critérios. Retorna nota ponderada (0–100), cobertura (fração do peso com dado) e as linhas.
  function pontua(criterios, fund) {
    const linhas = criterios.map(c => {
      const v = c.valor(fund);
      const ausente = v == null || !isFinite(v) || v === 0;
      let nota = null;
      if (!ausente) {
        nota = c.negativoZera && v < 0 ? 0 : c.faixa ? notaFaixa(v, ...c.faixa) : notaLinear(v, c.zero, c.cem);
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

  function analisaFii(f, { nome } = {}) {
    const tipo = tipoFii(f.segmento, { imoveis: f.imoveis, nome });
    const r = pontua(tipo === "papel" ? CRITERIOS_FII_PAPEL : CRITERIOS_FII_TIJOLO, f);
    const seg = semAcento(f.segmento);
    const alertas = [];
    if (f.vacancia != null && f.vacancia >= 0.2 && tipo === "tijolo") alertas.push(`Vacância alta (${pctBR(f.vacancia)}, dado do Fundamentus): imóvel vazio custa condomínio e IPTU. Confira no relatório do fundo.`);
    if (f.ffoYield > 0 && f.dy > 0 && f.ffoYield < f.dy) alertas.push("O dividendo passa do FFO: o fundo distribui mais do que gera de caixa, o que não se sustenta no longo prazo.");
    if (f.dy > 0.14) alertas.push(`Dividend yield muito alto (${pctBR(f.dy)}): pode ser calote nos recebíveis, venda de imóveis ou um pagamento extraordinário. Desconfie do "bom demais para ser verdade".`);
    if (f.pvp > 0 && f.pvp < 0.5) alertas.push(`P/VP muito baixo (${numBR(f.pvp)}): quando algo que vale R$ 1,00 sai por menos de R$ 0,50, o mercado costuma estar vendo um problema (vacância, imóvel obsoleto, inadimplência).`);
    if (tipo === "tijolo" && f.imoveis === 1) alertas.push("Monoativo: um único imóvel. Se o inquilino sair, a renda vai a zero e a despesa continua.");
    if (/desenvolv/.test(seg)) alertas.push("Fundo de desenvolvimento: depende de obra e venda; mais arriscado e não indicado para quem quer viver de renda.");
    if (/hotel|hospital|educ|escola/.test(seg)) alertas.push("Hotéis, hospitais e escolas costumam ter um único inquilino e receitas mais sensíveis a ciclos.");
    if (/fundo de fundos|fundos de fundos|\bfof\b/.test(seg)) alertas.push("Fundo de fundos: você paga a taxa do FOF e também a dos fundos que ele compra.");
    if (f.liquidez != null && f.liquidez > 0 && f.liquidez < 1000000) alertas.push("Liquidez baixa para um FII.");
    return { kind: "fii", tipo: tipo === "papel" ? "Papel / fundo de fundos" : "Tijolo", segmento: f.segmento || null, ...r, faixa: faixaNota(r.nota), alertas };
  }

  // Preço justo de Graham: √(22,5 × LPA × VPA), com LPA = preço ÷ P/L e VPA = preço ÷ P/VP (AUVP, Módulo 4.1).
  // Só faz sentido para empresa com lucro e patrimônio positivos. margem = quanto o preço justo está acima (+) ou abaixo (−) do preço.
  function precoGraham(preco, pl, pvp) {
    if (!(preco > 0 && pl > 0 && pvp > 0)) return null;
    const justo = Math.sqrt(22.5 * (preco / pl) * (preco / pvp));
    return { justo, margem: justo / preco - 1 };
  }
  // Preço-teto de Bazin: dividendos dos últimos 12 meses ÷ 6% (dividendo mínimo que Bazin considera atrativo).
  const DY_BAZIN = 0.06;
  function precoBazin(preco, dy) {
    if (!(preco > 0 && dy > 0)) return null;
    const teto = preco * dy / DY_BAZIN;
    return { teto, margem: teto / preco - 1 };
  }
  // Número mágico de um FII: cotas necessárias para que os dividendos de um mês comprem uma cota nova (12 ÷ DY).
  // AUVP, Módulo 4.2: cota de R$ 144 pagando R$ 1 por mês pede 144 cotas.
  function numeroMagico(dy, preco) {
    if (!(dy > 0 && preco > 0)) return null;
    const cotas = Math.ceil(12 / dy - 1e-9);
    return { cotas, investimento: cotas * preco };
  }

  // Setor perene ou cíclico (AUVP, Módulo 4.1). Recomendados: financeiro, materiais básicos, saúde e utilidade pública.
  // Petróleo, gás, biocombustíveis, varejo e consumo cíclico "exigem maior atenção"; telefonia e aviação são expostas a regulação.
  // O setor "Energia" do Yahoo junta elétricas (perenes) e petróleo (cíclico), então a indústria decide.
  function classificaSetor(setor, industria) {
    const s = semAcento(setor), i = semAcento(industria);
    if (/petroleo|\bgas\b|biocombust|combustiv/.test(i)) return { tipo: "ciclico", texto: "Setor cíclico (petróleo, gás e combustíveis): pode ser lucrativo, mas tem mais risco e exige atenção." };
    if (/aere|aviac/.test(i)) return { tipo: "atencao", texto: "Aviação: setor regulado, com custos (aeronaves, combustível, taxas) fora do controle da empresa." };
    if (/financ|banc|segur/.test(s) || /materiais basicos/.test(s) || /saude/.test(s) || /medicament|hospital|saude/.test(i)
      || /saneamento|utilidade/.test(s) || /energia eletrica|agua/.test(i)) return { tipo: "perene", texto: "Setor perene, entre os que o AUVP recomenda (financeiro, materiais básicos, saúde ou utilidade pública)." };
    if (/consumo ciclico/.test(s) || /varejo/.test(i)) return { tipo: "ciclico", texto: "Consumo cíclico e varejo: setor sensível à economia, com maior taxa de falência." };
    if (/telecom/.test(s)) return { tipo: "atencao", texto: "Telecomunicações: setor exposto a regulação e a mudanças tecnológicas." };
    return { tipo: "neutro", texto: null };
  }

  // Comparação dentro do setor (AUVP: "é impossível avaliar se uma empresa é boa ou ruim sem compará-la com outras do mesmo setor").
  // itens: [{ ticker, setor, fund }] de ações. Para cada setor com 2 ou mais empresas, diz quem tem o melhor valor de cada indicador.
  // Zero é "sem dado" (Fundamentus); P/L e P/VP só contam quando positivos.
  const INDICADORES_SETOR = [
    { id: "pl", nome: "P/L", campo: "pl", melhor: "menor", positivo: true, fmt: "x" },
    { id: "pvp", nome: "P/VP", campo: "pvp", melhor: "menor", positivo: true, fmt: "x" },
    { id: "dy", nome: "DY", campo: "dy", melhor: "maior", fmt: "%" },
    { id: "roe", nome: "ROE", campo: "roe", melhor: "maior", fmt: "%" },
    { id: "margem", nome: "Margem líquida", campo: "margemLiq", melhor: "maior", fmt: "%" },
    { id: "divida", nome: "Dív. líq./patrimônio", campo: "divLiqPatrim", melhor: "menor", fmt: "x" },
    { id: "cresc", nome: "Cresc. receita 5a", campo: "crescRec5a", melhor: "maior", fmt: "%" },
  ];
  function comparaSetor(itens) {
    const grupos = new Map();
    for (const it of itens) {
      if (!it.setor || !it.fund) continue;
      if (!grupos.has(it.setor)) grupos.set(it.setor, []);
      grupos.get(it.setor).push(it);
    }
    const out = [];
    for (const [setor, lista] of grupos) {
      if (lista.length < 2) continue;
      const melhores = {};
      for (const ind of INDICADORES_SETOR) {
        const validos = lista.map(it => ({ t: it.ticker, v: it.fund[ind.campo] }))
          .filter(x => x.v != null && isFinite(x.v) && x.v !== 0 && (!ind.positivo || x.v > 0));
        if (validos.length < 2) continue;
        const alvo = ind.melhor === "menor" ? Math.min(...validos.map(x => x.v)) : Math.max(...validos.map(x => x.v));
        melhores[ind.id] = validos.filter(x => x.v === alvo).map(x => x.t);
      }
      out.push({ setor, tickers: lista.map(it => it.ticker), melhores });
    }
    return out;
  }

  return { aliqIR, simulate, ipcaEquilibrio, fatorPre, fatorIpca, ipcaVsPre, acumulado12, cdiAnual, juroReal, comparaRF, cenarioFocus,
    diasUteis, diasCorridos, fatorIpcaPeriodo, marcacao, aporteMensal, mesesAteMeta, notaLinear, notaFaixa, tipoFii, analisaAcao, analisaFii,
    valorAtualRF, cdiDaSelic, nominalParaReal, PREMISSA_REAL, MARGEM_RENDA, precoGraham, precoBazin, numeroMagico, classificaSetor,
    comparaSetor, INDICADORES_SETOR };
})();
if (typeof module !== "undefined") module.exports = Motor;
