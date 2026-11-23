// Documento da carteira (/api/carteira): um JSON único por usuário, com controle de versão por ETag.
// Cada PUT manda If-Match com a versão lida (If-None-Match: * quando ainda não existe); se outro dispositivo salvou antes,
// o servidor responde 412 e a página recarrega com a versão mais recente. Alterações seguidas (400 ms) viram um PUT só,
// e os PUTs saem um de cada vez. O documento é guardado inteiro, e cada página troca só o campo dela.
//
// Sem carteira no servidor (404), os dados da versão antiga do painel, que guardava tudo no localStorage, são oferecidos
// para envio (uma vez só por navegador: chave "migrado").
import { useEffect, useSyncExternalStore } from "react";
import { apiFetch, textoDoErro } from "./api";
import { salvarStore, textoSalvar, type EstadoSalvar } from "./salvar";
import { store } from "./store";

export { textoSalvar, type EstadoSalvar };

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
  confirmar: (msg: string) => confirm(msg),
  conflito: () => {
    alert("Seus dados foram alterados em outro dispositivo. A página vai recarregar com a versão mais recente.");
    location.reload();
  },
};

function mudar(parcial: Partial<Estado>): void {
  estado = { ...estado, ...parcial };
  if (parcial.salvar) salvarStore.definir(parcial.salvar); // indicador do cabeçalho
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
        let r = await apiFetch("/api/carteira");
        if (r.status === 404 && await enviarDadosAntigos()) r = await apiFetch("/api/carteira");
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

// Dados da versão antiga deste navegador (localStorage), no formato do backup; null se não houver nada
export function backupDoNavegador(): Record<string, unknown> | null {
  const arr = (k: string) => { const v = store.json<unknown>(k, []); return Array.isArray(v) ? v : []; };
  const obj = (k: string) => { const v = store.json<unknown>(k, {}); return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; };
  const b = {
    app: "painel-acoes", versao: 1, acoesFiis: arr("carteira"), cripto: arr("carteira_cripto"), rendaFixa: arr("carteira_rf"),
    moedas: arr("carteira_moedas"), bens: arr("carteira_bens"), historico: obj("historico_patrimonio"),
    listaPainel: store.get("tickers", ""), preferencias: { projecao: obj("projecao"), simulador: obj("simulador") },
  };
  const tem = b.acoesFiis.length || b.cripto.length || b.rendaFixa.length || b.moedas.length || b.bens.length || Object.keys(b.historico).length;
  return tem ? b : null;
}

// true quando enviou os dados antigos para o servidor
async function enviarDadosAntigos(): Promise<boolean> {
  if (store.get("migrado", "0") === "1") return false;
  const antigo = backupDoNavegador();
  if (!antigo) return false;
  store.set("migrado", "1"); // pergunta uma vez só
  if (!efeitos.confirmar("Encontrei uma carteira salva neste navegador (versão antiga).\n\nQuer enviá-la para o servidor? Assim ela fica disponível em qualquer dispositivo.")) return false;
  const r = await apiFetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(antigo) });
  if (!r.ok) throw new Error(await textoDoErro(r));
  return true;
}

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
