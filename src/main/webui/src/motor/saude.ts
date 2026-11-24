// Saúde da carteira: distribuição por classe e metas, reserva de emergência, FGC, vencimentos, concentração, retorno de cada ativo
// contra o CDI líquido, sinais para aportar, reduzir ou trocar, e o custo de IR de uma troca. Contas puras: a página busca os dados.
//
// O que isto NÃO faz: prever qual ativo vai render mais. Cada sinal vem com o número e a regra que o gerou. A queda de preço, sozinha,
// nunca vira sinal de venda (o método AUVP trata queda como oportunidade se os fundamentos estão intactos).
// Regras de IR iguais às de motor/operacoes.ts (ação isenta até R$ 20 mil de vendas no mês, FII 20%, demais 15%).
import {
  aliqIR, currentRates, daysBetween, notaLinear, precoGraham, projectOne, type Fundamentos, type SerieDiaria, type TaxasBCB, type TituloRF, type TipoFii,
} from "./motor";
import { LIMITE_ACOES, type Classe, type Operacao, type Provento } from "./operacoes";

// ---------- Classes e metas ----------
export type ClasseMeta = "rf" | "acao" | "fii" | "exterior" | "cripto";
export const CLASSES_META: ClasseMeta[] = ["rf", "acao", "fii", "exterior", "cripto"];
export const NOME_META: Record<ClasseMeta, string> = { rf: "Renda fixa", acao: "Ações", fii: "FIIs", exterior: "Exterior", cripto: "Cripto" };
export const METAS_PADRAO: Record<ClasseMeta, number> = { rf: 25, acao: 35, fii: 25, exterior: 10, cripto: 5 };
export const MESES_RESERVA_PADRAO = 6;
export const LIMITE_ATIVO = 0.15;   // um ativo de renda variável acima de 15% da carteira é concentração
export const LIMITE_SETOR = 0.35;
export const TETO_FGC = 250_000;
export const TETO_FGC_GLOBAL = 1_000_000;
export const TIPOS_FGC = ["CDB", "LCI", "LCA"];

export type LinhaClasse = { classe: ClasseMeta; valor: number; pct: number; meta: number; desvio: number; falta: number };

// metas em % (normalizadas se não somarem 100). falta = quanto aportar para a classe chegar na meta sem vender nada.
export function distribuicao(valores: Record<ClasseMeta, number>, metasPct: Record<ClasseMeta, number>): { total: number; linhas: LinhaClasse[] } {
  const total = CLASSES_META.reduce((s, c) => s + (valores[c] || 0), 0);
  const somaMetas = CLASSES_META.reduce((s, c) => s + (metasPct[c] || 0), 0) || 1;
  const linhas = CLASSES_META.map(classe => {
    const valor = valores[classe] || 0, meta = (metasPct[classe] || 0) / somaMetas * 100;
    const pct = total ? valor / total * 100 : 0;
    return { classe, valor, pct, meta, desvio: pct - meta, falta: 0 };
  });
  // a classe mais acima da meta (em %) define o total necessário para as outras chegarem nela sem vender
  const necessario = Math.max(total, ...linhas.filter(l => l.meta > 0).map(l => l.valor / (l.meta / 100)));
  for (const l of linhas) l.falta = Math.max(0, necessario * l.meta / 100 - l.valor);
  return { total, linhas };
}

// ---------- Onde aportar ----------
export type ParteAporte = { classe: ClasseMeta; valor: number; reserva: number; motivo: string };

