// GERADO a partir de src/main/webui/src/motor/motor.ts (npm run motor:legado). Não edite: o app atual (index.html) usa este arquivo até a migração para React terminar.
"use strict";
var Motor = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/motor/legado.ts
  var legado_exports = {};
  __export(legado_exports, {
    INDICADORES_SETOR: () => INDICADORES_SETOR,
    MARGEM_RENDA: () => MARGEM_RENDA,
    PREMISSA_REAL: () => PREMISSA_REAL,
    SPREAD_CDI: () => SPREAD_CDI,
    acumulado12: () => acumulado12,
    aliqIR: () => aliqIR,
    analisaAcao: () => analisaAcao,
    analisaFii: () => analisaFii,
    aporteMensal: () => aporteMensal,
    cdiAnual: () => cdiAnual,
    cdiDaSelic: () => cdiDaSelic,
    cenarioFocus: () => cenarioFocus,
    classificaSetor: () => classificaSetor,
    comparaRF: () => comparaRF,
    comparaSetor: () => comparaSetor,
    diasCorridos: () => diasCorridos,
    diasUteis: () => diasUteis,
    fatorIpca: () => fatorIpca,
    fatorIpcaPeriodo: () => fatorIpcaPeriodo,
    fatorPre: () => fatorPre,
    ipcaEquilibrio: () => ipcaEquilibrio,
    ipcaVsPre: () => ipcaVsPre,
    juroReal: () => juroReal,
    marcacao: () => marcacao,
    mesesAteMeta: () => mesesAteMeta,
    nominalParaReal: () => nominalParaReal,
    notaFaixa: () => notaFaixa,
    notaLinear: () => notaLinear,
    numeroMagico: () => numeroMagico,
    precoBazin: () => precoBazin,
    precoGraham: () => precoGraham,
    simulate: () => simulate,
    tipoFii: () => tipoFii,
    valorAtualRF: () => valorAtualRF
  });

  // src/motor/motor.ts
  var aliqIR = (dias) => dias <= 180 ? 0.225 : dias <= 360 ? 0.2 : dias <= 720 ? 0.175 : 0.15;
  var MARGEM_RENDA = 0.25;
  function simulate(cfg) {
    const margem = cfg.margemRenda ?? MARGEM_RENDA;
    const nominal = Math.pow(1 + cfg.taxa / 100, 1 / 12) - 1;
    const r = cfg.real ? Math.pow((1 + cfg.taxa / 100) / (1 + cfg.inflacao / 100), 1 / 12) - 1 : nominal;
    let saldo = cfg.inicial, aportado = cfg.inicial;
    let mMeta = null, mRenda = null;
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
  var PREMISSA_REAL = 8;
  var nominalParaReal = (real, inflacao) => ((1 + real / 100) * (1 + inflacao / 100) - 1) * 100;
  var ipcaEquilibrio = (pre, real) => ((1 + pre / 100) / (1 + real / 100) - 1) * 100;
  var fatorPre = (pre, anos) => Math.pow(1 + pre / 100, anos);
  var fatorIpca = (real, ipca, anos) => Math.pow((1 + ipca / 100) * (1 + real / 100), anos);
  function resgate(valor, fator, anos, ipca) {
    const bruto = valor * fator;
    const ir = Math.max(0, bruto - valor) * aliqIR(Math.round(anos * 365));
    const liquido = bruto - ir;
    return { bruto, ir, liquido, real: liquido / Math.pow(1 + ipca / 100, anos) };
  }
  function ipcaVsPre({ valor, anos, pre, real, ipca }) {
    const p = resgate(valor, fatorPre(pre, anos), anos, ipca);
    const i = resgate(valor, fatorIpca(real, ipca, anos), anos, ipca);
    const dif = i.liquido - p.liquido;
    const vencedor = Math.abs(dif) < 5e-3 ? "empate" : dif > 0 ? "ipca" : "pre";
    return { pre: p, ipca: i, dif, vencedor, equilibrio: ipcaEquilibrio(pre, real) };
  }
  function acumulado12(mensal) {
    const out = [];
    for (let i = 11; i < mensal.length; i++) {
      const fator = mensal.slice(i - 11, i + 1).reduce((a, p) => a * (1 + p.value / 100), 1);
      out.push({ date: mensal[i].date, value: (fator - 1) * 100 });
    }
    return out;
  }
  var cdiAnual = (diario) => (Math.pow(1 + diario / 100, 252) - 1) * 100;
  var juroReal = (nominal, inflacao) => ((1 + nominal / 100) / (1 + inflacao / 100) - 1) * 100;
  var SPREAD_CDI = 0.1;
  var cdiDaSelic = (selic) => selic - SPREAD_CDI;
  function comparaRF({ valor, anos, selic, ipca, produtos }) {
    const cdi = cdiDaSelic(selic);
    return produtos.map((p) => {
      const m = Math.min(p.anosVenc, anos);
      const base = p.selic ? selic : cdi;
      const fator = p.idx === "cdi" ? Math.pow(1 + base / 100 * (p.taxa / 100), m) : p.idx === "pre" ? fatorPre(p.taxa, m) : fatorIpca(p.taxa, ipca, m);
      let bruto = valor * fator;
      if (p.anosVenc < anos) bruto *= Math.pow(1 + cdi / 100, anos - p.anosVenc);
      const status = p.anosVenc > anos ? "depois" : p.anosVenc < anos ? "antes" : "ok";
      if (status === "depois") return { ...p, status, bruto: null, ir: null, liquido: null, real: null };
      const ir = p.isento ? 0 : p.irBase != null ? Math.max(0, bruto - p.irBase) * aliqIR(p.irDias ?? NaN) : Math.max(0, bruto - valor) * aliqIR(Math.round(anos * 365));
      const liquido = bruto - ir;
      return { ...p, status, bruto, ir, liquido, real: liquido / Math.pow(1 + ipca / 100, anos) };
    });
  }
  function cenarioFocus(focus, anoInicial, anos, modo) {
    const at = (ind, ano, campo) => {
      const linhas = focus.filter((f) => f.indicador === ind);
      const alvo = linhas.filter((f) => Number(f.ano) <= ano).sort((a, b) => Number(b.ano) - Number(a.ano))[0] || linhas.sort((a, b) => Number(a.ano) - Number(b.ano))[0];
      return alvo ? alvo[campo] : null;
    };
    const anosPrazo = Array.from({ length: Math.max(1, Math.ceil(anos)) }, (_, k) => anoInicial + k);
    const media = (ind, campo) => {
      const v = anosPrazo.map((a) => at(ind, a, campo)).filter((x) => x != null);
      return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
    };
    const selicCampo = modo === "juros-caem" ? "minimo" : modo === "juros-sobem" ? "maximo" : "mediana";
    const ipcaCampo = modo === "inflacao-sobe" ? "maximo" : "mediana";
    return { selic: media("Selic", selicCampo), ipca: media("IPCA", ipcaCampo) };
  }
  var DIA = 864e5;
  var dataLocal = (d) => (/* @__PURE__ */ new Date(d + "T12:00:00")).getTime();
  var diasCorridos = (a, b) => Math.round((dataLocal(b) - dataLocal(a)) / DIA);
  function diasUteis(a, b) {
    let n = 0;
    for (let t = dataLocal(a) + DIA; t <= dataLocal(b); t += DIA) {
      const w = new Date(t).getDay();
      if (w !== 0 && w !== 6) n++;
    }
    return n;
  }
  function fatorIpcaPeriodo(mensal, inicio, fim, ipcaProj) {
    const mapa = new Map(mensal.map((p) => [p.date.slice(0, 7), p.value]));
    let [y, m] = inicio.slice(0, 7).split("-").map(Number);
    const [fy, fm] = fim.slice(0, 7).split("-").map(Number);
    let f = 1;
    while (y < fy || y === fy && m < fm) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      const v = mapa.get(k);
      f *= v !== void 0 ? 1 + v / 100 : Math.pow(1 + ipcaProj / 100, 1 / 12);
      if (++m > 12) {
        m = 1;
        y++;
      }
    }
    return f;
  }
  function marcacao({ qtd, puCompra, taxaCont, taxaMerc, dataCompra, dataAnalise, dataVenc, accrHoje = 1, accrVenc = 1, cdiTaxa, reinvestPct = 100 }) {
    if (dataAnalise >= dataVenc) return null;
    const r = taxaCont / 100, rm = taxaMerc / 100;
    const duDec = diasUteis(dataCompra, dataAnalise), duRem = diasUteis(dataAnalise, dataVenc), duTot = diasUteis(dataCompra, dataVenc);
    const dcDec = diasCorridos(dataCompra, dataAnalise), dcRem = diasCorridos(dataAnalise, dataVenc), dcTot = diasCorridos(dataCompra, dataVenc);
    const puTeorico = puCompra * accrHoje * Math.pow(1 + r, duDec / 252);
    const puMercado = puTeorico * Math.pow((1 + r) / (1 + rm), duRem / 252);
    const puVenc = puCompra * Math.pow(1 + r, duTot / 252) * accrVenc;
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
      puTeorico,
      puMercado,
      puVenc,
      valorTeorico: qtd * puTeorico,
      valorMercado: brutoVenda,
      lucroBruto: brutoVenda - custo,
      irVenda,
      liqVenda,
      vendaReaplicada: liqReinv,
      taxaReinv,
      brutoVenc,
      irVenc,
      liqVenc,
      diferenca: liqReinv - liqVenc,
      // Fração do ganho até o vencimento que a venda de hoje já entrega (bruto, antes do IR).
      // AUVP, Módulo 3: "se o título, muito antecipadamente, entregou 90% ou até 80% da rentabilidade contratada, você já pode vender".
      ganhoAntecipado: brutoVenc > custo ? (brutoVenda - custo) / (brutoVenc - custo) : null,
      duRem,
      dcRem
    };
  }
  function valorAtualRF({ aplicado, idx, taxa, data, hoje, cdiSerie = [], ipcaMensal = [], ipcaProj = 0 }) {
    const anos = diasCorridos(data, hoje) / 365;
    if (idx === "pre") return { valor: aplicado * Math.pow(1 + taxa / 100, anos), cobertura: true };
    if (idx === "ipca") {
      const fator2 = fatorIpcaPeriodo(ipcaMensal, data, hoje, ipcaProj) * Math.pow(1 + taxa / 100, anos);
      return { valor: aplicado * fator2, cobertura: ipcaMensal.length > 0 };
    }
    if (!cdiSerie.length) return { valor: null, cobertura: false };
    let fator = 1;
    for (const [d, v] of cdiSerie) {
      if (d >= data && d < hoje) fator *= 1 + taxa / 100 * (v / 100);
    }
    return { valor: aplicado * fator, cobertura: cdiSerie[0][0] <= data };
  }
  var taxaMensal = (taxaAa) => Math.pow(1 + taxaAa / 100, 1 / 12) - 1;
  function aporteMensal({ alvo, atual = 0, meses, taxaAa }) {
    if (!(meses > 0)) return null;
    const r = taxaMensal(taxaAa), n = meses;
    const futuroAtual = atual * Math.pow(1 + r, n);
    if (futuroAtual >= alvo) return 0;
    if (r === 0) return (alvo - atual) / n;
    return (alvo - futuroAtual) * r / (Math.pow(1 + r, n) - 1);
  }
  function mesesAteMeta({ alvo, atual = 0, aporte, taxaAa }) {
    if (atual >= alvo) return 0;
    const r = taxaMensal(taxaAa);
    if (r === 0) return aporte > 0 ? (alvo - atual) / aporte : null;
    const num = alvo * r + aporte, den = atual * r + aporte;
    if (num <= 0 || den <= 0) return null;
    return Math.log(num / den) / Math.log(1 + r);
  }
  var notaLinear = (v, zero, cem) => Math.max(0, Math.min(100, (v - zero) / (cem - zero) * 100));
  function notaFaixa(v, zeroBaixo, cemBaixo, cemAlto, zeroAlto) {
    if (v <= zeroBaixo || v >= zeroAlto) return 0;
    if (v < cemBaixo) return notaLinear(v, zeroBaixo, cemBaixo);
    if (v > cemAlto) return notaLinear(v, zeroAlto, cemAlto);
    return 100;
  }
  var pctBR = (v, d = 1) => (v * 100).toFixed(d).replace(".", ",") + "%";
  var numBR = (v, d = 2) => v.toFixed(d).replace(".", ",");
  var semAcento = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  var CRITERIOS_ACAO = [
    { id: "pl", nome: "P/L", peso: 13, zero: 25, cem: 8, negativoZera: true, valor: (f) => f.pl, fmt: "x" },
    { id: "pvp", nome: "P/VP", peso: 10, zero: 4, cem: 1, negativoZera: true, valor: (f) => f.pvp, fmt: "x" },
    { id: "evEbitda", nome: "EV/EBITDA", peso: 9, zero: 15, cem: 5, negativoZera: true, valor: (f) => f.evEbitda, fmt: "x" },
    { id: "roe", nome: "ROE", peso: 13, zero: 0, cem: 0.2, valor: (f) => f.roe, fmt: "%" },
    { id: "roic", nome: "ROIC", peso: 10, zero: 0, cem: 0.15, valor: (f) => f.roic, fmt: "%" },
    { id: "margem", nome: "Margem l\xEDquida", peso: 10, zero: 0, cem: 0.2, valor: (f) => f.margemLiq, fmt: "%" },
    { id: "divida", nome: "D\xEDvida l\xEDquida / patrim\xF4nio", peso: 10, zero: 3, cem: 0, valor: (f) => f.divLiqPatrim, fmt: "x" },
    { id: "cresc", nome: "Crescimento da receita (5 anos)", peso: 10, zero: -0.1, cem: 0.15, valor: (f) => f.crescRec5a, fmt: "%" },
    { id: "dy", nome: "Dividend yield", peso: 15, zero: 0, cem: 0.1, valor: (f) => f.dy, fmt: "%" }
  ];
  var FAIXA_PVP_FII = [0.5, 0.8, 1, 1.3];
  var FAIXA_DY_FII = [0.04, 0.08, 0.12, 0.2];
  var CRITERIOS_FII_PAPEL = [
    { id: "dy", nome: "Dividend yield", peso: 30, faixa: FAIXA_DY_FII, valor: (f) => f.dy, fmt: "%" },
    { id: "pvp", nome: "P/VP", peso: 25, faixa: FAIXA_PVP_FII, negativoZera: true, valor: (f) => f.pvp, fmt: "x" },
    { id: "ffo", nome: "FFO cobre o dividendo", peso: 25, zero: 0.6, cem: 1, valor: (f) => ratioFfo(f), fmt: "x" },
    { id: "liq", nome: "Liquidez", peso: 20, zero: 1e5, cem: 2e6, valor: (f) => f.liquidez, fmt: "R$" }
  ];
  var CRITERIOS_FII_TIJOLO = [
    { id: "dy", nome: "Dividend yield", peso: 25, faixa: FAIXA_DY_FII, valor: (f) => f.dy, fmt: "%" },
    { id: "pvp", nome: "P/VP", peso: 20, faixa: FAIXA_PVP_FII, negativoZera: true, valor: (f) => f.pvp, fmt: "x" },
    { id: "ffo", nome: "FFO cobre o dividendo", peso: 15, zero: 0.6, cem: 1, valor: (f) => ratioFfo(f), fmt: "x" },
    { id: "liq", nome: "Liquidez", peso: 10, zero: 1e5, cem: 2e6, valor: (f) => f.liquidez, fmt: "R$" },
    { id: "vacancia", nome: "Vac\xE2ncia m\xE9dia", peso: 15, zero: 0.2, cem: 0, valor: (f) => f.vacancia, fmt: "%" },
    { id: "capRate", nome: "Cap rate", peso: 10, zero: 0.05, cem: 0.1, valor: (f) => f.capRate, fmt: "%" },
    { id: "imoveis", nome: "N\xFAmero de im\xF3veis", peso: 5, zero: 1, cem: 10, valor: (f) => f.imoveis, fmt: "n" }
  ];
  function ratioFfo(f) {
    return f.ffoYield > 0 && f.dy > 0 ? f.ffoYield / f.dy : null;
  }
  function tipoFii(segmento, { imoveis, nome } = {}) {
    const s = semAcento(segmento), n = semAcento(nome);
    if (/papel|\bcri\b|titulos|val\.? ?mob|fundo de fundos|fundos de fundos|\bfof\b/.test(s)) return "papel";
    if (imoveis === 0) return "papel";
    if (/receb|securit|\bcri\b|credito imob|rendimentos imob/.test(n)) return "papel";
    return "tijolo";
  }
  function pontua(criterios, fund) {
    const linhas = criterios.map((c) => {
      const v = c.valor(fund);
      const ausente = v == null || !isFinite(v) || v === 0;
      let nota2 = null;
      if (!ausente) {
        nota2 = c.negativoZera && v < 0 ? 0 : c.faixa ? notaFaixa(v, ...c.faixa) : notaLinear(v, c.zero, c.cem);
      }
      return { id: c.id, nome: c.nome, peso: c.peso, valor: ausente ? null : v, fmt: c.fmt, nota: nota2 == null ? null : Math.round(nota2) };
    });
    const usados = linhas.filter((l) => l.nota != null);
    const pesoTotal = criterios.reduce((a, c) => a + c.peso, 0);
    const pesoUsado = usados.reduce((a, l) => a + l.peso, 0);
    const nota = usados.length ? usados.reduce((a, l) => a + l.nota * l.peso, 0) / pesoUsado : null;
    return { nota: nota == null ? null : Math.round(nota), cobertura: pesoUsado / pesoTotal, criterios: linhas };
  }
  var faixaNota = (n) => n == null ? "sem dados" : n >= 70 ? "alta" : n >= 50 ? "m\xE9dia" : "baixa";
  function analisaAcao(f) {
    const r = pontua(CRITERIOS_ACAO, f);
    const alertas = [];
    if (f.pl != null && f.pl < 0) alertas.push("Preju\xEDzo nos \xFAltimos 12 meses (P/L negativo).");
    if (f.liquidez != null && f.liquidez > 0 && f.liquidez < 1e6) alertas.push("Liquidez baixa: negocia\xE7\xE3o pequena, o pre\xE7o pode se afastar do valor justo na venda.");
    return { kind: "acao", tipo: "A\xE7\xE3o", ...r, faixa: faixaNota(r.nota), alertas };
  }
  function analisaFii(f, { nome } = {}) {
    const tipo = tipoFii(f.segmento, { imoveis: f.imoveis, nome });
    const r = pontua(tipo === "papel" ? CRITERIOS_FII_PAPEL : CRITERIOS_FII_TIJOLO, f);
    const seg = semAcento(f.segmento);
    const alertas = [];
    const dy = f.dy ?? 0, pvp = f.pvp ?? 0, ffo = f.ffoYield ?? 0;
    if (f.vacancia != null && f.vacancia >= 0.2 && tipo === "tijolo") alertas.push(`Vac\xE2ncia alta (${pctBR(f.vacancia)}, dado do Fundamentus): im\xF3vel vazio custa condom\xEDnio e IPTU. Confira no relat\xF3rio do fundo.`);
    if (ffo > 0 && dy > 0 && ffo < dy) alertas.push("O dividendo passa do FFO: o fundo distribui mais do que gera de caixa, o que n\xE3o se sustenta no longo prazo.");
    if (dy > 0.14) alertas.push(`Dividend yield muito alto (${pctBR(dy)}): pode ser calote nos receb\xEDveis, venda de im\xF3veis ou um pagamento extraordin\xE1rio. Desconfie do "bom demais para ser verdade".`);
    if (pvp > 0 && pvp < 0.5) alertas.push(`P/VP muito baixo (${numBR(pvp)}): quando algo que vale R$ 1,00 sai por menos de R$ 0,50, o mercado costuma estar vendo um problema (vac\xE2ncia, im\xF3vel obsoleto, inadimpl\xEAncia).`);
    if (tipo === "tijolo" && f.imoveis === 1) alertas.push("Monoativo: um \xFAnico im\xF3vel. Se o inquilino sair, a renda vai a zero e a despesa continua.");
    if (/desenvolv/.test(seg)) alertas.push("Fundo de desenvolvimento: depende de obra e venda; mais arriscado e n\xE3o indicado para quem quer viver de renda.");
    if (/hotel|hospital|educ|escola/.test(seg)) alertas.push("Hot\xE9is, hospitais e escolas costumam ter um \xFAnico inquilino e receitas mais sens\xEDveis a ciclos.");
    if (/fundo de fundos|fundos de fundos|\bfof\b/.test(seg)) alertas.push("Fundo de fundos: voc\xEA paga a taxa do FOF e tamb\xE9m a dos fundos que ele compra.");
    if (f.liquidez != null && f.liquidez > 0 && f.liquidez < 1e6) alertas.push("Liquidez baixa para um FII.");
    return { kind: "fii", tipo: tipo === "papel" ? "Papel / fundo de fundos" : "Tijolo", segmento: f.segmento || null, ...r, faixa: faixaNota(r.nota), alertas };
  }
  function precoGraham(preco, pl, pvp) {
    if (!(preco > 0 && pl > 0 && pvp > 0)) return null;
    const justo = Math.sqrt(22.5 * (preco / pl) * (preco / pvp));
    return { justo, margem: justo / preco - 1 };
  }
  var DY_BAZIN = 0.06;
  function precoBazin(preco, dy) {
    if (!(preco > 0 && dy > 0)) return null;
    const teto = preco * dy / DY_BAZIN;
    return { teto, margem: teto / preco - 1 };
  }
  function numeroMagico(dy, preco) {
    if (!(dy > 0 && preco > 0)) return null;
    const cotas = Math.ceil(12 / dy - 1e-9);
    return { cotas, investimento: cotas * preco };
  }
  function classificaSetor(setor, industria) {
    const s = semAcento(setor), i = semAcento(industria);
    if (/petroleo|\bgas\b|biocombust|combustiv/.test(i)) return { tipo: "ciclico", texto: "Setor c\xEDclico (petr\xF3leo, g\xE1s e combust\xEDveis): pode ser lucrativo, mas tem mais risco e exige aten\xE7\xE3o." };
    if (/aere|aviac/.test(i)) return { tipo: "atencao", texto: "Avia\xE7\xE3o: setor regulado, com custos (aeronaves, combust\xEDvel, taxas) fora do controle da empresa." };
    if (/financ|banc|segur/.test(s) || /materiais basicos/.test(s) || /saude/.test(s) || /medicament|hospital|saude/.test(i) || /saneamento|utilidade/.test(s) || /energia eletrica|agua/.test(i)) return { tipo: "perene", texto: "Setor perene, entre os que o AUVP recomenda (financeiro, materiais b\xE1sicos, sa\xFAde ou utilidade p\xFAblica)." };
    if (/consumo ciclico/.test(s) || /varejo/.test(i)) return { tipo: "ciclico", texto: "Consumo c\xEDclico e varejo: setor sens\xEDvel \xE0 economia, com maior taxa de fal\xEAncia." };
    if (/telecom/.test(s)) return { tipo: "atencao", texto: "Telecomunica\xE7\xF5es: setor exposto a regula\xE7\xE3o e a mudan\xE7as tecnol\xF3gicas." };
    return { tipo: "neutro", texto: null };
  }
  var INDICADORES_SETOR = [
    { id: "pl", nome: "P/L", campo: "pl", melhor: "menor", positivo: true, fmt: "x" },
    { id: "pvp", nome: "P/VP", campo: "pvp", melhor: "menor", positivo: true, fmt: "x" },
    { id: "dy", nome: "DY", campo: "dy", melhor: "maior", fmt: "%" },
    { id: "roe", nome: "ROE", campo: "roe", melhor: "maior", fmt: "%" },
    { id: "margem", nome: "Margem l\xEDquida", campo: "margemLiq", melhor: "maior", fmt: "%" },
    { id: "divida", nome: "D\xEDv. l\xEDq./patrim\xF4nio", campo: "divLiqPatrim", melhor: "menor", fmt: "x" },
    { id: "cresc", nome: "Cresc. receita 5a", campo: "crescRec5a", melhor: "maior", fmt: "%" }
  ];
  function comparaSetor(itens) {
    const grupos = /* @__PURE__ */ new Map();
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
        const validos = lista.map((it) => ({ t: it.ticker, v: it.fund[ind.campo] })).filter((x) => typeof x.v === "number" && isFinite(x.v) && x.v !== 0 && (!ind.positivo || x.v > 0));
        if (validos.length < 2) continue;
        const alvo = ind.melhor === "menor" ? Math.min(...validos.map((x) => x.v)) : Math.max(...validos.map((x) => x.v));
        melhores[ind.id] = validos.filter((x) => x.v === alvo).map((x) => x.t);
      }
      out.push({ setor, tickers: lista.map((it) => it.ticker), melhores });
    }
    return out;
  }
  return __toCommonJS(legado_exports);
})();
