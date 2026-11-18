// Base dos testes: modo demonstração ligado, Termômetro com dados fixos e falha em qualquer erro de JavaScript.
// Os seletores usam papel e texto (não ids) para que os mesmos testes valham para o app atual e para o React.
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const TERMOMETRO = readFileSync(new URL("../fixtures/termometro.json", import.meta.url), "utf8");

// Prefixo das páginas: "" no app atual; "/novo" para testar o app React enquanto os dois convivem.
export const BASE = process.env.E2E_BASE ?? "";

export const test = base.extend({
  page: async ({ page }, use) => {
    const erros = [];
    page.on("pageerror", e => erros.push(e.message));
    await page.addInitScript(() => localStorage.setItem("demo", "1"));
    // O Termômetro fica fora do modo demonstração (dados públicos do BCB); aqui vem de um retrato fixo.
    await page.route("**/api/termometro", r => r.fulfill({ contentType: "application/json", body: TERMOMETRO }));
    await use(page);
    expect(erros, "erros de JavaScript na página").toEqual([]);
  },
});

export const ir = (page, caminho) => page.goto(BASE + caminho);

export { expect };