// Primeiro completa a reserva de emergência (em renda fixa de liquidez diária); o resto vai para as classes mais abaixo da meta,
// proporcional à falta de cada uma. Sem falta (tudo na meta), divide pelas metas.
export function planoAporte(aporte: number, valores: Record<ClasseMeta, number>, metasPct: Record<ClasseMeta, number>, faltaReserva: number): ParteAporte[] {
  const reserva = Math.min(Math.max(aporte, 0), Math.max(faltaReserva, 0));
  const resto = Math.max(aporte, 0) - reserva;
  const v = { ...valores, rf: (valores.rf || 0) + reserva };
  const total = CLASSES_META.reduce((s, c) => s + (v[c] || 0), 0) + resto;
  const somaMetas = CLASSES_META.reduce((s, c) => s + (metasPct[c] || 0), 0) || 1;
  const falta = Object.fromEntries(CLASSES_META.map(c => [c, Math.max(0, total * (metasPct[c] || 0) / somaMetas - (v[c] || 0))])) as Record<ClasseMeta, number>;
  const somaFalta = CLASSES_META.reduce((s, c) => s + falta[c], 0);
  return CLASSES_META.map(classe => {
    const parte = somaFalta >= resto
      ? (somaFalta ? resto * falta[classe] / somaFalta : 0)
      : falta[classe] + (resto - somaFalta) * (metasPct[classe] || 0) / somaMetas;
    const r = classe === "rf" ? reserva : 0;
    const motivo = r > 0 && parte > 0 ? "reserva de emergência incompleta, depois a meta" : r > 0 ? "reserva de emergência incompleta" : parte > 0 ? (falta[classe] > 0 ? "abaixo da meta" : "mantém a proporção") : "";
    return { classe, valor: parte + r, reserva: r, motivo };
  });
}

export type Candidato = {
  ticker: string; kind: "acao" | "fii"; nota: number | null; preco: number; peso: number; graves: number; setor?: string | null;
  margemGraham?: number | null; pvp?: number | null; tem: boolean;
};
export type Compra = { ticker: string; valor: number; qtd: number; motivo: string };

// Escolhe até `max` ativos para receber o valor da classe: só quem tem nota ≥ 60, sem alerta grave e abaixo do limite de concentração.
// Preço atraente (Graham nas ações, P/VP até 1 nos FIIs) soma pontos; peso alto tira.
export function escolheAtivos(cands: Candidato[], valorClasse: number, max = 3): Compra[] {
  const pont = (c: Candidato): number => {
    let s = c.nota ?? 0;
    if (c.kind === "acao" && c.margemGraham != null) s += c.margemGraham > 0 ? Math.min(15, c.margemGraham * 30) : c.margemGraham < -0.2 ? -10 : 0;
    if (c.kind === "fii" && c.pvp) s += c.pvp <= 1 ? 10 : c.pvp > 1.15 ? -10 : 0;
    return s - c.peso / LIMITE_ATIVO * 10;
  };
  const el = cands.filter(c => c.nota != null && c.nota >= 60 && c.graves === 0 && c.peso < LIMITE_ATIVO * 0.9 && c.preco > 0)
    .sort((a, b) => pont(b) - pont(a));
  let n = Math.min(max, el.length);
  while (n > 1 && valorClasse / n < Math.max(...el.slice(0, n).map(c => c.preco))) n--;
  if (!n) return [];
  return el.slice(0, n).map(c => {
    const qtd = Math.floor(valorClasse / n / c.preco);
    const porque = [`nota ${c.nota}`];
    if (c.kind === "acao" && c.margemGraham != null && c.margemGraham > 0) porque.push(`${Math.round(c.margemGraham * 100)}% abaixo do justo de Graham`);
    if (c.kind === "fii" && c.pvp && c.pvp <= 1) porque.push(`P/VP ${c.pvp.toFixed(2).replace(".", ",")}`);
    porque.push(c.tem ? `pesa ${(c.peso * 100).toFixed(1).replace(".", ",")}% da carteira` : "ainda fora da carteira");
    return { ticker: c.ticker, valor: qtd * c.preco, qtd, motivo: porque.join(", ") };
  }).filter(c => c.qtd > 0);
}

// ---------- Retorno de cada ativo contra o CDI líquido ----------
export type FluxoCx = { data: string; valor: number }; // valor > 0: entra no bolso (venda, provento, valor de hoje); < 0: aporte

