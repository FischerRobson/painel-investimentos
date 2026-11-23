// Orçamento: tipos, contas puras e gravação no servidor.
// Cada mês é um documento (/api/budget/months/AAAA-MM) com ETag próprio; metas (/settings) e regras (/rules) também.
import { apiFetch, textoDoErro } from "./api";
import { salvarStore } from "./salvar";

export type AreaId = "fixedCosts" | "comfort" | "pleasures" | "education" | "financialFreedom";
export type Area = { id: AreaId; name: string; color: string; automatic?: boolean };
export const AREAS: Area[] = [
  { id: "fixedCosts", name: "Custos fixos", color: "--s1" },
  { id: "comfort", name: "Conforto", color: "--s3" },
  { id: "pleasures", name: "Prazeres", color: "--s5" },
  { id: "education", name: "Educação", color: "--s4" },
  { id: "financialFreedom", name: "Liberdade financeira", color: "--s7", automatic: true },
];
export const AREAS_MANUAIS = AREAS.filter(a => !a.automatic);
export const MEIOS: Record<string, string> = { creditCard: "Cartão", creditPix: "Pix no crédito", pix: "Pix", debitCard: "Débito", transfer: "Transferência", bill: "Boleto/conta", other: "Outro" };

export type Lancamento = { id: string; date: string; description: string; amount: number; method?: string; installment?: string; area?: AreaId; [outro: string]: unknown };
export type Mes = { incomes: Lancamento[]; expenses: Lancamento[] };
export type Metas = { targets: Partial<Record<AreaId, number>>; referenceIncome?: number };
export type Regra = { id: string; match: string; description: string; area?: AreaId };
export type ResumoMes = { month: string; income: number; expenses: number };
export type Tipo = "income" | "expense";
export const chaveDe = (t: Tipo) => t === "expense" ? "expenses" : "incomes";

