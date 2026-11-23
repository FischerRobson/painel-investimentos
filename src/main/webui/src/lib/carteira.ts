// Documento da carteira (/api/carteira): um JSON único por usuário, com controle de versão por ETag.
// Cada PUT manda If-Match com a versão lida (If-None-Match: * quando ainda não existe); se outro dispositivo salvou antes,
// o servidor responde 412 e a página recarrega com a versão mais recente. Alterações seguidas (400 ms) viram um PUT só,
// e os PUTs saem um de cada vez. Mesmo protocolo do app atual (persist/doPersist do index.html).
//
// Diferença proposital: o documento é guardado inteiro, e cada página troca só o campo dela. Assim o React não apaga
// campos que ainda não conhece (o app atual monta o documento a partir das variáveis de todas as páginas).
import { useEffect, useSyncExternalStore } from "react";
import { apiFetch, textoDoErro } from "./api";

export type Moeda = { c: string; q: number };
export type Bem = {
  id: string; type: string; brand: string; model: string; year: string; apelido: string | null;
  info?: { brand: string; model: string; modelYear: number | string; fuel: string; codeFipe: string };
  last?: { month: string; price: number };
  hist?: Record<string, number>;
};
export type DocCarteira = {
  acoesFiis?: unknown[]; cripto?: unknown[]; rendaFixa?: unknown[];
  moedas?: Moeda[]; bens?: Bem[];
  preferencias?: Record<string, unknown>;
  [outro: string]: unknown;
};

export type EstadoSalvar = { estado: "" | "pendente" | "ok" | "erro"; msg?: string };
type Estado = { doc: DocCarteira | null; erro: string | null; salvar: EstadoSalvar };

const DEBOUNCE_MS = 400;
let estado: Estado = { doc: null, erro: null, salvar: { estado: "" } };
let etag: string | null = null; // null = ainda não existe no servidor
let carregando: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let fila: Promise<void> = Promise.resolve();
let okTimer: ReturnType<typeof setTimeout> | undefined;
const ouvintes = new Set<() => void>();

// Pontos de troca para os testes (o jsdom não deixa trocar location.reload nem confirma alertas)
export const efeitos = {
  conflito: () => {
    alert("Seus dados foram alterados em outro dispositivo. A página vai recarregar com a versão mais recente.");
    location.reload();
  },
};

function mudar(parcial: Partial<Estado>): void {
  estado = { ...estado, ...parcial };
  ouvintes.forEach(fn => fn());
}
const etagDe = (r: Response) => (r.headers.get("ETag") || "").replace(/"/g, "") || null;

export const carteiraStore = {
  get: (): Estado => estado,
  subscribe(fn: () => void) { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },

  // Carrega uma vez por página aberta. 404 = carteira ainda não criada (documento vazio).
  carregar(): Promise<void> {
    carregando ??= (async () => {
      try {
        const r = await apiFetch("/api/carteira");
        if (r.status === 404) { etag = null; mudar({ doc: {}, erro: null }); return; }
        if (!r.ok) throw new Error(await textoDoErro(r));
        etag = etagDe(r);
        mudar({ doc: await r.json(), erro: null });
      } catch (e) {
        carregando = null; // deixa tentar de novo
        mudar({ erro: e instanceof Error ? e.message : String(e) });
      }
    })();
    return carregando;
  },

  // Troca uma parte do documento e agenda a gravação
  atualizar(fn: (doc: DocCarteira) => DocCarteira): void {
    if (!estado.doc) throw new Error("carteira ainda não carregada");
    mudar({ doc: fn(estado.doc) });
    clearTimeout(timer);
    clearTimeout(okTimer);
    mudar({ salvar: { estado: "pendente" } });
    timer = setTimeout(() => { fila = fila.then(gravar); }, DEBOUNCE_MS);
  },

  // Lê de novo do servidor (depois de importar um backup, que substitui o documento inteiro)
  recarregar(): Promise<void> {
    clearTimeout(timer);
    carregando = null;
    return carteiraStore.carregar();
  },

  // Só para os testes
  _reiniciar(): void {
    clearTimeout(timer); clearTimeout(okTimer);
    estado = { doc: null, erro: null, salvar: { estado: "" } };
    etag = null; carregando = null; fila = Promise.resolve();
  },
};

async function gravar(): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (etag) headers["If-Match"] = `"${etag}"`; else headers["If-None-Match"] = "*";
  try {
    const r = await apiFetch("/api/carteira", { method: "PUT", headers, body: JSON.stringify(estado.doc) });
    if (r.status === 412) {
      mudar({ salvar: { estado: "erro", msg: "conflito" } });
      efeitos.conflito();
      return;
    }
    if (!r.ok) throw new Error(await textoDoErro(r));
    etag = etagDe(r);
    mudar({ salvar: { estado: "ok" } });
    okTimer = setTimeout(() => { if (estado.salvar.estado === "ok") mudar({ salvar: { estado: "" } }); }, 2500);
  } catch (e) {
    mudar({ salvar: { estado: "erro", msg: e instanceof Error ? e.message : String(e) } });
  }
}

// Carteira na página: carrega na primeira vez e re-renderiza a cada mudança
export function useCarteira(): Estado {
  useEffect(() => { void carteiraStore.carregar(); }, []);
  return useSyncExternalStore(carteiraStore.subscribe, carteiraStore.get);
}

export function useEstadoSalvar(): EstadoSalvar {
  return useSyncExternalStore(carteiraStore.subscribe, () => estado.salvar);
}

export const textoSalvar = (s: EstadoSalvar): string =>
  ({ pendente: "Salvando…", ok: "Salvo ✓", erro: "Erro ao salvar: " + (s.msg ?? ""), "": "" })[s.estado];
