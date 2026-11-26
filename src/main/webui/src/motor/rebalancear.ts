// Rebalanceamento com venda: vende o que passa da meta além da tolerância, calcula o IR e distribui o dinheiro nas classes abaixo.
// O IR sai das mesmas apurações da página Operações (apurarIR e apurarExterior): as vendas viram operações simuladas e o
// imposto é a diferença entre apurar com e sem elas (entram a isenção do mês, as vendas já feitas e os prejuízos acumulados).
import { CLASSES_META, distribuicao, type ClasseMeta } from "./saude";
import { apurarExterior, apurarIR, LIMITE_ACOES, processar, type Classe, type Operacao } from "./operacoes";

export const BANDA_PADRAO = 5; // pontos percentuais acima da meta que ainda não justificam vender

export type Vendavel = {
  id: string; nome: string; classe: ClasseMeta; valor: number; nota: number | null;
  unidades: number | null;  // null na renda fixa (resgata por valor)
  fracionavel: boolean;     // cripto
  classeIR: Classe | null;  // null na renda fixa: o IR é retido no resgate e o valor já vem líquido
  custo: number | null;     // custo de aquisição; null = sem operações, o IR não dá para calcular
  irRetido: number;         // renda fixa: IR retido ao resgatar tudo
  reserva: boolean;         // conta como reserva de emergência
  bloqueio: string | null;  // por que não dá para vender agora
  aviso: string | null;
};
export type VendaPlanejada = {
  id: string; nome: string; classe: ClasseMeta; valor: number; qtd: number | null; total: boolean;
  lucro: number | null; irRetido: number; classeIR: Classe | null; aviso: string | null;
};
export type Plano = {
  vendas: VendaPlanejada[]; compras: { classe: ClasseMeta; valor: number }[];
  vendido: number; irRetido: number; impostoAPagar: number; semIR: string[]; /* vendas sem operações: IR desconhecido */
  caixa: number; depois: ReturnType<typeof distribuicao>; antes: ReturnType<typeof distribuicao>;
  naoVendido: { classe: ClasseMeta; valor: number; motivo: string }[];
  aporteSemVender: number; avisoIsencao: string | null;
};

// IR do mês (ações, ETF, BDR, FII e cripto) mais o do ano no exterior
function imposto(ops: Operacao[], hoje: string): number {
  const { realizados } = processar(ops);
  const mes = apurarIR(realizados).find(m => m.mes === hoje.slice(0, 7));
  const ext = apurarExterior(realizados).find(a => a.ano === +hoje.slice(0, 4));
  return (mes ? mes.impostoRV + mes.impostoCripto : 0) + (ext?.imposto ?? 0);
}

export function impostoDasVendas(ops: Operacao[], vendas: { ativo: string; classe: Classe; qtd: number; valor: number }[], hoje: string): number {
  const simuladas: Operacao[] = vendas.filter(v => v.qtd > 0).map((v, i) => ({
    id: `simulada-${i}`, data: hoje, tipo: "venda", classe: v.classe, ativo: v.ativo, qtd: v.qtd, preco: v.valor / v.qtd,
  }));
  return imposto([...ops, ...simuladas], hoje) - imposto(ops, hoje);
}

// Dentro da classe, vende primeiro: quem tem o IR conhecido, depois a menor nota (sem nota = 60) e o menor ganho (menos imposto)
function ordem(a: Vendavel, b: Vendavel): number {
  const ganho = (v: Vendavel) => v.classeIR == null ? v.irRetido / v.valor : v.custo == null ? 0 : (v.valor - v.custo) / v.valor;
  const semCusto = (v: Vendavel) => v.classeIR != null && v.custo == null ? 1 : 0;
  return semCusto(a) - semCusto(b) || (a.nota ?? 60) - (b.nota ?? 60) || ganho(a) - ganho(b);
}

