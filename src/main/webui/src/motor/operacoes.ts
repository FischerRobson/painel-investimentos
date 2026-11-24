// Operações (compras, vendas e eventos), preço médio, lucro realizado, imposto de renda, declaração anual, proventos e
// rentabilidade sem aportes. Contas puras: as páginas só buscam os dados e mostram. Todos os valores em reais.
//
// Regras usadas (pessoa física, conferidas em nov/2026; não substituem o contador):
// - Preço médio: custo das compras + taxas, dividido pela quantidade. Venda não muda o preço médio; zerou, recomeça.
// - Day trade (compra e venda do mesmo ativo no mesmo dia, em ações, FIIs, ETFs e BDRs): a parte casada no dia usa os
//   preços do próprio dia e é apurada à parte (20%, IRRF de 1% sobre o lucro).
// - Operações comuns: ações, ETFs e BDRs pagam 15%, com prejuízo compensado entre si. Ações têm isenção quando as vendas
//   de ações no mês (operações comuns) somam até R$ 20 mil; ETF e BDR não têm. IRRF de 0,005% sobre as vendas.
// - FII: 20% sobre o lucro, sem isenção; prejuízo só compensa com FII. Rendimentos mensais de FII são isentos.
// - Cripto (exchange no Brasil): isenção quando as vendas do mês somam até R$ 35 mil; acima disso, 15% sobre o ganho do mês
//   (sem compensação de perdas; alíquotas maiores acima de R$ 5 milhões não são tratadas).
// - Exterior (Lei 14.754/2023): 15% sobre o ganho anual em reais, na declaração de ajuste; perdas compensam anos seguintes.
// - DARF: código 6015 (renda variável) e 4600 (cripto), vence no último dia útil do mês seguinte; abaixo de R$ 10 acumula.

//
// Toda mudança na carteira é uma operação, e operação lançada não se edita nem se apaga: um erro se desfaz com um estorno,
// que aponta para a original (as duas ficam no histórico). O servidor recusa alterar ou remover operações e monta as
// listas da carteira a partir delas (WalletLedger.java, com as mesmas regras de quantidadesDaCarteira, titulosDaCarteira
// e moedasDaCarteira, abaixo).
// - qtd: unidades do ativo (ações, cotas, moedas); na renda fixa, o valor aplicado (principal) que entra ou sai do título.
// - valor: reais que saíram da conta (compra, aplicação, com as taxas) ou entraram (venda, resgate, já sem taxas e IR).
// - valorPresente: valor da posição no dia da operação, logo antes dela (para auditar).
// - registrado: quando o servidor recebeu a operação (ele mesmo preenche). estorna: id da operação estornada.

import type { Indexador, TituloRF } from "./motor";

export type Classe = "acao" | "fii" | "etf" | "bdr" | "exterior" | "cripto";
export type ClasseOp = Classe | "rf" | "moeda";
export type TipoOperacao = "compra" | "venda" | "desdobramento" | "grupamento" | "bonificacao" | "aplicacao" | "resgate" | "estorno";
export type TermosRF = {
  nome: string; tipo: string; idx: Indexador; taxa: number; venc?: string | null; isento?: boolean;
  instituicao?: string | null; liquidezDiaria?: boolean;
};
export type Operacao = {
  id: string; data: string; tipo: TipoOperacao; classe: ClasseOp; ativo: string;
  qtd?: number; preco?: number; taxas?: number; cambio?: number; fator?: number; inicial?: boolean; obs?: string;
  valor?: number; valorPresente?: number; registrado?: string; estorna?: string; titulo?: TermosRF;
};
export type TipoProvento = "dividendo" | "jcp" | "rendimento" | "outro";
export type Provento = { id: string; data: string; ativo: string; tipo: TipoProvento; valor: number; irRetido?: number };

export const NOME_CLASSE: Record<Classe, string> = { acao: "Ação", fii: "FII", etf: "ETF", bdr: "BDR", exterior: "Exterior", cripto: "Cripto" };
export const NOME_CLASSE_OP: Record<ClasseOp, string> = { ...NOME_CLASSE, rf: "Renda fixa", moeda: "Moeda" };
export const NOME_TIPO: Record<TipoOperacao, string> = {
  compra: "Compra", venda: "Venda", desdobramento: "Desdobramento", grupamento: "Grupamento", bonificacao: "Bonificação",
  aplicacao: "Aplicação", resgate: "Resgate", estorno: "Estorno",
};
export const TIPOS_RV: TipoOperacao[] = ["compra", "venda", "desdobramento", "grupamento", "bonificacao"];
export type OpRV = Operacao & { classe: Classe };
export const ehRV = (o: Operacao): o is OpRV => o.classe !== "rf" && o.classe !== "moeda";

