// Glossário, Moedas, Bens e Custos. Valores esperados vêm dos dados fixos do modo demonstração (DemoDataService).
import { test, expect, ir } from "./base.js";

// O <label> "Modelo" envolve o filtro e o select; o rótulo só vale para o primeiro controle, então o select é achado pelo label
const selectModelo = page => page.locator("label").filter({ hasText: /^Modelo/ }).locator("select");

test.describe("app", () => {
  test("Glossário: busca, categoria, link para o termo e Veja também", async ({ page }) => {
    await ir(page, "/glossario");
    await expect(page.getByText(/^\d+ termos para consultar/)).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar termo" }).fill("selic");
    await expect(page.getByText(/^\d+ termos? encontrados?$/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Selic", exact: true })).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar termo" }).fill("zzzz");
    await expect(page.getByText("Nenhum termo encontrado para “zzzz”.")).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar termo" }).fill("");
    await page.getByRole("group", { name: "Categorias" }).getByRole("button", { name: "Impostos" }).click();
    await expect(page.getByRole("heading", { name: "Impostos", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Juros e inflação", exact: true })).toBeHidden();
    // termo fora da categoria escolhida: o link limpa o filtro e rola até ele
    await ir(page, "/glossario#selic");
    const selic = page.locator("#g-selic");
    await expect(selic).toBeVisible();
    await selic.getByRole("link", { name: "Copom" }).click();
    await expect(page).toHaveURL(/#copom$/);
    await expect(page.locator("#g-copom")).toHaveClass(/g-alvo/);
    await page.goBack();
    await expect(page).toHaveURL(/#selic$/);
  });

  for (const pagina of ["/moedas", "/bens", "/custos"]) {
    test(`cabeçalho mostra a hora da atualização em ${pagina}`, async ({ page }) => {
      await ir(page, pagina);
      await expect(page.locator("header").getByText(/^Atualizado às \d\d:\d\d$/)).toBeVisible();
    });
  }

  test("Glossário: a categoria escolhida fica guardada", async ({ page }) => {
    await ir(page, "/glossario");
    await page.getByRole("group", { name: "Categorias" }).getByRole("button", { name: "Renda fixa" }).click();
    await page.reload();
    await expect(page.getByRole("group", { name: "Categorias" }).getByRole("button", { name: "Renda fixa" })).toHaveClass(/\bon\b/);
  });

  test("Moedas: total, cartões, período e compra lançada como operação", async ({ page }) => {
    await ir(page, "/moedas");
    // demonstração: US$ 500 a 5,42 + € 200 a 5,95
    const tile = page.locator(".tile").filter({ hasText: "Você tem em moedas estrangeiras" });
    await expect(tile).toContainText("R$ 3.900,00");
    await expect(tile).toContainText("US$ 500,00 · € 200,00");
    await expect(page.locator(".card")).toHaveCount(5);
    await expect(page.locator(".card canvas")).toHaveCount(5);
    await page.getByRole("button", { name: "6 meses" }).click();
    await expect(page.getByRole("button", { name: "6 meses" })).toHaveClass(/\bon\b/);
    const gbp = page.getByRole("form", { name: "Operação em GBP" });
    await gbp.getByLabel("Quantidade de GBP").fill("10");
    await gbp.getByRole("button", { name: "Lançar" }).click();
    await expect(page.getByText("Salvo ✓")).toBeVisible();
    await expect(tile).toContainText("R$ 3.971,00");
    await expect(page.locator(".card").filter({ hasText: "GBP" })).toContainText("vale R$ 71,00");
  });

  test("Bens: consulta FIPE, salva e remove um veículo", async ({ page }) => {
    await ir(page, "/bens");
    const meus = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Meus bens" }) });
    await expect(page.locator(".card")).toHaveCount(1);
    await expect(page.locator(".card")).toContainText("Carro de exemplo");
    await expect(meus).toContainText("1 veículo");

    await page.getByRole("combobox", { name: /^Marca/ }).selectOption({ label: "Montadora Demo" });
    await selectModelo(page).selectOption({ label: "Hatch Demo 1.0" });
    await page.getByRole("combobox", { name: /^Ano/ }).selectOption({ label: "2024 Gasolina" });
    await expect(page.locator(".fipe-result .price")).toHaveText(/^R\$ [\d.]+,\d\d$/);
    await page.getByPlaceholder("Apelido (opcional, ex.: Meu carro)").fill("Carro novo");
    await page.getByRole("button", { name: "Salvar nos meus bens" }).click();
    await expect(page.getByText("Já está nos seus bens.")).toBeVisible();
    await expect(page.locator(".card")).toHaveCount(2);
    await expect(meus).toContainText("2 veículos");
    await expect(page.getByText("Salvo ✓")).toBeVisible();

    page.once("dialog", d => d.accept());
    await page.locator(".card").filter({ hasText: "Carro novo" }).getByTitle("Remover").click();
    await expect(page.locator(".card")).toHaveCount(1);
  });

  test("Bens: filtro de modelos", async ({ page }) => {
    await ir(page, "/bens");
    await page.getByRole("combobox", { name: /^Marca/ }).selectOption({ label: "Montadora Demo" });
    const modelo = selectModelo(page);
    await expect(modelo.locator("option").first()).toHaveText("Escolha o modelo (3)");
    await page.getByPlaceholder("filtrar (ex.: onix 1.0)").fill("suv");
    await expect(modelo.locator("option").first()).toHaveText("Escolha o modelo (1)");
  });

  test("Custos: AWS por mês e por serviço, e consumo da brapi", async ({ page }) => {
    await ir(page, "/custos");
    await expect(page.locator(".tile").filter({ hasText: "Este mês (até agora)" })).toContainText("US$ 0,37");
    await expect(page.getByRole("cell", { name: "AWS Lambda" })).toBeVisible();
    await expect(page.locator(".proj-box canvas")).toHaveCount(2);
    const brapi = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Consultas da brapi.dev" }) });
    await expect(brapi.locator(".tile").filter({ hasText: "Usadas" })).toContainText("3.120");
    await expect(brapi).toContainText("O plano gratuito permite 15.000 consultas");
    await expect(page.getByRole("meter", { name: "Consultas usadas" })).toHaveAttribute("aria-valuenow", "3120");
  });
});