// Taxa interna de retorno anual (%) por bisseção; null se não há aporte e retorno, ou se o período é curto demais (< 30 dias)
export function xirr(fluxos: FluxoCx[]): number | null {
  const f = [...fluxos].sort((a, b) => a.data.localeCompare(b.data));
  if (!f.some(x => x.valor < 0) || !f.some(x => x.valor > 0)) return null;
  const t0 = f[0].data;
  if (daysBetween(t0, f[f.length - 1].data) < 30) return null;
  const npv = (r: number) => f.reduce((s, x) => s + x.valor / Math.pow(1 + r, daysBetween(t0, x.data) / 365), 0);
  let lo = -0.99, hi = 10;
  let nLo = npv(lo);
  if (nLo * npv(hi) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2, n = npv(mid);
    if (nLo * n <= 0) hi = mid; else { lo = mid; nLo = n; }
  }
  return (lo + hi) / 2 * 100;
}

// Fator acumulado do CDI em (de, ate]
export function fatorCdi(serie: SerieDiaria, de: string, ate: string): number {
  let f = 1;
  for (const [d, v] of serie) if (d > de && d <= ate) f *= 1 + v / 100;
  return f;
}

export type Veredicto = "compensando" | "no-cdi" | "abaixo" | "cedo" | "sem-dados";
export type Avaliacao = {
  investido: number; recebido: number; valorLiq: number; ganho: number; retornoPct: number | null; dias: number;
  anual: number | null; cdiAnual: number | null; spread: number | null; vsCdi: number | null; veredicto: Veredicto;
};

// fluxos: aportes (negativos) e retiradas/proventos (positivos) até hoje; valorLiq: o que a posição vale hoje, já sem o IR de vender.
// A alternativa é aplicar os mesmos aportes e retiradas em 100% do CDI, com IR da tabela regressiva pela idade média do dinheiro.
export function avaliaFluxos(fluxos: FluxoCx[], valorLiq: number, cdi: SerieDiaria, hoje: string): Avaliacao {
  const fl = fluxos.filter(f => f.data <= hoje && f.valor !== 0);
  const saidas = fl.filter(f => f.valor < 0), entradas = fl.filter(f => f.valor > 0);
  const investido = saidas.reduce((s, f) => s - f.valor, 0), recebido = entradas.reduce((s, f) => s + f.valor, 0);
  const primeiro = fl.map(f => f.data).sort()[0];
  const dias = primeiro ? daysBetween(primeiro, hoje) : 0;
  const vazio: Avaliacao = { investido, recebido, valorLiq, ganho: recebido + valorLiq - investido, retornoPct: null, dias, anual: null, cdiAnual: null, spread: null, vsCdi: null, veredicto: "sem-dados" };
  if (!(investido > 0) || !cdi.length) return vazio;
  const ganho = recebido + valorLiq - investido;
  const alt = saidas.reduce((s, f) => s - f.valor * fatorCdi(cdi, f.data, hoje), 0) - entradas.reduce((s, f) => s + f.valor * fatorCdi(cdi, f.data, hoje), 0);
  const idade = saidas.reduce((s, f) => s - f.valor * daysBetween(f.data, hoje), 0) / investido;
  const ganhoAlt = alt + recebido - investido;
  const altLiq = alt - Math.max(0, ganhoAlt) * aliqIR(idade);
  const anual = xirr([...fl, { data: hoje, valor: valorLiq }]);
  const cdiAnual = altLiq > 0 ? xirr([...fl, { data: hoje, valor: altLiq }]) : null;
  const spread = anual != null && cdiAnual != null ? anual - cdiAnual : null;
  const veredicto: Veredicto = dias < 180 ? "cedo" : spread == null ? "sem-dados" : spread >= 2 ? "compensando" : spread <= -2 ? "abaixo" : "no-cdi";
  return { investido, recebido, valorLiq, ganho, retornoPct: ganho / investido * 100, dias, anual, cdiAnual, spread, vsCdi: valorLiq - altLiq, veredicto };
}

