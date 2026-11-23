// Base dos testes: modo demonstração ligado, Termômetro com dados fixos e falha em qualquer erro de JavaScript.
// Os seletores usam papel e texto (não ids), como uma pessoa acharia na tela.
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const TERMOMETRO = readFileSync(new URL("../fixtures/termometro.json", import.meta.url), "utf8");

export const test = base.extend({
  page: async ({ page }, use) => {
    const erros = [];
    page.on("pageerror", e => erros.push(e.message));
    // Liga o modo demonstração só na primeira carga da aba (sair da demonstração recarrega a página e precisa valer)
    await page.addInitScript(() => {
      if (sessionStorage.getItem("e2e-demo")) return;
      sessionStorage.setItem("e2e-demo", "1");
      localStorage.setItem("demo", "1");
    });
    // O Termômetro fica fora do modo demonstração (dados públicos do BCB); aqui vem de um retrato fixo.
    await page.route("**/api/termometro", r => r.fulfill({ contentType: "application/json", body: TERMOMETRO }));
    await use(page);
    expect(erros, "erros de JavaScript na página").toEqual([]);
  },
});

export const ir = (page, caminho) => page.goto(caminho);

export { expect };
