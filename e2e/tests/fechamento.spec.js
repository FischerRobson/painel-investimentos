// Fechamento do mês (dados fictícios do modo demonstração)
import { test, expect, ir } from "./base.js";

const painel = (page, titulo) => page.locator(".panel").filter({ has: page.getByRole("heading", { name: titulo, exact: true }) });

test("Fechamento: abre no último mês, separa aporte de rendimento e mostra orçamento", async ({ page }) => {
  await ir(page, "/fechamento");
  const patrimonio = painel(page, "Patrimônio investido");
  for (const t of ["Aportes líquidos", "Valorização", "Proventos"]) await expect(patrimonio.getByText(t, { exact: true })).toBeVisible();
  await expect(patrimonio.getByText("Rentabilidade sem aportes")).toBeVisible();
  await expect(painel(page, "Quem puxou o resultado").getByRole("heading", { name: "Maiores ganhos" })).toBeVisible();
  await expect(painel(page, "Renda e gastos").getByText("Gastos por área")).toBeVisible();
  await expect(painel(page, "Destaques")).toBeVisible();
  await expect(page.getByRole("button", { name: "Próximo mês" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Fechamento: troca de mês, avisa quando é parcial e quando não há fotos", async ({ page }) => {
  await ir(page, "/fechamento");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByText("os números são parciais")).toBeVisible();
  await expect(page.getByRole("button", { name: "Próximo mês" })).toBeDisabled();
  await ir(page, "/fechamento#2020-01");
  await expect(page.locator(".b-month strong")).toHaveText("Janeiro de 2020");
  await expect(page.getByText("Sem fotos suficientes para este mês")).toBeVisible();
});