const emReais = (o: Operacao) => (o.preco ?? 0) * (o.cambio ?? 1);
// Fluxos de um ativo a partir das operações e dos proventos. O saldo inicial entra como compra na data lançada (aproximação: incompleto).
export function fluxosDoAtivo(ops: Operacao[], proventos: Provento[], ativo: string): { fluxos: FluxoCx[]; incompleto: boolean } {
  const fluxos: FluxoCx[] = [];
  let incompleto = false;
  for (const o of ops) {
    if (o.ativo !== ativo) continue;
    if (o.inicial) incompleto = true;
    if (o.tipo === "compra") fluxos.push({ data: o.data, valor: -((o.qtd ?? 0) * emReais(o) + (o.taxas ?? 0)) });
    else if (o.tipo === "venda") fluxos.push({ data: o.data, valor: (o.qtd ?? 0) * emReais(o) - (o.taxas ?? 0) });
  }
  for (const p of proventos) if (p.ativo === ativo) fluxos.push({ data: p.data, valor: p.valor - (p.irRetido ?? 0) });
  return { fluxos, incompleto };
}

// ---------- IR de vender ----------
export const aliquotaVenda = (classe: Classe | undefined): number => classe === "fii" ? 0.20 : 0.15;
export type CustoVenda = { ir: number; isento: boolean; prejuizo: boolean; liquido: number };
// Vender a posição inteira. vendasAcoesMes: vendas de ações já feitas no mês (a isenção vale até R$ 20 mil no total).
// Sem imposto também quando há prejuízo; o prejuízo realizado compensa ganhos futuros da mesma classe.
export function custoDeVender(classe: Classe | undefined, custo: number, valor: number, vendasAcoesMes = 0): CustoVenda {
  const lucro = valor - custo;
  if (lucro <= 0) return { ir: 0, isento: false, prejuizo: lucro < 0, liquido: valor };
  if (classe === "acao" && vendasAcoesMes + valor <= LIMITE_ACOES) return { ir: 0, isento: true, prejuizo: false, liquido: valor };
  const ir = lucro * aliquotaVenda(classe);
  return { ir, isento: false, prejuizo: false, liquido: valor - ir };
}

// ---------- Sinais ----------
export type Severidade = "alta" | "media" | "info";
export type Sinal = { id: string; ativo?: string; severidade: Severidade; titulo: string; detalhe: string };
const pct1 = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";
const num2 = (v: number) => v.toFixed(2).replace(".", ",");

export type EntradaSinal = {
  ticker: string; kind: "acao" | "fii" | "outro"; nota: number | null; notasAnteriores?: number[]; // do mês anterior para trás
  peso: number; fund?: Fundamentos | null; preco?: number | null; av?: Avaliacao | null;
};