// Operações que valem: sem os estornos e sem as operações estornadas
export function efetivas(ops: Operacao[]): Operacao[] {
  const estornadas = new Set(ops.filter(o => o.tipo === "estorno").map(o => o.estorna));
  return ops.filter(o => o.tipo !== "estorno" && !estornadas.has(o.id));
}
export const estornadas = (ops: Operacao[]): Set<string> => new Set(ops.filter(o => o.tipo === "estorno" && o.estorna).map(o => o.estorna!));

// Estorno de uma operação (a original continua no histórico, marcada como estornada)
export function estorno(o: Operacao, { id, data, motivo }: { id: string; data: string; motivo?: string }): Operacao {
  return { id, data, tipo: "estorno", classe: o.classe, ativo: o.ativo, estorna: o.id, ...(motivo?.trim() ? { obs: motivo.trim().slice(0, 200) } : {}) };
}
const TEM_DAY_TRADE: Classe[] = ["acao", "fii", "etf", "bdr"];

export type Posicao = { ativo: string; classe: Classe; qtd: number; custo: number; pm: number; realizado: number };
export type Realizado = {
  data: string; ativo: string; classe: Classe; qtd: number;
  venda: number;   // valor bruto da venda (qtd × preço × câmbio): é o que conta para os limites de isenção
  liquido: number; // venda − taxas
  custo: number; lucro: number; dayTrade: boolean;
};

const EPS = 1e-9;
const emReais = (o: Operacao) => (o.preco ?? 0) * (o.cambio ?? 1);

// Percorre as operações em ordem de data e devolve as posições, as vendas realizadas e os avisos (vender mais do que tem).
// ate: considera só as operações até essa data (inclusive), para a posição em 31/12.
// Só ações, FIIs, ETFs, BDRs, exterior e cripto; estornos e operações estornadas ficam de fora.
export function processar(todas: Operacao[], ate?: string): { posicoes: Record<string, Posicao>; realizados: Realizado[]; alertas: string[] } {
  const ops = efetivas(todas).filter(ehRV) as OpRV[];
  const posicoes: Record<string, Posicao> = {};
  const realizados: Realizado[] = [];
  const alertas: string[] = [];
  const porDia = new Map<string, OpRV[]>();
  for (const o of ops) {
    if (ate && o.data > ate) continue;
    const k = o.data + "|" + o.ativo;
    porDia.set(k, [...(porDia.get(k) ?? []), o]);
  }
  for (const k of [...porDia.keys()].sort()) {
    const dia = porDia.get(k)!;
    const { data, ativo } = dia[0];
    const classe = dia[dia.length - 1].classe;
    const p = posicoes[ativo] ??= { ativo, classe, qtd: 0, custo: 0, pm: 0, realizado: 0 };
    p.classe = classe;
    // eventos valem antes dos negócios do dia
    for (const o of dia) {
      if (o.tipo === "desdobramento" && o.fator) p.qtd *= o.fator;
      if (o.tipo === "grupamento" && o.fator) p.qtd /= o.fator;
      if (o.tipo === "bonificacao") { p.qtd += o.qtd ?? 0; p.custo += (o.qtd ?? 0) * emReais(o); }
    }
    const compras = dia.filter(o => o.tipo === "compra"), vendas = dia.filter(o => o.tipo === "venda");
    let bq = soma(compras, o => o.qtd ?? 0), bCusto = soma(compras, o => (o.qtd ?? 0) * emReais(o) + (o.taxas ?? 0));
    let sq = soma(vendas, o => o.qtd ?? 0), sBruto = soma(vendas, o => (o.qtd ?? 0) * emReais(o)), sTaxas = soma(vendas, o => o.taxas ?? 0);
    // day trade: a parte casada no dia
    const dt = TEM_DAY_TRADE.includes(classe) ? Math.min(bq, sq) : 0;
    if (dt > EPS) {
      const custo = bCusto * dt / bq, venda = sBruto * dt / sq, liquido = (sBruto - sTaxas) * dt / sq;
      realizados.push({ data, ativo, classe, qtd: dt, venda, liquido, custo, lucro: liquido - custo, dayTrade: true });
      p.realizado += liquido - custo;
      bCusto -= custo; bq -= dt; sBruto -= venda; sTaxas -= (sTaxas * dt / sq); sq -= dt;
    }
    if (bq > EPS) { p.qtd += bq; p.custo += bCusto; }
    if (sq > EPS) {
      let q = sq;
      if (q > p.qtd + EPS) {
        alertas.push(`${ativo} em ${data.split("-").reverse().join("/")}: venda de ${fmtQ(q)} com só ${fmtQ(p.qtd)} em carteira`);
        const fator = p.qtd / q; sBruto *= fator; sTaxas *= fator; q = p.qtd;
      }
      if (q > EPS) {
        const pm = p.qtd ? p.custo / p.qtd : 0, custo = pm * q, liquido = sBruto - sTaxas;
        realizados.push({ data, ativo, classe, qtd: q, venda: sBruto, liquido, custo, lucro: liquido - custo, dayTrade: false });
        p.realizado += liquido - custo;
        p.qtd -= q; p.custo -= custo;
      }
    }
    if (p.qtd < EPS) { p.qtd = 0; p.custo = 0; }
    p.pm = p.qtd ? p.custo / p.qtd : 0;
  }
  return { posicoes, realizados, alertas };
}

