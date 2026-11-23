// VR (aba do Orçamento): saldo acumulado, extrato com saldo por lançamento, lançar gasto, conferir com o app e histórico.
// Dados fixos do modo demonstração (DemoDataService.benefits: R$ 1.100 todo dia 1 há 6 meses).
import { test, expect, ir } from "./base.js";

const valor = async loc => Number((await loc.innerText()).replace(/[^\d,]/g, "").replace(",", "."));
const tile = (page, k) => page.locator(".tile").filter({ has: page.locator(".k", { hasText: k }) });

test("a aba VR mostra o saldo, o mês e o extrato", async ({ page }) => {
  await ir(page, "/orcamento");
  await page.getByRole("navigation", { name: "Orçamento ou VR" }).getByRole("link", { name: "VR" }).click();
  await expect(page).toHaveURL(/\/orcamento\/vr$/);
  await expect(page).toHaveTitle("VR · Meus Investimentos");
  await expect(page.getByRole("heading", { name: "VR", exact: true })).toBeVisible();
  await expect(tile(page, "Saldo atual").locator(".v")).toHaveText(/^R\$ [\d.]+,\d\d$/);
  await expect(tile(page, "Neste mês")).toContainText("entrou R$ 1.100,00");
  await expect(page.getByRole("row").filter({ hasText: "Crédito do benefício" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimos meses" })).toBeVisible();
  await expect(page.locator("header").getByText(/^Atualizado às \d\d:\d\d$/)).toBeVisible();
  await page.getByRole("navigation", { name: "Orçamento ou VR" }).getByRole("link", { name: "Orçamento" }).click();
  await expect(page.getByRole("heading", { name: "Meta × realizado" })).toBeVisible();
});

test("lançar um gasto tira do saldo e aparece no extrato com o saldo depois dele", async ({ page }) => {
  await ir(page, "/orcamento/vr");
  const saldo = tile(page, "Saldo atual").locator(".v");
  await expect(saldo).toHaveText(/R\$/);
  const antes = await valor(saldo);
  await page.getByLabel("Descrição").fill("Almoço de teste");
  await page.getByLabel("Categoria").fill("Restaurante");
  await page.getByLabel("Valor (R$)").fill("37.5");
  await page.getByRole("button", { name: "Lançar", exact: true }).click();
  await expect(page.getByText("Salvo ✓")).toBeVisible();
  await expect.poll(() => valor(saldo)).toBeCloseTo(antes - 37.5, 2);
  const linha = page.getByRole("row").filter({ hasText: "Almoço de teste" });
  await expect(linha).toContainText("−R$ 37,50");
  await expect(linha).toContainText(await saldo.innerText());
});

test("conferir com o app lança um ajuste para o saldo bater", async ({ page }) => {
  await ir(page, "/orcamento/vr");
  const saldo = tile(page, "Saldo atual").locator(".v");
  await expect(saldo).toHaveText(/R\$/);
  const alvo = Math.round(await valor(saldo)) - 10;
  await page.getByLabel("Saldo no app do cartão").fill(String(alvo));
  await expect(page.getByText(/vai lançar um ajuste de −R\$ [\d,]+/)).toBeVisible();
  await page.getByRole("button", { name: "Ajustar" }).click();
  await expect.poll(() => valor(saldo)).toBeCloseTo(alvo, 2);
  await expect(page.getByRole("row").filter({ hasText: "Ajuste para bater com o app" })).toBeVisible();
});

test("extrato de meses anteriores e estorno", async ({ page }) => {
  await ir(page, "/orcamento/vr");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Estorno iFood" })).toContainText("+R$ 42,90");
  await expect(page.getByText(/^Saldo no início do mês:/)).toBeVisible();
});