export function sinaisDoAtivo(e: EntradaSinal): Sinal[] {
  const s: Sinal[] = [], t = e.ticker, f = e.fund ?? {};
  const add = (id: string, severidade: Severidade, titulo: string, detalhe: string) => s.push({ id: `${t}-${id}`, ativo: t, severidade, titulo, detalhe });
  if (e.nota != null && e.nota < 40) {
    const persistente = (e.notasAnteriores ?? []).slice(0, 2).some(n => n < 50);
    add("nota", persistente ? "alta" : "media", `Nota baixa (${e.nota} de 100)${persistente ? ", sem melhora nos últimos meses" : ""}`,
      "Os fundamentos do Analisador estão fracos. Veja quais critérios puxam a nota para baixo antes de decidir; vender só faz sentido se a tese de compra não vale mais.");
  }
  if (e.nota != null && e.notasAnteriores?.length && e.notasAnteriores[0] - e.nota >= 15) {
    add("queda-nota", "info", `Nota caiu de ${e.notasAnteriores[0]} para ${e.nota} desde o mês passado`, "Os indicadores mudaram. Confira o último balanço ou relatório gerencial.");
  }
  if (e.kind === "fii") {
    if ((f.dy ?? 0) > 0.14) add("dy", "media", `Dividend yield muito alto (${pct1(f.dy!)})`, "Pode ser calote nos recebíveis, venda de imóveis ou pagamento extraordinário: desconfie do “bom demais para ser verdade”.");
    if ((f.ffoYield ?? 0) > 0 && (f.dy ?? 0) > 0 && f.ffoYield! < f.dy!) add("ffo", "media", "O dividendo passa do FFO", "O fundo distribui mais do que gera de caixa recorrente; isso não se sustenta no longo prazo.");
    if ((f.pvp ?? 0) > 0 && f.pvp! < 0.5) add("pvp", "media", `P/VP muito baixo (${num2(f.pvp!)})`, "Quando algo que vale R$ 1,00 sai por menos de R$ 0,50, o mercado costuma ver um problema (vacância, inadimplência, imóvel obsoleto).");
    if ((f.pvp ?? 0) > 1.3) add("pvp-alto", "info", `Negocia ${Math.round((f.pvp! - 1) * 100)}% acima do patrimônio (P/VP ${num2(f.pvp!)})`, "Pagar bem acima do valor patrimonial tira a margem de segurança; aportes novos ficam melhores em fundos mais perto de 1,0.");
  }
  if (e.kind === "acao" && e.preco && (f.pl ?? 0) > 0 && (f.pvp ?? 0) > 0) {
    const g = precoGraham(e.preco, f.pl!, f.pvp!);
    if (g && g.margem <= -0.3 && (e.nota ?? 100) < 70) add("graham", "info", `Preço ${Math.round(-g.margem * 100)}% acima do justo de Graham`, `Justo de Graham: R$ ${num2(g.justo)}. Graham é conservador, então vale só como referência, junto da nota.`);
  }
  if (e.peso > LIMITE_ATIVO && e.kind !== "outro") add("peso", "media", `Pesa ${pct1(e.peso)} da carteira (limite: ${pct1(LIMITE_ATIVO)})`, "Concentração em um ativo só: os próximos aportes devem ir para outros, e reduzir só se o peso continuar alto.");
  const av = e.av;
  if (av?.veredicto === "abaixo" && av.spread != null) {
    add("cdi", (e.nota ?? 100) < 50 ? "alta" : "media", `Rendeu ${num2(-av.spread)} p.p. ao ano abaixo do CDI líquido`,
      `Retorno de ${num2(av.anual ?? 0)}% a.a. contra ${num2(av.cdiAnual ?? 0)}% do CDI após IR, em ${Math.round(av.dias / 30)} meses. Se não há tese de longo prazo que explique, a renda fixa rendeu mais.`);
  }
  return s;
}

// Renda fixa: vencimento próximo, vencido e a regra de vender o título prefixado/IPCA+ que já entregou 80–90% do ganho (AUVP, M3)
export function sinaisRF(t: TituloRF, rates: TaxasBCB, hoje: string, liquidoHoje: number): Sinal[] {
  const s: Sinal[] = [], id = (x: string) => `${t.id}-${x}`;
  if (!t.venc) return s;
  if (t.venc <= hoje) {
    s.push({ id: id("venceu"), ativo: t.nome, severidade: "info", titulo: "Venceu", detalhe: "O dinheiro já voltou para a conta: defina o destino (o painel continua contando o título até você removê-lo)." });
    return s;
  }
  const dias = daysBetween(hoje, t.venc);
  if (dias <= 90) s.push({ id: id("vence"), ativo: t.nome, severidade: "info", titulo: `Vence em ${dias} dias`, detalhe: "Decida o destino do dinheiro antes do vencimento; aplicar de novo no mesmo banco nem sempre dá a melhor taxa." });
  if (t.idx !== "cdi") {
    const r = currentRates(rates);
    const fim = projectOne(t, t.venc, { cdi: r.cdi, ipca: r.ipca, reinvest: false }, rates, hoje).liquido - t.aplicado;
    const ate = liquidoHoje - t.aplicado;
    if (fim > 0 && ate / fim >= 0.8) s.push({ id: id("80"), ativo: t.nome, severidade: "media", titulo: `Já entregou ${Math.round(ate / fim * 100)}% do ganho previsto até o vencimento`,
      detalhe: "Regra de 80–90%: com pouco ganho restante, vale comparar com um título novo. Vender antes do vencimento marca a mercado (confira na ferramenta de Marcação)." });
  }
  return s;
}

