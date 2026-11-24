// Saúde da carteira: junta a composição, as cotações com fundamentos, as operações e o orçamento e devolve o que a página mostra.
// Função pura (calcularSaude); a página busca os dados.
import {
  analisaAcao, analisaFii, avaliaFluxos, CLASSES_META, custoDeVender, distribuicao, escolheAtivos, fgc, fluxosDoAtivo, MESES_RESERVA_PADRAO,
  METAS_PADRAO, notaConcentracao, notaGeral, notaLinear, notaMetas, planoAporte, precoGraham, processar, reserva, sinaisDoAtivo, sinaisRF,
  sugerirTrocas, tipoFii, vencimentos,
  type Avaliacao, type Candidato, type Classe, type ClasseMeta, type Compra, type Fundamentos, type LinhaClasse, type Operacao, type ParteAporte,
  type Provento, type Sinal, type SubNota, type TaxasBCB, type Troca,
} from "../motor";
import type { Composicao } from "./composicao";

export type ItemFund = { ticker: string; name?: string; sector?: string; industry?: string; price?: number | null; fund?: (Fundamentos & { kind?: string }) | null; error?: string };
export type RegistroMes = { geral: number | null; ativos: Record<string, number> };
export type PrefSaude = { metas: Record<ClasseMeta, number>; meses: number; candidatos: string; aporte: string; hist: Record<string, RegistroMes> };
export const PREF_SAUDE: PrefSaude = { metas: METAS_PADRAO, meses: MESES_RESERVA_PADRAO, candidatos: "", aporte: "", hist: {} };

export type LinhaAtivo = {
  ticker: string; nome: string; kind: "acao" | "fii" | "cripto" | "exterior" | "rf"; valor: number; peso: number; nota: number | null; cobertura: number | null;
  av: Avaliacao | null; semOperacoes: boolean; incompleto: boolean; sinais: Sinal[]; liquidoVenda: number | null;
};
export type Saude = {
  valores: Record<ClasseMeta, number>; linhas: LinhaClasse[]; total: number;
  subs: SubNota[]; geral: number | null; reserva: ReturnType<typeof reserva> & { liquidez: number; meses: number };
  fgc: ReturnType<typeof fgc>; venc: ReturnType<typeof vencimentos>;
  ativos: LinhaAtivo[]; sinais: Sinal[]; trocas: Troca[];
  aporte: { partes: ParteAporte[]; compras: Record<string, Compra[]> } | null;
  renda: { proventos12m: number; dyCarteira: number | null };
  registro: RegistroMes;
};

export const mesDaData = (iso: string) => iso.slice(0, 7);
const ORDEM = { alta: 0, media: 1, info: 2 } as const;

