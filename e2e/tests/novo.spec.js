// App React em /novo, enquanto convive com o app atual. As páginas ainda não migradas apontam para a versão atual.
// Quando uma página for migrada, ela passa a rodar também com E2E_BASE=/novo nos testes de paginas.spec.js e ferramentas.spec.js.
import { test, expect } from "./base.js";

test("/novo abre a carteira com o menu, a versão e o aviso de demonstração", async ({ page }) => {
  await page.goto("/novo/");
  await expect(page).toHaveURL(/\/novo\/carteira$/);
  await expect(page).toHaveTitle("Carteira · Meus Investimentos");
  await expect(page.getByRole("heading", { name: "Meus Investimentos" })).toBeVisible();
  await expect(page.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  await expect(page.getByText("Modo demonstração: todos os dados são fictícios")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Páginas" }).getByRole("link", { name: "Carteira", exact: true })).toHaveClass(/\bon\b/);
});

test("/novo: o menu troca de página sem recarregar", async ({ page }) => {
  await page.goto("/novo/carteira");
  await page.evaluate(() => { window.__semRecarregar = true; });
  const menu = page.getByRole("navigation", { name: "Páginas" });
  for (const titulo of ["Orçamento", "Ferramentas", "Ativos", "Moedas", "Bens", "Custos", "Glossário"]) {
    await menu.getByRole("link", { name: titulo }).click();
    await expect(page).toHaveTitle(`${titulo} · Meus Investimentos`);
  }
  expect(await page.evaluate(() => window.__semRecarregar)).toBe(true);
});

test("/novo: página não migrada leva à versão atual", async ({ page }) => {
  await page.goto("/novo/ferramentas#comparador");
  await page.getByRole("link", { name: "Abrir Ferramentas na versão atual" }).click();
  await expect(page).toHaveURL(/\/ferramentas#comparador$/);
  await expect(page.getByRole("heading", { name: "Comparador de renda fixa" })).toBeVisible();
});

test("/novo: rota direta e /projecao funcionam ao recarregar", async ({ page }) => {
  await page.goto("/novo/glossario");
  await expect(page).toHaveTitle("Glossário · Meus Investimentos");
  await page.goto("/novo/projecao");
  await expect(page).toHaveURL(/\/novo\/ferramentas#renda-fixa$/);
});

test("/novo: sair da demonstração volta aos dados reais", async ({ page }) => {
  await page.goto("/novo/carteira");
  await page.getByRole("button", { name: "Sair da demonstração" }).first().click();
  await expect(page.getByRole("button", { name: "Modo demonstração" })).toBeVisible();
  await expect(page.getByText("Modo demonstração: todos os dados são fictícios")).toBeHidden();
});