// ---------- Troca ----------
export type AtivoAnalisado = {
  ticker: string; kind: "acao" | "fii"; setor?: string | null; tipoFii?: TipoFii | null; nota: number | null;
  dy: number; preco: number; valor: number; custo: number; classe: Classe; graves: number; peso: number; tem: boolean; veredicto?: Veredicto;
  semCusto?: boolean; // sem operações lançadas: o preço médio, e portanto o IR da venda, é desconhecido
};
export type Troca = {
  de: string; para: string; notaDe: number; notaPara: number; custo: CustoVenda; deltaDy: number | null; anos: number | null;
  veredicto: "vale" | "avaliar" | "nao-vale"; motivos: string[];
};
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Para cada ativo fraco (nota < 50, ou abaixo do CDI com nota < 60) procura um substituto do mesmo setor (ações) ou do mesmo tipo (FIIs)
// com nota pelo menos 15 pontos maior. O veredicto compara o IR da troca com a renda extra do substituto (dividend yield).
export function sugerirTrocas(ativos: AtivoAnalisado[], vendasAcoesMes = 0): Troca[] {
  const out: Troca[] = [];
  let vendas = vendasAcoesMes;
  for (const a of ativos.filter(x => x.tem && x.valor > 0 && x.nota != null && (x.nota < 50 || (x.veredicto === "abaixo" && x.nota < 60)))) {
    const mesmo = (b: AtivoAnalisado) => a.kind === "acao" ? !!a.setor && norm(a.setor) === norm(b.setor) : !!a.tipoFii && a.tipoFii === b.tipoFii;
    const sub = ativos.filter(b => b.ticker !== a.ticker && b.kind === a.kind && mesmo(b) && b.nota != null && b.graves === 0
      && b.nota >= Math.max(65, a.nota! + 15) && b.peso < LIMITE_ATIVO * 0.8)
      .sort((x, y) => y.nota! - x.nota! || y.dy - x.dy)[0];
    if (!sub) continue;
    const custo = custoDeVender(a.classe, a.custo, a.valor, vendas);
    if (a.classe === "acao") vendas += a.valor;
    const extra = custo.liquido * sub.dy - a.valor * a.dy; // renda extra por ano em reais
    const deltaDy = sub.dy - a.dy;
    const anos = custo.ir === 0 ? 0 : extra > 0 ? custo.ir / extra : null;
    const dnota = sub.nota! - a.nota!;
    const veredicto: Troca["veredicto"] = a.semCusto ? "avaliar" : anos === 0 ? "vale" : anos == null ? (dnota >= 25 ? "avaliar" : "nao-vale") : anos <= 3 ? "vale" : anos <= 6 ? "avaliar" : "nao-vale";
    const motivos = [`${sub.ticker} tem nota ${sub.nota} contra ${a.nota} de ${a.ticker}`];
    if (a.semCusto) motivos.push("sem operações lançadas de " + a.ticker + ": o IR da venda não foi calculado (lance as compras em Operações)");
    else if (custo.isento) motivos.push("vender fica dentro da isenção de R$ 20 mil de ações no mês: sem IR");
    else if (custo.prejuizo) motivos.push("a venda realiza prejuízo, que compensa ganhos futuros da mesma classe");
    else if (custo.ir > 0) motivos.push(`o IR da venda é ${money0(custo.ir)}`);
    if (anos != null && anos > 0) motivos.push(`a renda extra do substituto paga esse IR em cerca de ${anos.toFixed(1).replace(".", ",")} ano${anos >= 1.95 ? "s" : ""}`);
    if (anos == null && custo.ir > 0) motivos.push("o substituto não rende mais em proventos, então o IR não se paga só com renda");
    out.push({ de: a.ticker, para: sub.ticker, notaDe: a.nota!, notaPara: sub.nota!, custo, deltaDy, anos, veredicto, motivos });
  }
  return out;
}
const money0 = (v: number) => "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