export function calcularSaude({ comp, itens, rates, hoje, custoFixo, prefs, operacoes, proventos }: {
  comp: Composicao; itens: Record<string, ItemFund>; rates: TaxasBCB | null; hoje: string; custoFixo: number | null;
  prefs: PrefSaude; operacoes: Operacao[]; proventos: Provento[];
}): Saude {
  const cdi = rates?.cdi ?? [];
  const valores = {
    rf: comp.vRf, acao: comp.vAcoes - comp.vExt, fii: comp.vFiis, exterior: comp.vExt, cripto: comp.vCripto,
  } as Record<ClasseMeta, number>;
  const dist = distribuicao(valores, prefs.metas);
  const total = dist.total;
  const peso = (v: number) => total ? v / total : 0;
  const { posicoes, realizados } = processar(operacoes);
  const mes = mesDaData(hoje);
  const vendasAcoesMes = realizados.filter(r => r.classe === "acao" && !r.dayTrade && mesDaData(r.data) === mes).reduce((s, r) => s + r.venda, 0);
  const anteriores = (t: string) => Object.keys(prefs.hist).filter(m => m < mes).sort().reverse().map(m => prefs.hist[m].ativos[t]).filter((n): n is number => n != null);

  // Fundamentos de um ticker (da carteira ou da lista de candidatos)
  const analisa = (t: string) => {
    const it = itens[t], f = it?.fund;
    if (!f) return null;
    return f.kind === "fii" ? analisaFii(f, { nome: it.name }) : analisaAcao(f);
  };
  const classeDe = (t: string, padrao: Classe): Classe => posicoes[t]?.classe ?? padrao;
  const GRAVES = ["dy", "ffo", "pvp", "nota"];

  // ---------- Ativos de renda variável e cripto ----------
  const ativos: LinhaAtivo[] = [];
  for (const r of [...comp.rv, ...comp.cr]) {
    if (!r.value) continue;
    const cripto = r.kind === "cr", fii = r.type === "FII", ext = r.type === "Exterior";
    const kind: LinhaAtivo["kind"] = cripto ? "cripto" : fii ? "fii" : ext ? "exterior" : "acao";
    const a = cripto ? null : analisa(r.t), it = itens[r.t], pos = posicoes[r.t];
    const temOps = operacoes.some(o => o.ativo === r.t);
    const classe = classeDe(r.t, cripto ? "cripto" : fii ? "fii" : ext ? "exterior" : "acao");
    // sem ops, o custo é desconhecido; com ops, o IR de vender hoje (sem a isenção) desconta do valor para comparar com o CDI líquido
    const venda = temOps && pos ? custoDeVender(classe, pos.custo, r.value, Infinity) : null;
    const { fluxos, incompleto } = fluxosDoAtivo(operacoes, proventos, r.t);
    const av = temOps && venda ? avaliaFluxos(fluxos, venda.liquido, cdi, hoje) : null;
    const nota = a?.nota ?? null;
    const sinais = sinaisDoAtivo({
      ticker: r.t, kind: fii ? "fii" : cripto || ext ? "outro" : "acao", nota, notasAnteriores: anteriores(r.t), peso: peso(r.value),
      fund: it?.fund ?? null, preco: r.price, av,
    });
    ativos.push({ ticker: r.t, nome: it?.name ?? r.t, kind, valor: r.value, peso: peso(r.value), nota, cobertura: a?.cobertura ?? null, av, semOperacoes: !temOps, incompleto, sinais, liquidoVenda: venda?.liquido ?? null });
  }

  // ---------- Renda fixa ----------
  for (const t of comp.rf) {
    if (!t.calc) continue;
    const valor = t.calc.liquido;
    const av = avaliaFluxos([{ data: t.data, valor: -t.aplicado }], valor, cdi, hoje);
    const sinais = rates ? sinaisRF(t, rates, hoje, valor) : [];
    ativos.push({ ticker: t.nome, nome: t.nome, kind: "rf", valor, peso: peso(valor), nota: null, cobertura: null, av, semOperacoes: false, incompleto: false, sinais, liquidoVenda: valor });
  }

  // ---------- Concentração ----------
  const rv = ativos.filter(a => a.kind === "acao" || a.kind === "fii" || a.kind === "exterior" || a.kind === "cripto");
  const maiorAtivo = Math.max(0, ...rv.map(a => a.peso));
  const porSetor = new Map<string, number>();
  for (const a of ativos.filter(x => x.kind === "acao")) {
    const s = itens[a.ticker]?.sector;
    if (s) porSetor.set(s, (porSetor.get(s) ?? 0) + a.peso);
  }
  const [setorMax, maiorSetor] = [...porSetor.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];

  // ---------- Reserva, FGC, vencimentos, qualidade ----------
  const liquidez = comp.rf.filter(t => t.calc && (t.tipo === "Tesouro Selic" || t.liquidezDiaria) && !(t.venc && t.venc <= hoje)).reduce((s, t) => s + t.calc!.liquido, 0);
  const res = { ...reserva(liquidez, custoFixo ?? 0, prefs.meses), liquidez, meses: prefs.meses };
  const fg = fgc(comp.rf.filter(t => t.calc).map(t => ({ instituicao: t.instituicao, tipo: t.tipo, valor: t.calc!.liquido })));
  const venc = vencimentos(comp.rf.filter(t => t.calc).map(t => ({ venc: t.venc, valor: t.calc!.liquido })));
  const comNota = ativos.filter(a => a.nota != null);
  const valorNota = comNota.reduce((s, a) => s + a.valor, 0);
  const qualidade = valorNota ? Math.round(comNota.reduce((s, a) => s + a.nota! * a.valor, 0) / valorNota) : null;
  const cobertoNota = total ? valorNota / total : 0;

  const R = (v: number) => "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const P = (v: number) => (v * 100).toFixed(0) + "%";
  const subs: SubNota[] = [
    {
      id: "reserva", nome: "Reserva de emergência", peso: 20, nota: custoFixo ? res.nota : null,
      resumo: custoFixo ? `${res.atual!.toFixed(1).replace(".", ",")} de ${prefs.meses} meses dos custos fixos (${R(custoFixo)}/mês) em liquidez diária` : "Sem custos fixos no Orçamento para medir",
      acao: custoFixo ? (res.falta > 0 ? `Faltam ${R(res.falta)} em Tesouro Selic ou título com liquidez diária.` : null) : "Lance seus custos fixos no Orçamento (área Custos fixos).",
    },
    {
      id: "concentracao", nome: "Concentração", peso: 20, nota: rv.length ? notaConcentracao(maiorAtivo, maiorSetor) : null,
      resumo: rv.length ? `Maior ativo: ${P(maiorAtivo)} da carteira${setorMax ? `; maior setor de ações: ${setorMax}, ${P(maiorSetor)}` : ""}` : "Sem renda variável",
      acao: maiorAtivo > 0.15 ? `Um ativo passa de 15%: direcione os aportes para outros.` : maiorSetor > 0.35 ? `O setor ${setorMax} passa de 35% da carteira.` : null,
    },
    {
      id: "metas", nome: "Alinhamento às metas", peso: 15, nota: total ? notaMetas(dist.linhas) : null,
      resumo: total ? `Desvio médio de ${(dist.linhas.reduce((s, l) => s + Math.abs(l.desvio), 0) / dist.linhas.length).toFixed(1).replace(".", ",")} p.p. entre as classes` : "Carteira vazia",
      acao: total ? "Aportes novos corrigem o desvio sem vender nada (veja “Onde aportar”)." : null,
    },
    {
      id: "qualidade", nome: "Qualidade dos ativos", peso: 20, nota: qualidade,
      resumo: qualidade != null ? `Nota média ${qualidade} (ponderada pelo valor; ${P(cobertoNota)} da carteira tem nota)` : "Nenhum ativo com indicadores do Fundamentus",
      acao: qualidade != null && qualidade < 60 ? "Veja os ativos de nota baixa em “Quem está compensando” e “Trocas”." : null,
    },
    {
      id: "fgc", nome: "Limite do FGC", peso: 15, nota: fg.coberto > 0 ? Math.round(notaLinear(fg.excesso / fg.coberto, 0.3, 0)) : null,
      resumo: fg.coberto > 0 ? (fg.excesso > 0 ? `${R(fg.excesso)} acima de R$ 250 mil em ${fg.linhas.filter(l => l.excesso > 0).length} instituição(ões)` : "Nenhuma instituição passa de R$ 250 mil") + (fg.semInstituicao ? `; ${R(fg.semInstituicao)} sem instituição informada` : "") : "Sem CDB, LCI ou LCA",
      acao: fg.excesso > 0 ? "Divida o excedente em outra instituição ou use Tesouro Direto, que não depende do FGC." : fg.semInstituicao ? "Informe o banco de cada título para checar o limite." : null,
    },
    {
      id: "vencimentos", nome: "Vencimentos", peso: 10, nota: venc.titulos >= 2 ? Math.round(notaLinear(venc.maior, 1, 0.4)) : null,
      resumo: venc.titulos >= 2 ? `Maior ano de vencimento concentra ${P(venc.maior)} da renda fixa` : "Menos de 2 títulos com vencimento",
      acao: venc.maior > 0.6 && venc.titulos >= 2 ? "Espalhe os próximos vencimentos (escada) para não reaplicar tudo numa taxa só." : null,
    },
  ];
  const geral = notaGeral(subs);

  // ---------- Candidatos (carteira + lista do usuário) e trocas ----------
  const tem = new Set(ativos.map(a => a.ticker));
  const tickers = [...new Set([...ativos.filter(a => a.kind === "acao" || a.kind === "fii").map(a => a.ticker), ...prefs.candidatos.split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean)])];
  const analisados = tickers.flatMap(t => {
    const it = itens[t], f = it?.fund, a = analisa(t);
    if (!it || !f || it.error) return [];
    const kind: "acao" | "fii" = f.kind === "fii" ? "fii" : "acao";
    const held = ativos.find(x => x.ticker === t);
    const pos = posicoes[t];
    const sinais = held?.sinais ?? sinaisDoAtivo({ ticker: t, kind, nota: a?.nota ?? null, peso: 0, fund: f, preco: it.price });
    return [{
      ticker: t, kind, setor: it.sector ?? null, tipoFii: kind === "fii" ? tipoFii(f.segmento, { imoveis: f.imoveis, nome: it.name }) : null,
      nota: a?.nota ?? null, dy: f.dy ?? 0, preco: it.price ?? 0, valor: held?.valor ?? 0, custo: pos?.custo ?? held?.valor ?? 0,
      classe: classeDe(t, kind), graves: sinais.filter(s => GRAVES.some(g => s.id.endsWith("-" + g))).length, peso: held?.peso ?? 0,
      tem: !!held, veredicto: held?.av?.veredicto, semCusto: !!held && (held.semOperacoes || !pos),
      pvp: f.pvp ?? null, margemGraham: kind === "acao" && f.pl && f.pvp && it.price ? precoGraham(it.price, f.pl, f.pvp)?.margem ?? null : null,
    }];
  });
  const trocas = sugerirTrocas(analisados, vendasAcoesMes);

  // ---------- Onde aportar ----------
  const valorAporte = Number(prefs.aporte.replace(",", "."));
  let aporte: Saude["aporte"] = null;
  if (valorAporte > 0 && total >= 0) {
    const partes = planoAporte(valorAporte, valores, prefs.metas, res.falta);
    const compras: Record<string, Compra[]> = {};
    for (const k of ["acao", "fii"] as const) {
      const parte = partes.find(p => p.classe === k)!;
      if (parte.valor <= 0) continue;
      const cands: Candidato[] = analisados.filter(x => x.kind === k).map(x => ({
        ticker: x.ticker, kind: x.kind, nota: x.nota, preco: x.preco, peso: x.peso, graves: x.graves, setor: x.setor, margemGraham: x.margemGraham, pvp: x.pvp, tem: x.tem,
      }));
      compras[k] = escolheAtivos(cands, parte.valor);
    }
    aporte = { partes, compras };
  }

  // ---------- Renda ----------
  const valorRv = comp.vAcoes + comp.vFiis;
  const renda = { proventos12m: comp.div12, dyCarteira: valorRv ? comp.div12 / valorRv * 100 : null };

  const sinais = ativos.flatMap(a => a.sinais).sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);
  const registro: RegistroMes = { geral, ativos: Object.fromEntries(ativos.filter(a => a.nota != null).map(a => [a.ticker, a.nota!])) };
  void tem; void CLASSES_META;
  return { valores, linhas: dist.linhas, total, subs, geral, reserva: res, fgc: fg, venc, ativos, sinais, trocas, aporte, renda, registro };
}
