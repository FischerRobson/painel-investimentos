// Ativos e Orçamento. Valores vêm dos dados fixos do modo demonstração (DemoDataService).
import { test, expect, ir } from "./base.js";

const linha = (page, texto) => page.getByRole("row").filter({ hasText: texto });


test.describe("app", () => {
  test("Ativos: lista da carteira, comparativo, resumo e cartões", async ({ page }) => {
    await ir(page, "/ativos");
    await expect(page).toHaveTitle("Ativos · Meus Investimentos");
    await expect(page.getByRole("heading", { name: "Comparativo de desempenho" })).toBeVisible();
    await expect(page.locator(".card")).toHaveCount(6); // ITSA4, WEGE3, TAEE11, HGLG11, XPLG11, AAPL
    await expect(page.getByText("Variação do preço em 1 ano")).toBeVisible();
    await expect(page).toHaveURL(/#ITSA4%2CWEGE3/);
    await expect(page.locator("header").getByText(/^Atualizado às \d\d:\d\d$/)).toBeVisible();
  });

  test("Ativos: período, nova lista, ordenar e remover", async ({ page }) => {
    await ir(page, "/ativos");
    await expect(page.locator(".card")).toHaveCount(6);
    await page.getByRole("button", { name: "3M", exact: true }).click();
    await expect(page.getByText("Variação do preço em 3 meses")).toBeVisible();
    await expect(page.getByRole("button", { name: "3M", exact: true })).toHaveClass(/\bon\b/);

    await page.getByPlaceholder("Ex.: BBDC4, EGIE3, KNRI11").fill("ITSA4, KNRI11");
    await page.getByRole("button", { name: "Carregar" }).click();
    await expect(page.locator(".card")).toHaveCount(2);
    await page.getByRole("columnheader", { name: "Ticker" }).click();
    await expect(page.locator("table tbody tr").first()).toContainText("ITSA4");
    await page.getByRole("columnheader", { name: "Ticker" }).click();
    await expect(page.locator("table tbody tr").first()).toContainText("KNRI11");

    await page.locator(".card").filter({ hasText: "KNRI11" }).getByRole("button", { name: /Remover|×/ }).click();
    await expect(page.locator(".card")).toHaveCount(1);
    await expect(page.getByPlaceholder("Ex.: BBDC4, EGIE3, KNRI11")).toHaveValue("ITSA4");
  });

  test("Orçamento: mês, meta × realizado, lançamentos e histórico", async ({ page }) => {
    await ir(page, "/orcamento#2026-03");
    await expect(page).toHaveTitle("Orçamento · Meus Investimentos");
    await expect(page.locator(".b-month strong")).toHaveText("Março de 2026");
    await expect(page.locator(".tile").filter({ hasText: "Entradas" })).toContainText("2 lançamentos"); // março: salário + freelance
    await expect(page.getByRole("heading", { name: "Meta × realizado" })).toBeVisible();
    await expect(page.locator(".b-area")).toHaveCount(5);
    await expect(page.getByText("14 lançamentos", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Últimos 12 meses" })).toBeVisible();
    await page.getByRole("button", { name: "Mês anterior" }).click();
    await expect(page.locator(".b-month strong")).toHaveText("Fevereiro de 2026");
    await expect(page).toHaveURL(/#2026-02$/);
    await expect(page.getByText("13 lançamentos", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mês atual" }).click();
    await expect(page.getByRole("button", { name: "Mês atual" })).toBeHidden();
  });

  test("Orçamento: novo lançamento, troca de área, edição e remoção", async ({ page }) => {
    await ir(page, "/orcamento#2026-03");
    await expect(page.getByText("14 lançamentos", { exact: true })).toBeVisible();
    await page.getByLabel("Descrição", { exact: true }).fill("Padaria");
    await page.getByLabel("Valor (R$)").fill("35.5");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByText("15 lançamentos", { exact: true })).toBeVisible();
    await expect(page.getByText("Salvo ✓")).toBeVisible();
    await expect(linha(page, "Padaria")).toContainText("R$ 35,50");

    await linha(page, "Padaria").getByRole("combobox", { name: "Área" }).selectOption({ label: "Prazeres" });
    await expect(linha(page, "Padaria").getByRole("combobox", { name: "Área" })).toHaveValue("pleasures");

    await linha(page, "Padaria").getByRole("button", { name: /Editar|✎/ }).click();
    await expect(page.getByRole("heading", { name: "Editar lançamento" })).toBeVisible();
    await page.getByLabel("Valor (R$)").fill("40");
    await page.getByRole("button", { name: "Salvar alteração" }).click();
    await expect(linha(page, "Padaria")).toContainText("R$ 40,00");

    page.once("dialog", d => d.accept());
    await linha(page, "Padaria").getByRole("button", { name: /Remover|×/ }).click();
    await expect(page.getByText("14 lançamentos", { exact: true })).toBeVisible();
  });

  test("Orçamento: filtros da lista", async ({ page }) => {
    await ir(page, "/orcamento#2026-03");
    await page.getByRole("group", { name: "Tipo de lançamento" }).getByRole("button", { name: "Entradas" }).click();
    await expect(page.getByText("2 de 14 lançamentos")).toBeVisible();
    await page.getByRole("group", { name: "Tipo de lançamento" }).getByRole("button", { name: "Todos" }).click();
    await page.getByRole("searchbox", { name: "Buscar" }).fill("ingles");
    await expect(page.getByText("1 de 14 lançamentos")).toBeVisible();
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(page.getByText("14 lançamentos", { exact: true })).toBeVisible();
  });

  test("Orçamento: metas precisam somar 100% e regra criada pelo ⇄", async ({ page }) => {
    await ir(page, "/orcamento#2026-03");
    await page.locator("summary").filter({ hasText: "Metas por área" }).click();
    await page.getByLabel("Conforto (%)").fill("20");
    await expect(page.getByText("Soma: 110,0% (precisa dar 100%)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar metas" })).toBeDisabled();
    await page.getByLabel("Custos fixos (%)").fill("40");
    await expect(page.getByText("Soma: 100%", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Salvar metas" }).click();
    await expect(page.locator("summary").filter({ hasText: "Metas por área" })).toContainText("40% · 20% · 10% · 5% · 25%");

    await linha(page, "Restaurante").getByRole("button", { name: "⇄" }).click();
    await expect(page.getByLabel("Quando a descrição contém")).toHaveValue("Restaurante");
    await page.getByLabel("Trocar por").fill("Comer fora");
    await page.getByRole("button", { name: "Criar regra" }).click();
    await expect(linha(page, "Comer fora").first()).toBeVisible();
    await expect(page.locator("summary").filter({ hasText: "Regras de descrição" })).toContainText("3 regras");
  });

  test("Orçamento: mostra quando foi a última importação", async ({ page }) => {
  await ir(page, "/orcamento#2026-03");
  await expect(page.getByText(/^Última importação: \d\d\/\d\d\/\d{4} às 10:15 · Fatura do cartão Nubank \(fatura-nubank\.pdf\) · 18 lançamentos$/)).toBeVisible();
});

test("Orçamento: importar extrato não existe no modo demonstração", async ({ page }) => {
    await ir(page, "/orcamento#2026-03");
    await page.locator('input[type="file"]').setInputFiles({ name: "extrato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await expect(page.getByText("Não deu para ler extrato.pdf: Indisponível no modo demonstração")).toBeVisible();
  });
});
