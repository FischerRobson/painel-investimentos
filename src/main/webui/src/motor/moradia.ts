// Alugar × Financiar. Compara o patrimônio de quem compra com o de quem aluga e investe, gastando os dois o MESMO por mês:
// quem alugar começa investindo a entrada e os custos da compra, e em cada mês quem paga menos investe a diferença.
// Taxas em % a.a. (efetivas); valores nominais. Não trata a correção do saldo devedor (TR ou IPCA), FGTS nem os custos de vender o imóvel.
import { aliqIR } from "./motor";

// AUVP, Módulo 2: aluguel mensal abaixo de 0,5% do valor do imóvel é barato (alugar e investir a diferença costuma sair melhor)
export const REGRA_ALUGUEL = 0.005;

export type Sistema = "sac" | "price";
export type Parcela = { m: number; juros: number; amortizacao: number; prestacao: number; saldo: number };

const mensal = (aa: number) => Math.pow(1 + aa / 100, 1 / 12) - 1;

export function tabelaFinanciamento(financiado: number, jurosAa: number, meses: number, sistema: Sistema): Parcela[] {
  if (!(financiado > 0) || !(meses >= 1)) return [];
  const i = mensal(jurosAa), n = Math.round(meses);
  const fixa = i === 0 ? financiado / n : financiado * i / (1 - Math.pow(1 + i, -n)); // Price
  let saldo = financiado;
  return Array.from({ length: n }, (_, k) => {
    const juros = saldo * i;
    const amortizacao = sistema === "sac" ? financiado / n : fixa - juros;
    saldo = Math.max(0, saldo - amortizacao);
    return { m: k + 1, juros, amortizacao, prestacao: juros + amortizacao, saldo };
  });
}

// Custo Efetivo Total (% a.a.): a taxa que iguala o que você recebe (financiado − tarifas) ao que paga (prestação + seguros)
export function cet(financiado: number, tarifas: number, pagamentos: number[]): number | null {
  const recebido = financiado - tarifas;
  if (!(recebido > 0) || !pagamentos.length) return null;
  const vp = (r: number) => pagamentos.reduce((s, p, k) => s + p / Math.pow(1 + r, k + 1), 0);
  if (vp(0) < recebido) return null;
  let lo = 0, hi = 1;
  for (let k = 0; k < 100; k++) {
    const meio = (lo + hi) / 2;
    if (vp(meio) > recebido) lo = meio; else hi = meio;
  }
  return (Math.pow(1 + lo, 12) - 1) * 100;
}

export type CfgMoradia = {
  valor: number; entrada: number;
  custosCompra: number;   // ITBI, escritura e registro, % do valor
  juros: number; prazo: number /* meses */; sistema: Sistema;
  seguros: number;        // seguros (MIP e DFI) e taxa de administração, R$ por mês
  tarifas: number;        // tarifas do banco pagas na contratação (avaliação etc.), R$
  manutencao: number;     // custos que só o dono tem (obras, manutenção), % do valor do imóvel ao ano
  aluguel: number; reajuste: number; valorizacao: number;
  rendimento: number;     // rendimento bruto dos investimentos, % a.a. (IR de 15% a 22,5% sobre o ganho, pela tabela da renda fixa)
  anos: number;           // horizonte da comparação
};
export type AnoMoradia = { m: number; comprar: number; alugar: number; saldoDevedor: number; imovel: number };

function percorre(c: CfgMoradia, tabela: Parcela[]) {
  const r = mensal(c.rendimento), meses = Math.round(c.anos * 12);
  const inicial = c.entrada + c.valor * c.custosCompra / 100 + c.tarifas;
  // [saldo, aportado] dos investimentos de cada um
  const inq = { saldo: inicial, aportado: inicial }, dono = { saldo: 0, aportado: 0 };
  const liquido = (x: { saldo: number; aportado: number }, m: number) => x.saldo - Math.max(0, x.saldo - x.aportado) * aliqIR(m * 30);
  const pontos: AnoMoradia[] = [{ m: 0, comprar: c.valor - (c.valor - c.entrada), alugar: inicial, saldoDevedor: Math.max(0, c.valor - c.entrada), imovel: c.valor }];
  let totalDono = 0, totalAluguel = 0;
  for (let m = 1; m <= meses; m++) {
    const p = tabela[m - 1];
    const imovelAntes = c.valor * Math.pow(1 + c.valorizacao / 100, (m - 1) / 12);
    const custoDono = (p ? p.prestacao + c.seguros : 0) + imovelAntes * c.manutencao / 100 / 12;
    const aluguel = c.aluguel * Math.pow(1 + c.reajuste / 100, Math.floor((m - 1) / 12)); // reajuste anual
    totalDono += custoDono; totalAluguel += aluguel;
    inq.saldo *= 1 + r; dono.saldo *= 1 + r;
    const dif = custoDono - aluguel, quem = dif > 0 ? inq : dono;
    quem.saldo += Math.abs(dif); quem.aportado += Math.abs(dif);
    const imovel = c.valor * Math.pow(1 + c.valorizacao / 100, m / 12);
    const saldoDevedor = p ? p.saldo : 0;
    pontos.push({ m, imovel, saldoDevedor, comprar: imovel - saldoDevedor + liquido(dono, m), alugar: liquido(inq, m) });
  }
  return { pontos, totalDono, totalAluguel, inicial };
}

export function simulaMoradia(c: CfgMoradia) {
  if (!(c.valor > 0) || !(c.entrada >= 0) || c.entrada > c.valor || !(c.prazo >= 1) || !(c.anos > 0)) return null;
  const financiado = c.valor - c.entrada;
  const tabela = tabelaFinanciamento(financiado, c.juros, c.prazo, c.sistema);
  const sim = percorre(c, tabela);
  const fim = sim.pontos[sim.pontos.length - 1];
  // primeiro mês a partir do qual comprar fica na frente até o fim do horizonte
  let virada: number | null = null;
  for (let k = sim.pontos.length - 1; k >= 1 && sim.pontos[k].comprar > sim.pontos[k].alugar; k--) virada = sim.pontos[k].m;
  // aluguel que empata no fim do horizonte: quanto maior o aluguel, pior para quem aluga
  const diferenca = (aluguel: number) => { const p = percorre({ ...c, aluguel }, tabela).pontos; const u = p[p.length - 1]; return u.alugar - u.comprar; };
  let equilibrio: number | null = null;
  if (diferenca(0) > 0 && diferenca(c.valor * 0.05) < 0) {
    let lo = 0, hi = c.valor * 0.05;
    for (let k = 0; k < 60; k++) { const meio = (lo + hi) / 2; if (diferenca(meio) > 0) lo = meio; else hi = meio; }
    equilibrio = lo;
  }
  return {
    ...sim, tabela, financiado, fim, virada, equilibrio,
    totalJuros: tabela.reduce((s, p) => s + p.juros, 0),
    totalPrestacoes: tabela.reduce((s, p) => s + p.prestacao + c.seguros, 0),
    cet: cet(financiado, c.tarifas, tabela.map(p => p.prestacao + c.seguros)),
    razaoAluguel: c.aluguel / c.valor,
    vencedor: Math.abs(fim.comprar - fim.alugar) < 0.5 ? "empate" as const : fim.comprar > fim.alugar ? "comprar" as const : "alugar" as const,
  };
}