const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const fmtQ = (q: number) => (+q.toFixed(8)).toLocaleString("pt-BR", { maximumFractionDigits: 8 });

// ---------- Imposto de renda mensal ----------
export type MesIR = {
  mes: string; // AAAA-MM
  vendasAcoes: number; lucroAcoes: number; acoesIsentas: boolean;
  lucroEtfBdr: number; lucroDayTrade: number; lucroFii: number;
  vendasCripto: number; lucroCripto: number; criptoIsenta: boolean;
  baseComum: number; baseDayTrade: number; baseFii: number; baseCripto: number;
  impostoRV: number; irrf: number; darfRV: number; acumuladoRV: number; // darfRV: a pagar neste mês (≥ R$ 10)
  impostoCripto: number; darfCripto: number; acumuladoCripto: number;
  prejuizoComum: number; prejuizoDayTrade: number; prejuizoFii: number; // saldo a compensar depois do mês
  vencimento: string;
};
export const LIMITE_ACOES = 20_000, LIMITE_CRIPTO = 35_000, DARF_MINIMO = 10;

export function apurarIR(realizados: Realizado[]): MesIR[] {
  const meses = [...new Set(realizados.filter(r => r.classe !== "exterior").map(r => r.data.slice(0, 7)))].sort();
  let pComum = 0, pDT = 0, pFii = 0, credIrrf = 0, acumRV = 0, acumCripto = 0;
  const out: MesIR[] = [];
  for (const mes of meses) {
    const rs = realizados.filter(r => r.classe !== "exterior" && r.data.startsWith(mes));
    const comuns = rs.filter(r => !r.dayTrade);
    const acoes = comuns.filter(r => r.classe === "acao"), etfBdr = comuns.filter(r => r.classe === "etf" || r.classe === "bdr");
    const vendasAcoes = soma(acoes, r => r.venda), lucroAcoes = soma(acoes, r => r.lucro);
    const acoesIsentas = vendasAcoes <= LIMITE_ACOES;
    const lucroEtfBdr = soma(etfBdr, r => r.lucro);
    const lucroDayTrade = soma(rs.filter(r => r.dayTrade && r.classe !== "fii"), r => r.lucro);
    const lucroFii = soma(rs.filter(r => r.classe === "fii"), r => r.lucro);
    const cripto = rs.filter(r => r.classe === "cripto");
    const vendasCripto = soma(cripto, r => r.venda), lucroCripto = soma(cripto, r => r.lucro);
    const criptoIsenta = vendasCripto <= LIMITE_CRIPTO;

    // operações comuns: lucro isento de ações fica fora; prejuízo de ações entra mesmo em mês isento
    const comum = (acoesIsentas ? Math.min(0, lucroAcoes) : lucroAcoes) + lucroEtfBdr;
    const compensa = (r: number, p: number): [number, number] => r > 0 ? [r - Math.min(r, p), p - Math.min(r, p)] : [0, p - r];
    let baseComum, baseDayTrade, baseFii;
    [baseComum, pComum] = compensa(comum, pComum);
    [baseDayTrade, pDT] = compensa(lucroDayTrade, pDT);
    [baseFii, pFii] = compensa(lucroFii, pFii);
    const impostoRV = baseComum * 0.15 + baseDayTrade * 0.20 + baseFii * 0.20;
    // IRRF retido pela corretora: 0,005% das vendas comuns e 1% do lucro de day trade; abate o imposto (o que sobra fica de crédito)
    const lucroDTTotal = soma(rs.filter(r => r.dayTrade), r => r.lucro);
    const irrf = 0.00005 * soma(comuns.filter(r => r.classe !== "cripto"), r => r.venda) + 0.01 * Math.max(0, lucroDTTotal);
    credIrrf += irrf;
    const abatido = Math.min(credIrrf, impostoRV);
    credIrrf -= abatido;
    const devidoRV = impostoRV - abatido + acumRV;
    const darfRV = devidoRV >= DARF_MINIMO ? devidoRV : 0;
    acumRV = devidoRV >= DARF_MINIMO ? 0 : devidoRV;

    const baseCripto = criptoIsenta ? 0 : Math.max(0, lucroCripto);
    const impostoCripto = baseCripto * 0.15;
    const devidoCripto = impostoCripto + acumCripto;
    const darfCripto = devidoCripto >= DARF_MINIMO ? devidoCripto : 0;
    acumCripto = devidoCripto >= DARF_MINIMO ? 0 : devidoCripto;

    out.push({
      mes, vendasAcoes, lucroAcoes, acoesIsentas, lucroEtfBdr, lucroDayTrade, lucroFii, vendasCripto, lucroCripto, criptoIsenta,
      baseComum, baseDayTrade, baseFii, baseCripto, impostoRV, irrf, darfRV, acumuladoRV: acumRV,
      impostoCripto, darfCripto, acumuladoCripto: acumCripto,
      prejuizoComum: pComum, prejuizoDayTrade: pDT, prejuizoFii: pFii, vencimento: ultimoDiaUtil(proximoMes(mes)),
    });
  }
  return out;
}

