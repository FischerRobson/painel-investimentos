// localStorage com as MESMAS chaves do app atual (demo, auth_refresh, auth_email, range, comparador...), para que as
// preferências e o login continuem valendo nos dois apps durante a migração. Leitura e escrita nunca lançam erro
// (aba anônima, armazenamento bloqueado).
export const store = {
  get(k: string, padrao: string): string {
    try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; }
  },
  set(k: string, v: string): void {
    try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue sem guardar */ }
  },
  json<T>(k: string, padrao: T): T {
    try { return JSON.parse(store.get(k, "")) ?? padrao; } catch { return padrao; }
  },
};

export const DEMO = store.get("demo", "0") === "1";

export function alternarDemo(): void {
  store.set("demo", DEMO ? "0" : "1");
  location.reload();
}
