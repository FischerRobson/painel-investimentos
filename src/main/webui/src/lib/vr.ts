// VR (/api/budget/vr): um documento com as contas e os lançamentos, versionado por ETag. Alterações seguidas (400 ms)
// viram um PUT só; se outro dispositivo salvou antes (412), a página recarrega. Mesmo protocolo da carteira.
import { useEffect, useSyncExternalStore } from "react";
import { apiFetch, textoDoErro } from "./api";
import { salvarStore } from "./salvar";
import type { ContaVR, MovimentoVR } from "../motor";

export type DocVR = { contas: ContaVR[]; movimentos: MovimentoVR[] };
type Estado = { doc: DocVR | null; erro: string | null };

let estado: Estado = { doc: null, erro: null };
let etag: string | null = null;
let carregando: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let fila: Promise<void> = Promise.resolve();
const ouvintes = new Set<() => void>();

export const efeitosVR = {
  conflito: () => {
    alert("O VR foi alterado em outro dispositivo. A página vai recarregar com a versão mais recente.");
    location.reload();
  },
};

const mudar = (p: Partial<Estado>) => { estado = { ...estado, ...p }; ouvintes.forEach(fn => fn()); };
const etagDe = (r: Response) => (r.headers.get("ETag") || "").replace(/"/g, "") || null;

export const vrStore = {
  get: () => estado,
  subscribe(fn: () => void) { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
  carregar(): Promise<void> {
    carregando ??= (async () => {
      try {
        const r = await apiFetch("/api/budget/vr");
        if (!r.ok) throw new Error(await textoDoErro(r));
        etag = etagDe(r);
        const j = await r.json() as Partial<DocVR>;
        mudar({ doc: { contas: j.contas ?? [], movimentos: j.movimentos ?? [] }, erro: null });
      } catch (e) {
        carregando = null;
        mudar({ erro: e instanceof Error ? e.message : String(e) });
      }
    })();
    return carregando;
  },
  atualizar(fn: (d: DocVR) => DocVR): void {
    if (!estado.doc) return;
    mudar({ doc: fn(estado.doc) });
    clearTimeout(timer);
    salvarStore.definir({ estado: "pendente" });
    timer = setTimeout(() => { fila = fila.then(gravar); }, 400);
  },
  _reiniciar(): void { clearTimeout(timer); estado = { doc: null, erro: null }; etag = null; carregando = null; fila = Promise.resolve(); },
};

async function gravar(): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(etag ? { "If-Match": `"${etag}"` } : { "If-None-Match": "*" }) };
  try {
    const r = await apiFetch("/api/budget/vr", { method: "PUT", headers, body: JSON.stringify(estado.doc) });
    if (r.status === 412) { salvarStore.definir({ estado: "erro", msg: "conflito" }); efeitosVR.conflito(); return; }
    if (!r.ok) throw new Error(await textoDoErro(r));
    etag = etagDe(r);
    salvarStore.definir({ estado: "ok" });
  } catch (e) {
    salvarStore.definir({ estado: "erro", msg: e instanceof Error ? e.message : String(e) });
  }
}

export function useVR(): Estado {
  useEffect(() => { void vrStore.carregar(); }, []);
  return useSyncExternalStore(vrStore.subscribe, vrStore.get);
}

export const novoIdVR = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
