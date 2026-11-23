// VR (e outros cartões de benefício) tratado como conta: saldo inicial + créditos e estornos − gastos ± ajustes.
// Contas puras; a página só busca /api/budget/vr e mostra.

export type ContaVR = { id: string; nome: string; creditoMensal?: number; diaCredito?: number; saldoInicial: number; dataInicio: string };
export type TipoMovimento = "credito" | "gasto" | "estorno" | "ajuste";
export type MovimentoVR = { id: string; conta: string; data: string; tipo: TipoMovimento; descricao?: string; valor: number; categoria?: string };

// Efeito no saldo: gasto tira; crédito e estorno põem; ajuste já vem com sinal
export const efeito = (m: MovimentoVR) => m.tipo === "gasto" ? -m.valor : m.tipo === "ajuste" ? m.valor : m.valor;

const daConta = (conta: ContaVR, ms: MovimentoVR[]) => ms.filter(m => m.conta === conta.id && m.data >= conta.dataInicio);
// Por data; no mesmo dia, na ordem em que foram lançados
const emOrdem = (ms: MovimentoVR[]) => ms.map((m, i) => ({ m, i })).sort((a, b) => a.m.data.localeCompare(b.m.data) || a.i - b.i).map(x => x.m);

export function saldo(conta: ContaVR, ms: MovimentoVR[], ate?: string): number {
  return daConta(conta, ms).filter(m => !ate || m.data <= ate).reduce((s, m) => s + efeito(m), conta.saldoInicial);
}

// Extrato do mês (AAAA-MM): saldo antes do mês, lançamentos com o saldo depois de cada um e o saldo no fim
export function extrato(conta: ContaVR, ms: MovimentoVR[], mes: string) {
  const antes = daConta(conta, ms).filter(m => m.data < mes + "-01");
  const inicial = antes.reduce((s, m) => s + efeito(m), conta.saldoInicial);
  let corrente = inicial;
  const linhas = emOrdem(daConta(conta, ms).filter(m => m.data.startsWith(mes))).map(m => ({ ...m, saldo: (corrente += efeito(m)) }));
  return { inicial, linhas, final: corrente };
}

export type ResumoMesVR = { mes: string; creditos: number; gastos: number; estornos: number; ajustes: number; saldo: number };
// Mês a mês, desde o início da conta até o mês dado
export function resumoMensal(conta: ContaVR, ms: MovimentoVR[], ateMes: string): ResumoMesVR[] {
  const out: ResumoMesVR[] = [];
  let s = conta.saldoInicial;
  const doMes = (mes: string, t: TipoMovimento) => daConta(conta, ms).filter(m => m.tipo === t && m.data.startsWith(mes)).reduce((a, m) => a + m.valor, 0);
  for (let mes = conta.dataInicio.slice(0, 7); mes <= ateMes; mes = somaMes(mes, 1)) {
    const creditos = doMes(mes, "credito"), gastos = doMes(mes, "gasto"), estornos = doMes(mes, "estorno"), ajustes = doMes(mes, "ajuste");
    s += creditos + estornos + ajustes - gastos;
    out.push({ mes, creditos, gastos, estornos, ajustes, saldo: s });
  }
  return out;
}

// Data do crédito no mês (dia configurado, ou o último dia se o mês for mais curto)
export function dataDoCredito(conta: ContaVR, mes: string): string | null {
  if (!conta.diaCredito) return null;
  const [y, m] = mes.split("-").map(Number);
  const dia = Math.min(conta.diaCredito, new Date(y, m, 0).getDate());
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

// O crédito do mês já devia ter caído e não foi lançado: devolve a data sugerida
export function creditoPendente(conta: ContaVR, ms: MovimentoVR[], hoje: string): string | null {
  if (!conta.creditoMensal) return null;
  const data = dataDoCredito(conta, hoje.slice(0, 7));
  if (!data || data > hoje || data < conta.dataInicio) return null;
  return daConta(conta, ms).some(m => m.tipo === "credito" && m.data.startsWith(hoje.slice(0, 7))) ? null : data;
}

export function proximoCredito(conta: ContaVR, hoje: string): string | null {
  const este = dataDoCredito(conta, hoje.slice(0, 7));
  if (!este) return null;
  return este > hoje ? este : dataDoCredito(conta, somaMes(hoje.slice(0, 7), 1));
}

// Do crédito deste mês, quanto sobra e quanto dá para gastar por dia (dias corridos até o próximo crédito, contando hoje)
// sem mexer no saldo acumulado dos meses anteriores
export function ritmoDoMes(conta: ContaVR, ms: MovimentoVR[], hoje: string) {
  const mes = hoje.slice(0, 7);
  const doMes = daConta(conta, ms).filter(m => m.data.startsWith(mes) && m.data <= hoje);
  const entrou = doMes.filter(m => m.tipo !== "gasto" && m.tipo !== "ajuste").reduce((s, m) => s + m.valor, 0);
  const gastou = doMes.filter(m => m.tipo === "gasto").reduce((s, m) => s + m.valor, 0);
  const proximo = proximoCredito(conta, hoje);
  const dias = proximo ? Math.max(1, Math.round((new Date(proximo + "T12:00:00").getTime() - new Date(hoje + "T12:00:00").getTime()) / 864e5)) : null;
  const sobra = entrou - gastou;
  return { entrou, gastou, sobra, proximo, dias, porDia: dias ? Math.max(0, sobra) / dias : null };
}

// Ajuste para o saldo do painel bater com o do app do cartão
export const ajusteParaSaldo = (atual: number, noApp: number) => Math.round((noApp - atual) * 100) / 100;

const somaMes = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