// Exterior: ganho do ano em reais, compensando perdas de anos anteriores
export type AnoExterior = { ano: number; lucro: number; base: number; imposto: number; prejuizo: number };
export function apurarExterior(realizados: Realizado[]): AnoExterior[] {
  const anos = [...new Set(realizados.filter(r => r.classe === "exterior").map(r => +r.data.slice(0, 4)))].sort();
  let prej = 0;
  return anos.map(ano => {
    const lucro = soma(realizados.filter(r => r.classe === "exterior" && r.data.startsWith(String(ano))), r => r.lucro);
    const base = lucro > 0 ? lucro - Math.min(lucro, prej) : 0;
    prej = lucro > 0 ? prej - Math.min(lucro, prej) : prej - lucro;
    return { ano, lucro, base, imposto: base * 0.15, prejuizo: prej };
  });
}

// ---------- Declaração anual (IRPF) ----------
export type BemDireito = { ativo: string; classe: Classe; grupo: string; codigo: string; qtdAntes: number; custoAntes: number; qtd: number; custo: number; discriminacao: string };
const STABLES = ["USDT", "USDC"];
export function codigoBem(classe: Classe, ativo: string): { grupo: string; codigo: string } {
  switch (classe) {
    case "acao": case "exterior": return { grupo: "03 – Participações societárias", codigo: "01 – Ações" };
    case "fii": return { grupo: "07 – Fundos", codigo: "03 – Fundos de investimento imobiliário (FII)" };
    case "etf": return { grupo: "07 – Fundos", codigo: "confira no programa (fundo de índice/ETF)" };
    case "bdr": return { grupo: "04 – Aplicações e investimentos", codigo: "04 – Ativos negociados em bolsa no Brasil (BDR)" };
    case "cripto": return ativo === "BTC" ? { grupo: "08 – Criptoativos", codigo: "01 – Bitcoin" }
      : STABLES.includes(ativo) ? { grupo: "08 – Criptoativos", codigo: "03 – Stablecoins" } : { grupo: "08 – Criptoativos", codigo: "02 – Outras criptomoedas (altcoins)" };
  }
}

