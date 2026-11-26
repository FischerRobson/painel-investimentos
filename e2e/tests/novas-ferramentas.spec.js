// Alugar × Financiar, Monte Carlo e o rebalanceamento com venda (dados fictícios do modo demonstração)
import { test, expect, ir } from "./base.js";

const semRolagemLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("Alugar × Financiar: o resultado muda com o aluguel", async ({ page }) => {
  await ir(page, "/ferramentas#moradia");
  await expect(page.getByText("CET do financiamento")).toBeVisible();
  await expect(page.getByText("em reais de hoje")).toBeVisible();
  const aluguel = page.getByLabel("Aluguel de um imóvel igual (R$/mês)");
  await aluguel.fill("500");
  await aluguel.press("Tab");
  await expect(page.getByText("alugar e investir deixa você com")).toBeVisible();
  await expect(page.getByText("o aluguel está barato")).toBeVisible();
  await aluguel.fill("15000");
  await aluguel.press("Tab");
  await expect(page.getByText(/comprar deixa você com/)).toBeVisible();
  await page.getByLabel("Tabela").selectOption("price");
  expect(await semRolagemLateral(page)).toBe(true);
});

test("Monte Carlo: três investimentos, premissas e gráfico", async ({ page }) => {
  await ir(page, "/ferramentas#monte-carlo");
  const tabela = page.getByRole("table");
  for (const nome of ["Pós-fixado (CDI)", "IPCA+", "Prefixado"]) await expect(tabela.getByRole("cell", { name: nome, exact: true })).toBeVisible();
  const antes = await tabela.innerText();
  const taxa = page.getByLabel("Prefixado (% a.a.)");
  await taxa.fill("18");
  await taxa.press("Tab");
  await expect.poll(() => tabela.innerText()).not.toBe(antes);
  await page.getByText("Premissas de inflação e juros").click();
  await expect(page.getByLabel("Variação do juro real (p.p.)")).toBeVisible();
  await page.getByRole("group", { name: "Investimento no gráfico" }).getByRole("button", { name: "IPCA+" }).click();
  await expect(page.getByLabel("Faixa de resultados ao longo dos anos")).toBeVisible();
  expect(await semRolagemLateral(page)).toBe(true);
});

test("Saúde: o rebalanceamento propõe vendas conforme a tolerância", async ({ page }) => {
  await ir(page, "/saude");
  const painel = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Rebalancear vendendo" }) });
  const tolerancia = painel.getByLabel(/Tolerância/);
  await tolerancia.fill("0");
  await expect(painel.getByRole("heading", { name: "1. Vender" })).toBeVisible();
  await expect(painel.getByText("IR a pagar (DARF ou declaração)")).toBeVisible();
  await tolerancia.fill("50");
  await expect(painel.getByText(/Nada a vender/)).toBeVisible();
  expect(await semRolagemLateral(page)).toBe(true);
});