// ---------- Meses ----------
export const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
export const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const somaMeses = (key: string, n: number) => { const [y, m] = key.split("-").map(Number); return mesDe(new Date(y, m - 1 + n, 1)); };
const dataDoMes = (key: string) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 15); };
export const tituloMes = (key: string) => { const s = dataDoMes(key).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return s[0].toUpperCase() + s.slice(1); };
export const mesCurto = (key: string) => { const d = dataDoMes(key); return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") + "/" + String(d.getFullYear()).slice(2); };
export const hojeIso = () => { const d = new Date(); return `${mesDe(d)}-${String(d.getDate()).padStart(2, "0")}`; };
export const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- Contas ----------
export function totais(d: Mes) {
  const areas = Object.fromEntries(AREAS.map(a => [a.id, 0])) as Record<string, number>;
  d.expenses.forEach(e => { areas[e.area ?? ""] = (areas[e.area ?? ""] || 0) + e.amount; });
  return { income: d.incomes.reduce((s, i) => s + i.amount, 0), expenses: d.expenses.reduce((s, e) => s + e.amount, 0), areas };
}
export type Totais = ReturnType<typeof totais>;
export const somaMetas = (t: Partial<Record<AreaId, number>>) => AREAS.reduce((s, a) => s + (Number(t[a.id]) || 0), 0);

// Renda que vale para as metas: a do mês; senão a de referência; senão a do último mês anterior com entradas
export type Referencia = { income: number; source: "month" | "setting" | "history" | null; month?: string };
export function referencia(t: Totais, metas: Metas, resumo: ResumoMes[], mes: string): Referencia {
  if (t.income > 0) return { income: t.income, source: "month" };
  if (metas.referenceIncome && metas.referenceIncome > 0) return { income: metas.referenceIncome, source: "setting" };
  const prev = resumo.filter(s => s.month < mes && s.income > 0).sort((a, b) => b.month.localeCompare(a.month))[0];
  return prev ? { income: prev.income, source: "history", month: prev.month } : { income: 0, source: null };
}

export type ValorArea = { area: Area; target: number; goal: number; spent: number };
export const valoresArea = (t: Totais, ref: Referencia, metas: Metas): ValorArea[] => AREAS.map(area => {
  const target = metas.targets[area.id] || 0;
  const spent = area.automatic ? Math.max(0, ref.income - t.expenses) : t.areas[area.id] || 0;
  return { area, target, goal: ref.income * target / 100, spent };
});

// ---------- Filtros da lista ----------
export const normText = (t: unknown) => String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export type Filtro = { kind: "all" | Tipo; area: string; method: string; q: string; from: string; to: string; sort: string };
export const FILTRO_PADRAO: Filtro = { kind: "all", area: "", method: "", q: "", from: "", to: "", sort: "date-desc" };
export const filtroAtivo = (f: Filtro) => (Object.keys(FILTRO_PADRAO) as (keyof Filtro)[]).some(k => k !== "sort" && f[k] !== FILTRO_PADRAO[k]);
export type ItemLista = Lancamento & { kind: Tipo };
export function filtrar(d: Mes, f: Filtro): ItemLista[] {
  const q = normText(f.q);
  const list: ItemLista[] = [
    ...(f.kind !== "expense" && !f.area ? d.incomes.map(x => ({ ...x, kind: "income" as const })) : []),
    ...(f.kind !== "income" ? d.expenses.map(x => ({ ...x, kind: "expense" as const })) : []),
  ].filter(x => (!f.area || x.area === f.area) && (!f.method || x.method === f.method)
    && (!f.from || x.date >= f.from) && (!f.to || x.date <= f.to) && (!q || normText(x.description).includes(q)));
  const [key, dir] = f.sort.split("-"), sign = dir === "asc" ? 1 : -1;
  const byText = (a: ItemLista, b: ItemLista) => a.description.localeCompare(b.description, "pt-BR");
  return list.sort(key === "amount"
    ? (a, b) => sign * (a.amount - b.amount) || byText(a, b)
    : (a, b) => sign * a.date.localeCompare(b.date) || byText(a, b));
}

// ---------- Regras de descrição ----------
// A regra mais específica (trecho mais longo) que a descrição contém, sem diferenciar maiúsculas e acentos
export function regraPara(descricao: string, regras: Regra[]): Regra | null {
  const text = normText(descricao);
  return [...regras].sort((a, b) => normText(b.match).length - normText(a.match).length)
    .find(r => normText(r.match) && text.includes(normText(r.match))) || null;
}
// Aplica a regra aos lançamentos do mês; changed = quantos mudaram
export function aplicarRegra(d: Mes, regra: Regra): { mes: Mes; changed: number } {
  let changed = 0;
  const hits = (t: string) => regraPara(t, [regra]) !== null;
  const rename = (x: Lancamento, isExpense: boolean) => {
    if (!hits(x.description) || x.description === regra.description && (!regra.area || !isExpense || x.area === regra.area)) return x;
    changed++;
    return { ...x, description: regra.description, ...(regra.area && isExpense ? { area: regra.area } : {}) };
  };
  const mes = { ...d, incomes: d.incomes.map(x => rename(x, false)), expenses: d.expenses.map(x => rename(x, true)) };
  return { mes, changed };
}

// ---------- Lançamentos recorrentes ----------
// Regra: aluguel, assinaturas, salário... Cada mês aberto ganha o lançamento da regra (id "rec-{regra}-{mês}", que não duplica);
// "gerados" guarda mês → regras já criadas, então um lançamento apagado não volta.
export type RegraRecorrente = {
  id: string; kind: Tipo; description: string; amount: number; area?: AreaId; method?: string;
  day: number; start: string; end?: string;
};
export type DocRecorrentes = { rules: RegraRecorrente[]; generated: Record<string, string[]> };

export const idRecorrente = (regraId: string, mes: string) => `rec-${regraId}-${mes}`;
export const ehRecorrente = (id: string) => id.startsWith("rec-");
export const regraAtiva = (r: RegraRecorrente, mes: string) => r.start <= mes && (!r.end || r.end >= mes);
// Data da regra no mês (mês mais curto usa o último dia)
export function dataDaRegra(r: RegraRecorrente, mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(Math.min(r.day, new Date(y, m, 0).getDate())).padStart(2, "0")}`;
}

// Cria no mês os lançamentos das regras ativas que ainda não foram criados. Só vale para o mês atual e os anteriores:
// meses futuros aparecem como "previsto" (projetarRecorrentes) e são criados quando chegarem.
export function gerarDoMes(mes: string, dados: Mes, doc: DocRecorrentes, hoje: string): { mes: Mes; regras: string[]; criados: number } {
  const ja = new Set(doc.generated[mes] ?? []);
  if (mes > hoje.slice(0, 7)) return { mes: dados, regras: [...ja], criados: 0 };
  const existentes = new Set([...dados.incomes, ...dados.expenses].map(x => x.id));
  const incomes = [...dados.incomes], expenses = [...dados.expenses];
  let criados = 0;
  for (const r of doc.rules) {
    if (!regraAtiva(r, mes) || ja.has(r.id)) continue;
    ja.add(r.id);
    const id = idRecorrente(r.id, mes);
    if (existentes.has(id)) continue; // já existe (marcação perdida): só registra
    const base = { id, date: dataDaRegra(r, mes), description: r.description, amount: r.amount, ...(r.method ? { method: r.method } : {}) };
    if (r.kind === "income") incomes.push(base); else expenses.push({ ...base, area: r.area });
    criados++;
  }
  return { mes: criados ? { incomes, expenses } : dados, regras: [...ja], criados };
}

// O que as regras ainda vão criar em cada mês futuro (para o "comprometido" dos próximos meses)
export function projetarRecorrentes(doc: DocRecorrentes, mes: string, dados: Mes): { entradas: number; saidas: number } {
  const ja = new Set(doc.generated[mes] ?? []);
  const existentes = new Set([...dados.incomes, ...dados.expenses].map(x => x.id));
  let entradas = 0, saidas = 0;
  for (const r of doc.rules) {
    if (!regraAtiva(r, mes) || ja.has(r.id) || existentes.has(idRecorrente(r.id, mes))) continue;
    if (r.kind === "income") entradas += r.amount; else saidas += r.amount;
  }
  return { entradas, saidas };
}

export type LinhaProximoMes = { mes: string; parcelas: number; qtdParcelas: number; recorrentes: number; outros: number; total: number; entradas: number };
// Comprometido de um mês futuro: parcelas do cartão já lançadas, recorrentes (lançados ou previstos) e outros lançamentos
export function comprometidoDoMes(mes: string, dados: Mes, doc: DocRecorrentes): LinhaProximoMes {
  let parcelas = 0, qtdParcelas = 0, recorrentes = 0, outros = 0;
  for (const e of dados.expenses) {
    if (e.installment) { parcelas += e.amount; qtdParcelas++; }
    else if (ehRecorrente(e.id)) recorrentes += e.amount;
    else outros += e.amount;
  }
  const previsto = projetarRecorrentes(doc, mes, dados);
  recorrentes += previsto.saidas;
  const entradas = dados.incomes.reduce((s, i) => s + i.amount, 0) + previsto.entradas;
  return { mes, parcelas, qtdParcelas, recorrentes, outros, total: parcelas + recorrentes + outros, entradas };
}

// ---------- Avisos de gasto ----------
export type Aviso = { area: AreaId; nivel: "estourou" | "quase" | "ritmo"; texto: string };
export const LIMITE_AVISO = 0.8;
const dinheiro = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Áreas que passaram da meta, que já usaram 80% dela ou que, no ritmo do mês, vão passar. Só vale para o mês atual.
// Custos fixos ficam fora do ritmo (aluguel e contas caem no começo do mês e distorceriam a projeção).
export function avisosDeGasto(areas: ValorArea[], ref: Referencia, hoje: string, mes: string): Aviso[] {
  if (mes !== hoje.slice(0, 7) || !(ref.income > 0)) return [];
  const [y, m] = mes.split("-").map(Number);
  const dias = new Date(y, m, 0).getDate(), dia = Number(hoje.slice(8)), faltam = dias - dia;
  const out: Aviso[] = [];
  for (const v of areas) {
    if (v.area.automatic || !(v.goal > 0)) continue;
    const uso = v.spent / v.goal;
    const falta = faltam === 0 ? "hoje é o último dia" : `${faltam === 1 ? "falta 1 dia" : `faltam ${faltam} dias`}`;
    if (uso > 1) out.push({ area: v.area.id, nivel: "estourou", texto: `${v.area.name} passou da meta: ${dinheiro(v.spent)} de ${dinheiro(v.goal)} (${dinheiro(v.spent - v.goal)} acima), ${falta}.` });
    else if (uso >= LIMITE_AVISO) out.push({ area: v.area.id, nivel: "quase", texto: `${v.area.name} já usou ${Math.round(uso * 100)}% da meta (${dinheiro(v.spent)} de ${dinheiro(v.goal)}); sobram ${dinheiro(v.goal - v.spent)} e ${falta}.` });
    else if (v.area.id !== "fixedCosts" && dia >= 5 && v.spent > 0) {
      const projecao = v.spent / dia * dias;
      if (projecao > v.goal) out.push({ area: v.area.id, nivel: "ritmo", texto: `No ritmo atual, ${v.area.name} passa da meta: projeção de ${dinheiro(projecao)} no mês contra ${dinheiro(v.goal)}.` });
    }
  }
  const peso = { estourou: 0, quase: 1, ritmo: 2 };
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

// ---------- Servidor ----------
const etagDe = (r: Response) => (r.headers.get("ETag") || "").replace(/"/g, "") || null;
const condicional = (etag: string | null): Record<string, string> =>
  etag ? { "If-Match": `"${etag}"` } : { "If-None-Match": "*" };

export const efeitos = {
  conflito: (quem: string) => {
    alert(`${quem} em outro dispositivo. A página vai recarregar com a versão mais recente.`);
    location.reload();
  },
};

async function getComEtag<T>(url: string): Promise<{ v: T; etag: string | null }> {
  const r = await apiFetch(url);
  if (!r.ok) throw new Error(await textoDoErro(r));
  return { v: await r.json() as T, etag: etagDe(r) };
}

const etagsMes: Record<string, string | null> = {};
let etagMetas: string | null = null, etagRegras: string | null = null, etagRecorrentes: string | null = null;

export const api = {
  async metas() { const { v, etag } = await getComEtag<Metas>("/api/budget/settings"); etagMetas = etag; return v; },
  async regras() { const { v, etag } = await getComEtag<{ rules: Regra[] }>("/api/budget/rules"); etagRegras = etag; return v; },
  async mes(m: string) { const { v, etag } = await getComEtag<Mes>(`/api/budget/months/${m}`); etagsMes[m] = etag; return v; },
  // Leitura de um mês sem guardar o ETag (próximos meses): quem edita o mês é a tela principal
  async lerMes(m: string): Promise<Mes> { return (await getComEtag<Mes>(`/api/budget/months/${m}`)).v; },
  async recorrentes(): Promise<DocRecorrentes> {
    const { v, etag } = await getComEtag<Partial<DocRecorrentes>>("/api/budget/recurring");
    etagRecorrentes = etag;
    return { rules: v.rules ?? [], generated: v.generated ?? {} };
  },
  // Grava as regras e o que já foi gerado; null se deu certo, ou a mensagem do erro
  async salvarRecorrentes(doc: DocRecorrentes): Promise<string | null> {
    let erro: string | null = null;
    await put("/api/budget/recurring", doc, etagRecorrentes, e => { etagRecorrentes = e; }, "Os lançamentos recorrentes foram alterados", msg => { erro = msg; });
    return erro;
  },
  async resumo(m: string): Promise<ResumoMes[]> {
    const r = await apiFetch(`/api/budget/summary?to=${m}&months=12`);
    return r.ok ? r.json() : [];
  },
  // Metas e regras gravam na hora (sem agrupar); true quando o servidor aceitou
  async salvarMetas(m: Metas): Promise<boolean> {
    return put("/api/budget/settings", m, etagMetas, e => { etagMetas = e; }, "As metas foram alteradas");
  },
  async salvarRegras(rules: Regra[]): Promise<string | null> {
    let erro: string | null = null;
    await put("/api/budget/rules", { rules }, etagRegras, e => { etagRegras = e; }, "As regras foram alteradas", msg => { erro = msg; });
    return erro;
  },
};

async function put(url: string, body: unknown, etag: string | null, novaEtag: (e: string | null) => void, quem: string,
  aoErrar?: (msg: string) => void): Promise<boolean> {
  salvarStore.definir({ estado: "pendente" });
  try {
    const r = await apiFetch(url, { method: "PUT", headers: { "Content-Type": "application/json", ...condicional(etag) }, body: JSON.stringify(body) });
    if (r.status === 412) {
      salvarStore.definir({ estado: "erro", msg: "conflito" });
      efeitos.conflito(quem);
      return false;
    }
    if (!r.ok) throw new Error(await textoDoErro(r));
    novaEtag(etagDe(r));
    salvarStore.definir({ estado: "ok" });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    salvarStore.definir({ estado: "erro", msg });
    aoErrar?.(msg);
    return false;
  }
}

// Lançamentos do mês: alterações seguidas (400 ms) viram um PUT só; os PUTs saem um de cada vez
let timer: ReturnType<typeof setTimeout> | undefined;
let pendente: { mes: string; body: string } | null = null;
let fila: Promise<unknown> = Promise.resolve();
export const gravacaoMes = {
  agendar(mes: string, d: Mes): void {
    clearTimeout(timer);
    salvarStore.definir({ estado: "pendente" });
    pendente = { mes, body: JSON.stringify(d) };
    timer = setTimeout(() => void gravacaoMes.descarregar(), 400);
  },
  // Grava já o que estiver pendente (antes de trocar de mês ou de importar)
  descarregar(): Promise<unknown> {
    clearTimeout(timer);
    if (!pendente) return fila;
    const { mes, body } = pendente;
    pendente = null;
    fila = fila.then(() => put(`/api/budget/months/${mes}`, JSON.parse(body), etagsMes[mes] ?? null, e => { etagsMes[mes] = e; }, "Este mês foi alterado"));
    return fila;
  },
};