// Bens e direitos: situação em 31/12 do ano anterior e do ano, pelo custo de aquisição
export function bensEDireitos(ops: Operacao[], ano: number): BemDireito[] {
  const antes = processar(ops, `${ano - 1}-12-31`).posicoes, agora = processar(ops, `${ano}-12-31`).posicoes;
  const ativos = [...new Set([...Object.keys(antes), ...Object.keys(agora)])].sort();
  return ativos.map(ativo => {
    const a = antes[ativo], z = agora[ativo];
    const classe = (z ?? a).classe;
    const { grupo, codigo } = codigoBem(classe, ativo);
    const qtd = z?.qtd ?? 0, custo = z?.custo ?? 0;
    const unidade = classe === "fii" ? "cotas" : classe === "cripto" ? "unidades" : "ações";
    const discriminacao = qtd
      ? `${fmtQ(qtd)} ${unidade} de ${ativo}${classe === "exterior" ? " (exterior)" : ""}, custo médio de R$ ${(custo / qtd).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Corretora/CNPJ: ____`
      : `${ativo}: vendido durante o ano`;
    return { ativo, classe, grupo, codigo, qtdAntes: a?.qtd ?? 0, custoAntes: a?.custo ?? 0, qtd, custo, discriminacao };
  }).filter(b => b.qtd || b.qtdAntes);
}

// Rendimentos do ano para a declaração: isentos e de tributação exclusiva
export type RendimentosAno = {
  dividendos: { ativo: string; valor: number }[];
  rendimentosFii: { ativo: string; valor: number }[];
  jcp: { ativo: string; valor: number; irRetido: number }[];
  outros: { ativo: string; valor: number }[];
  lucroIsentoAcoes: number;  // vendas de ações até R$ 20 mil no mês
  lucroIsentoCripto: number; // vendas de cripto até R$ 35 mil no mês
};
export function rendimentosDoAno(proventos: Provento[], realizados: Realizado[], ano: number): RendimentosAno {
  const doAno = proventos.filter(p => p.data.startsWith(String(ano)));
  const porAtivo = (tipo: TipoProvento) => {
    const m = new Map<string, { valor: number; irRetido: number }>();
    for (const p of doAno.filter(x => x.tipo === tipo)) {
      const v = m.get(p.ativo) ?? { valor: 0, irRetido: 0 };
      m.set(p.ativo, { valor: v.valor + p.valor, irRetido: v.irRetido + (p.irRetido ?? 0) });
    }
    return [...m.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([ativo, v]) => ({ ativo, ...v }));
  };
  const meses = apurarIR(realizados).filter(m => m.mes.startsWith(String(ano)));
  return {
    dividendos: porAtivo("dividendo").map(({ ativo, valor }) => ({ ativo, valor })),
    rendimentosFii: porAtivo("rendimento").map(({ ativo, valor }) => ({ ativo, valor })),
    jcp: porAtivo("jcp"),
    outros: porAtivo("outro").map(({ ativo, valor }) => ({ ativo, valor })),
    lucroIsentoAcoes: soma(meses.filter(m => m.acoesIsentas && m.lucroAcoes > 0), m => m.lucroAcoes),
    lucroIsentoCripto: soma(meses.filter(m => m.criptoIsenta && m.lucroCripto > 0), m => m.lucroCripto),
  };
}