// ---------- Notas de saúde ----------
export type SubNota = { id: string; nome: string; nota: number | null; peso: number; resumo: string; acao: string | null };

export function notaGeral(subs: SubNota[]): number | null {
  const com = subs.filter((s): s is SubNota & { nota: number } => s.nota != null);
  const peso = com.reduce((a, s) => a + s.peso, 0);
  return peso ? Math.round(com.reduce((a, s) => a + s.nota * s.peso, 0) / peso) : null;
}

// Reserva: liquidez diária (Tesouro Selic ou título marcado como liquidez diária) ÷ custos fixos mensais
export function reserva(liquidez: number, custoFixo: number, meses: number) {
  if (!(custoFixo > 0)) return { atual: null as number | null, falta: 0, nota: null as number | null, alvo: 0 };
  const atual = liquidez / custoFixo, alvo = custoFixo * meses;
  return { atual, falta: Math.max(0, alvo - liquidez), nota: Math.round(notaLinear(atual, 0, meses)), alvo };
}

export type LinhaFgc = { instituicao: string; valor: number; excesso: number };
// Soma por instituição (mesmo nome, sem acento nem caixa) só dos títulos cobertos (CDB, LCI, LCA). Tesouro, debêntures, CRI e CRA não têm FGC.
export function fgc(titulos: { instituicao?: string | null; tipo: string; valor: number }[]) {
  const cobertos = titulos.filter(t => TIPOS_FGC.includes(t.tipo));
  const mapa = new Map<string, LinhaFgc>();
  let semInstituicao = 0;
  for (const t of cobertos) {
    const nome = (t.instituicao ?? "").trim();
    if (!nome) { semInstituicao += t.valor; continue; }
    const k = norm(nome), l = mapa.get(k) ?? { instituicao: nome, valor: 0, excesso: 0 };
    l.valor += t.valor; l.excesso = Math.max(0, l.valor - TETO_FGC);
    mapa.set(k, l);
  }
  const linhas = [...mapa.values()].sort((a, b) => b.valor - a.valor);
  const coberto = cobertos.reduce((s, t) => s + t.valor, 0);
  return { linhas, excesso: linhas.reduce((s, l) => s + l.excesso, 0), coberto, semInstituicao, passaGlobal: coberto > TETO_FGC_GLOBAL };
}

export function vencimentos(titulos: { venc?: string | null; valor: number }[]) {
  const com = titulos.filter(t => t.venc), total = com.reduce((s, t) => s + t.valor, 0);
  const mapa = new Map<number, number>();
  for (const t of com) mapa.set(+t.venc!.slice(0, 4), (mapa.get(+t.venc!.slice(0, 4)) ?? 0) + t.valor);
  const porAno = [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([ano, valor]) => ({ ano, valor, pct: total ? valor / total : 0 }));
  return { porAno, total, maior: Math.max(0, ...porAno.map(a => a.pct)), titulos: com.length, semVenc: titulos.length - com.length };
}

export const notaConcentracao = (maiorAtivo: number, maiorSetor: number): number =>
  Math.round(Math.min(notaLinear(maiorAtivo, 0.35, 0.10), notaLinear(maiorSetor, 0.55, 0.25)));
export const notaMetas = (linhas: LinhaClasse[]): number =>
  Math.round(notaLinear(linhas.reduce((s, l) => s + Math.abs(l.desvio), 0) / (linhas.length || 1), 20, 0));
