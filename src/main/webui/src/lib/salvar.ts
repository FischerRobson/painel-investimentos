// "Salvando…", "Salvo ✓" ou o erro da última gravação, no cabeçalho. Vale para tudo que grava no servidor (carteira, orçamento,
// metas e regras), como o setSaveState do app atual. "Salvo ✓" some depois de 2,5 s.
import { useSyncExternalStore } from "react";

export type EstadoSalvar = { estado: "" | "pendente" | "ok" | "erro"; msg?: string };

let atual: EstadoSalvar = { estado: "" };
let okTimer: ReturnType<typeof setTimeout> | undefined;
const ouvintes = new Set<() => void>();

export const salvarStore = {
  get: (): EstadoSalvar => atual,
  subscribe(fn: () => void) { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
  definir(s: EstadoSalvar): void {
    clearTimeout(okTimer);
    atual = s;
    ouvintes.forEach(fn => fn());
    if (s.estado === "ok") okTimer = setTimeout(() => { if (atual === s) salvarStore.definir({ estado: "" }); }, 2500);
  },
};

export const useEstadoSalvar = (): EstadoSalvar => useSyncExternalStore(salvarStore.subscribe, salvarStore.get);

export const textoSalvar = (s: EstadoSalvar): string =>
  ({ pendente: "Salvando…", ok: "Salvo ✓", erro: "Erro ao salvar: " + (s.msg ?? ""), "": "" })[s.estado];