// ---------- Proventos sugeridos ----------
// Cada pagamento do histórico (data-ex e valor por ação) × a quantidade que você tinha no dia anterior à data-ex.
// FII vira "rendimento"; o resto, "dividendo" (o Yahoo não separa JCP: ajuste o tipo se for o caso).
export function sugerirProventos(ops: Operacao[], historico: Record<string, { date: string; amount: number }[]>, ja: Provento[]): Provento[] {
  const out: Provento[] = [];
  for (const [ativo, pagamentos] of Object.entries(historico)) {
    for (const pg of pagamentos) {
      const vespera = somaDias(pg.date, -1);
      const p = processar(ops.filter(o => o.ativo === ativo), vespera).posicoes[ativo];
      if (!p?.qtd) continue;
      if (ja.some(x => x.ativo === ativo && Math.abs(diasEntre(x.data, pg.date)) <= 40 && Math.abs(x.valor - p.qtd * pg.amount) < 0.02 * p.qtd * pg.amount + 0.01)) continue;
      out.push({ id: `sug-${ativo}-${pg.date}`, data: pg.date, ativo, tipo: p.classe === "fii" ? "rendimento" : "dividendo", valor: +(p.qtd * pg.amount).toFixed(2) });
    }
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

// ---------- Rentabilidade sem aportes (TWR) ----------
// Entre duas fotos, o retorno é (valor de hoje − dinheiro que entrou no período) ÷ valor anterior. Compras e aplicações em
// renda fixa contam como dinheiro entrando; vendas e proventos, como dinheiro saindo (o painel não acompanha o caixa).
// Aplicações em renda fixa contam pela data delas mesmo quando eram saldo inicial (a data é a da aplicação de verdade).
// titulosSemOperacao: títulos antigos que ainda não viraram operação (contam como aplicados na data deles).
export type Fluxo = { data: string; valor: number };
export function fluxosDasOperacoes(todas: Operacao[], proventos: Provento[], titulosSemOperacao: { data: string; aplicado: number }[] = []): Fluxo[] {
  const ops = efetivas(todas);
  return [
    ...ops.filter(o => (o.tipo === "compra" && !o.inicial) || o.tipo === "venda" || o.tipo === "resgate" || o.tipo === "aplicacao").map(o => ({
      data: o.data, valor: (o.tipo === "compra" || o.tipo === "aplicacao" ? 1 : -1) * valorDaOperacao(o),
    })),
    ...proventos.map(p => ({ data: p.data, valor: -p.valor })),
    ...titulosSemOperacao.map(a => ({ data: a.data, valor: a.aplicado })),
  ];
}

// Reais que saíram (compra, aplicação) ou entraram (venda, resgate) da conta. Operações antigas, sem valor guardado, usam
// quantidade × preço × câmbio, com as taxas.
export function valorDaOperacao(o: Operacao): number {
  if (o.valor != null) return o.valor;
  if (o.classe === "rf") return o.qtd ?? 0;
  const bruto = (o.qtd ?? 0) * emReais(o);
  return o.tipo === "compra" ? bruto + (o.taxas ?? 0) : o.tipo === "venda" ? bruto - (o.taxas ?? 0) : bruto;
}
export function rentabilidade(pontos: { data: string; valor: number }[], fluxos: Fluxo[]): { serie: { data: string; acumulado: number }[]; total: number | null } {
  const ps = [...pontos].sort((a, b) => a.data.localeCompare(b.data));
  if (ps.length < 2) return { serie: [], total: null };
  let f = 1;
  const serie = [{ data: ps[0].data, acumulado: 0 }];
  for (let i = 1; i < ps.length; i++) {
    const ant = ps[i - 1], at = ps[i];
    const entrou = soma(fluxos.filter(x => x.data > ant.data && x.data <= at.data), x => x.valor);
    if (ant.valor > 0) f *= (at.valor - entrou) / ant.valor;
    serie.push({ data: at.data, acumulado: (f - 1) * 100 });
  }
  return { serie, total: (f - 1) * 100 };
}

// ---------- Datas ----------
const proximoMes = (mes: string) => { const [y, m] = mes.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const diasEntre = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5);

// Feriados da B3 (os mesmos do backend, util/B3Calendar): fixos, 24/12, 31/12 e os que dependem da Páscoa
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(ano, mes - 1, dia, 12);
}
export function ehDiaDePregao(iso: string): boolean {
  const d = new Date(iso + "T12:00:00"), dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const md = iso.slice(5);
  if (["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-24", "12-25", "12-31"].includes(md)) return false;
  if (md === "11-20" && d.getFullYear() >= 2024) return false;
  const p = pascoa(d.getFullYear()).getTime(), dia = 864e5;
  return ![-48, -47, -2, 60].some(n => Math.round((d.getTime() - p) / dia) === n);
}
export function ultimoDiaUtil(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m, 0, 12); // último dia do mês
  let iso = d.toLocaleDateString("sv-SE");
  while (!ehDiaDePregao(iso)) iso = somaDias(iso, -1);
  return iso;
}