export function planejarRebalanceamento({ ativos, valores, metas, aporte = 0, banda = BANDA_PADRAO, reservaAlvo = 0, operacoes, hoje }: {
  ativos: Vendavel[]; valores: Record<ClasseMeta, number>; metas: Record<ClasseMeta, number>;
  aporte?: number; banda?: number; reservaAlvo?: number; operacoes: Operacao[]; hoje: string;
}): Plano {
  const novo = Math.max(0, aporte);
  const antes = distribuicao(valores, metas);
  const total = antes.total + novo;
  const alvo = Object.fromEntries(antes.linhas.map(l => [l.classe, total * l.meta / 100])) as Record<ClasseMeta, number>;
  let folgaReserva = Math.max(0, ativos.filter(a => a.reserva).reduce((s, a) => s + a.valor, 0) - reservaAlvo);

  const vendas: VendaPlanejada[] = [];
  const naoVendido: Plano["naoVendido"] = [];
  for (const classe of CLASSES_META) {
    const excesso = (valores[classe] || 0) - alvo[classe];
    if (!total || excesso / total * 100 <= banda + 1e-9) continue;
    let resta = excesso;
    const motivos = new Set<string>();
    for (const a of ativos.filter(x => x.classe === classe && x.valor > 0).sort(ordem)) {
      if (resta < 0.01) break;
      if (a.bloqueio) { motivos.add(a.bloqueio); continue; }
      let quer = Math.min(resta, a.valor);
      if (a.reserva && quer > folgaReserva) { quer = folgaReserva; motivos.add("o restante é a sua reserva de emergência"); }
      if (quer < 0.01) continue;
      let valor = quer, qtd: number | null = null;
      if (a.unidades != null) {
        const preco = a.valor / a.unidades;
        qtd = quer >= a.valor - 0.005 ? a.unidades : a.fracionavel ? +(quer / preco).toFixed(8) : Math.floor(quer / preco + 1e-9);
        if (!(qtd > 0)) { motivos.add("sobra menos que o preço de uma unidade"); continue; }
        valor = qtd * preco;
      }
      const fracao = valor / a.valor;
      if (a.reserva) folgaReserva -= valor;
      resta -= valor;
      vendas.push({
        id: a.id, nome: a.nome, classe, valor, qtd, total: fracao > 1 - 1e-6, classeIR: a.classeIR,
        lucro: a.classeIR != null && a.custo != null ? valor - a.custo * fracao : null, irRetido: a.irRetido * fracao, aviso: a.aviso,
      });
    }
    // sobra de arredondamento (menos de 0,5 p.p.) não é problema
    if (resta / total * 100 > 0.5) naoVendido.push({ classe, valor: resta, motivo: [...motivos].join("; ") || "não há ativo para vender" });
  }

  const comIR = vendas.filter(v => v.classeIR != null && v.lucro != null);
  const impostoAPagar = Math.max(0, impostoDasVendas(operacoes, comIR.map(v => ({ ativo: v.id, classe: v.classeIR!, qtd: v.qtd!, valor: v.valor })), hoje));
  const vendido = vendas.reduce((s, v) => s + v.valor, 0);
  const caixa = Math.max(0, vendido - impostoAPagar + novo);

  // o dinheiro vai para quem está abaixo da meta, na proporção da falta; o que passar disso segue as metas
  const sobrou = Object.fromEntries(CLASSES_META.map(c => [c, (valores[c] || 0) - vendas.filter(v => v.classe === c).reduce((s, v) => s + v.valor, 0)])) as Record<ClasseMeta, number>;
  const falta = Object.fromEntries(CLASSES_META.map(c => [c, Math.max(0, alvo[c] - sobrou[c])])) as Record<ClasseMeta, number>;
  const somaFalta = CLASSES_META.reduce((s, c) => s + falta[c], 0);
  const compras = antes.linhas.map(l => ({
    classe: l.classe,
    valor: somaFalta >= caixa ? (somaFalta ? caixa * falta[l.classe] / somaFalta : 0) : falta[l.classe] + (caixa - somaFalta) * l.meta / 100,
  }));
  const depois = distribuicao(Object.fromEntries(compras.map(c => [c.classe, sobrou[c.classe] + c.valor])) as Record<ClasseMeta, number>, metas);

  const mes = hoje.slice(0, 7);
  const jaVendido = processar(operacoes).realizados.filter(r => r.classe === "acao" && !r.dayTrade && r.data.startsWith(mes)).reduce((s, r) => s + r.venda, 0);
  const acoes = vendas.filter(v => v.classeIR === "acao");
  const totalAcoes = jaVendido + acoes.reduce((s, v) => s + v.valor, 0);
  const avisoIsencao = impostoAPagar > 0 && totalAcoes > LIMITE_ACOES && acoes.reduce((s, v) => s + (v.lucro ?? 0), 0) > 0
    ? `As vendas de ações somariam R$ ${Math.round(totalAcoes).toLocaleString("pt-BR")} no mês, acima da isenção de R$ 20 mil. Dividir as vendas em mais de um mês pode reduzir o IR.` : null;

  return {
    vendas, compras, vendido, impostoAPagar, irRetido: vendas.reduce((s, v) => s + v.irRetido, 0),
    semIR: vendas.filter(v => v.classeIR != null && v.lucro == null).map(v => v.nome),
    caixa, antes, depois, naoVendido, avisoIsencao,
    aporteSemVender: antes.linhas.reduce((s, l) => s + l.falta, 0),
  };
}
