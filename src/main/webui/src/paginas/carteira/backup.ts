// Backup da carteira: exporta um JSON com tudo (carteira, histórico, preferências e orçamento) e importa substituindo os dados
// salvos no servidor (/api/backup/import). Mesmo formato do app atual (app: "painel-acoes", versao: 1).
import { apiFetch, textoDoErro } from "../../lib/api";
import { carteiraStore } from "../../lib/carteira";
import { DEMO } from "../../lib/store";
import { hojeISO } from "../../lib/dados";
import { LISTA_PADRAO } from "../Ativos";

export async function exportarBackup(historico: Record<string, unknown>): Promise<void> {
  const doc = carteiraStore.get().doc;
  if (!doc) return;
  let budget: unknown;
  try {
    const r = await apiFetch("/api/backup");
    if (!r.ok) throw new Error(await textoDoErro(r));
    budget = (await r.json()).budget;
  } catch (e) { return alert("Não foi possível incluir o orçamento no backup: " + (e as Error).message); }
  const prefs = doc.preferencias ?? {};
  const listaPainel = typeof prefs.listaPainel === "string" && prefs.listaPainel.trim() ? prefs.listaPainel : LISTA_PADRAO;
  const payload = {
    app: "painel-acoes", versao: 1, exportadoEm: new Date().toISOString(),
    acoesFiis: doc.acoesFiis ?? [], cripto: doc.cripto ?? [], rendaFixa: doc.rendaFixa ?? [], moedas: doc.moedas ?? [], bens: doc.bens ?? [],
    historico, listaPainel,
    // todas as preferências guardadas na carteira (o app atual só conhece projecao, simulador e listaPainel)
    preferencias: { ...prefs, listaPainel }, budget,
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
  const resumo = `${n("acoesFiis")} ações/FIIs, ${n("cripto")} cripto, ${n("rendaFixa")} títulos de renda fixa, ${n("moedas")} moedas, ${n("bens")} bens e ${Object.keys(d.historico || {}).length} dias de histórico`;
  if (!confirm(`Importar backup com ${resumo}?\n\nIsso SUBSTITUI todos os seus dados salvos no servidor.`)) return false;
  try {
    const r = await apiFetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    if (!r.ok) throw new Error(await textoDoErro(r));
  } catch (e) { alert("O servidor recusou o backup: " + (e as Error).message); return false; }
  return true;
}