// ---------- Carteira ----------
// A carteira inteira sai das operações. Para os ativos com pelo menos uma operação (mesmo estornada), a lista da
// carteira é a calculada aqui; ativos sem nenhuma operação (de antes do painel guardar operações) ficam como estão.
export function governados(ops: Operacao[]): { rv: Set<string>; rf: Set<string>; moedas: Set<string> } {
  const g = { rv: new Set<string>(), rf: new Set<string>(), moedas: new Set<string>() };
  for (const o of ops) (o.classe === "rf" ? g.rf : o.classe === "moeda" ? g.moedas : g.rv).add(o.ativo);
  return g;
}

const porData = (ops: Operacao[], classe: ClasseOp) => efetivas(ops).filter(o => o.classe === classe)
  .map((o, i) => ({ o, i })).sort((a, b) => a.o.data.localeCompare(b.o.data) || a.i - b.i).map(x => x.o);
const arred = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;

// Títulos de renda fixa: a aplicação abre o título com o principal (qtd) e os termos; o resgate tira principal (o
// resgate total tira tudo e o título sai da carteira). ate: só as operações até essa data (inclusive).
export function titulosDaCarteira(ops: Operacao[], ate?: string): TituloRF[] {
  const out = new Map<string, TituloRF>();
  for (const o of porData(ops, "rf")) {
    if (ate && o.data > ate) continue;
    const t = out.get(o.ativo);
    if (o.tipo === "aplicacao" && o.titulo && !t) {
      out.set(o.ativo, { id: o.ativo, ...o.titulo, venc: o.titulo.venc ?? null, isento: !!o.titulo.isento, instituicao: o.titulo.instituicao ?? null,
        liquidezDiaria: !!o.titulo.liquidezDiaria, aplicado: arred(o.qtd ?? 0, 2), data: o.data });
    } else if (o.tipo === "resgate" && t) {
      const resto = arred(t.aplicado - (o.qtd ?? 0), 2);
      if (resto <= 0.005) out.delete(o.ativo); else out.set(o.ativo, { ...t, aplicado: resto });
    }
  }
  return [...out.values()];
}

// Moedas estrangeiras: compra soma, venda tira (até zerar)
export function moedasDaCarteira(ops: Operacao[], ate?: string): Record<string, number> {
  const q: Record<string, number> = {};
  for (const o of porData(ops, "moeda")) {
    if (ate && o.data > ate) continue;
    const antes = q[o.ativo] ?? 0;
    q[o.ativo] = o.tipo === "compra" ? antes + (o.qtd ?? 0) : antes - Math.min(o.qtd ?? 0, antes);
  }
  return Object.fromEntries(Object.entries(q).filter(([, v]) => v > EPS).map(([c, v]) => [c, arred(v, 8)]));
}

// Valor presente de uma compra ou venda (ação, FII, cripto ou moeda): a quantidade que havia logo antes, no mesmo dia,
// pelo preço da própria operação, em reais. Renda fixa usa o valor do título na curva (calculado na página, com as taxas).
export function valorPresenteAntes(ops: Operacao[], o: Operacao): number {
  const preco = o.classe === "moeda" ? (o.qtd ? valorDaOperacao(o) / o.qtd : 0) : emReais(o);
  let qtd: number;
  if (o.classe === "moeda") qtd = moedasDaCarteira(ops, o.data)[o.ativo] ?? 0;
  else {
    const p = processar(ops.filter(x => x.ativo === o.ativo), o.data).posicoes[o.ativo];
    qtd = p?.qtd ?? 0;
  }
  return arred(qtd * preco, 2);
}
// Quantidades que a carteira deve ter para os ativos com operações (ações/FIIs/ETFs/BDRs/exterior em acoesFiis; cripto em cripto)
export function quantidadesDaCarteira(ops: Operacao[]): { acoesFiis: Record<string, number>; cripto: Record<string, number> } {
  const { posicoes } = processar(ops);
  const acoesFiis: Record<string, number> = {}, cripto: Record<string, number> = {};
  for (const p of Object.values(posicoes)) (p.classe === "cripto" ? cripto : acoesFiis)[p.ativo] = +p.qtd.toFixed(8);
  return { acoesFiis, cripto };
}
