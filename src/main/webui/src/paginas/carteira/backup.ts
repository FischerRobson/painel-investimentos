// Backup do painel: exporta um JSON com tudo (carteira, histórico, posições diárias, orçamento e preferências) e importa
// substituindo os dados salvos no servidor (/api/backup/import). As posições diárias vão em lotes por /api/backup/positions.
// Formato: app "painel-acoes", versao 1; posicoes e preferenciasNavegador não existem em backups antigos.
import { apiFetch, textoDoErro } from "../../lib/api";
import { carteiraStore } from "../../lib/carteira";
import { DEMO, store } from "../../lib/store";
import { hojeISO } from "../../lib/dados";
import { LISTA_PADRAO } from "../Ativos";

// Preferências das ferramentas que ficam só neste navegador (usePreferencia)
export const PREFS_NAVEGADOR = ["ipcaPre", "comparador", "marcacao", "analisador", "planejador"];
const DIAS_POR_LOTE = 30; // PositionsBatch.MAX_DAYS no servidor

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

async function lerPosicoes(): Promise<unknown[]> {
  const dias: unknown[] = [];
  let depois: string | null = null;
  do {
    const r: Response = await apiFetch("/api/backup/positions" + (depois ? `?after=${depois}` : ""));
    if (!r.ok) throw new Error(await textoDoErro(r));
    const lote: { days: unknown[]; next?: string | null } = await r.json();
    dias.push(...lote.days);
    depois = lote.next ?? null;
  } while (depois);
  return dias;
}

function preferenciasDoNavegador(): Record<string, unknown> {
  return Object.fromEntries(PREFS_NAVEGADOR.map(k => [k, store.json<unknown>(k, null)] as const).filter(([, v]) => ehObjeto(v)));
}

async function enviar(url: string, corpo: unknown): Promise<void> {
  const r = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(await textoDoErro(r));
}

export async function exportarBackup(historico: Record<string, unknown>): Promise<void> {
  const doc = carteiraStore.get().doc;
  if (!doc) return;
  let budget: unknown;
  let posicoes: unknown[];
  try {
    const r = await apiFetch("/api/backup");
    if (!r.ok) throw new Error(await textoDoErro(r));
    budget = (await r.json()).budget;
    posicoes = await lerPosicoes();
  } catch (e) { return alert("Não foi possível gerar o backup completo: " + (e as Error).message); }
  const prefs = doc.preferencias ?? {};
  const listaPainel = typeof prefs.listaPainel === "string" && prefs.listaPainel.trim() ? prefs.listaPainel : LISTA_PADRAO;
  const payload = {
    app: "painel-acoes", versao: 1, exportadoEm: new Date().toISOString(),
    acoesFiis: doc.acoesFiis ?? [], cripto: doc.cripto ?? [], rendaFixa: doc.rendaFixa ?? [], moedas: doc.moedas ?? [], bens: doc.bens ?? [],
    historico, listaPainel, operacoes: doc.operacoes ?? [], proventos: doc.proventos ?? [],
    // todas as preferências guardadas na carteira
    preferencias: { ...prefs, listaPainel }, budget, posicoes, preferenciasNavegador: preferenciasDoNavegador(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `carteira-backup-${hojeISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

type Backup = { app?: string; historico?: Record<string, unknown>; [lista: string]: unknown };

// true quando o servidor aceitou o backup (a página precisa recarregar a carteira)
export async function importarBackup(file: File): Promise<boolean> {
  if (DEMO) { alert("Importar backup não está disponível no modo demonstração."); return false; }
  let d: Backup;
  try { d = JSON.parse(await file.text()); } catch { alert("Esse arquivo não é um backup válido (JSON inválido)."); return false; }
  if (!d || d.app !== "painel-acoes") { alert("Esse arquivo não parece ser um backup deste painel."); return false; }
  const n = (k: string) => Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0;
  const resumo = `${n("acoesFiis")} ações/FIIs, ${n("cripto")} cripto, ${n("rendaFixa")} títulos de renda fixa, ${n("moedas")} moedas, ${n("bens")} bens, ${n("operacoes")} operações, ${n("proventos")} proventos, ${Object.keys(d.historico || {}).length} dias de histórico e ${n("posicoes")} dias de posições`;
  if (!confirm(`Importar backup com ${resumo}?\n\nIsso SUBSTITUI todos os seus dados salvos no servidor.`)) return false;
  const { posicoes, preferenciasNavegador, ...principal } = d;
  try {
    await enviar("/api/backup/import", principal);
  } catch (e) { alert("O servidor recusou o backup: " + (e as Error).message); return false; }
  if (ehObjeto(preferenciasNavegador)) {
    for (const k of PREFS_NAVEGADOR) {
      const v = preferenciasNavegador[k];
      if (ehObjeto(v)) store.set(k, JSON.stringify(v));
    }
  }
  const dias = Array.isArray(posicoes) ? posicoes : [];
  try {
    for (let i = 0; i < dias.length; i += DIAS_POR_LOTE) await enviar("/api/backup/positions", { days: dias.slice(i, i + DIAS_POR_LOTE) });
  } catch (e) {
    alert("O backup foi importado, mas as posições diárias falharam: " + (e as Error).message + "\n\nImporte o mesmo arquivo de novo para completar.");
  }
  return true;
}
