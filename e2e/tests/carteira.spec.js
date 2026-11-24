// Carteira: totais, divisão, tabelas, formulários, comparativo e backup. Valores vêm dos dados fixos do modo demonstração
// (DemoDataService).
import { test, expect, ir } from "./base.js";

const tabela = (page, titulo) => page.locator("details.acc").filter({ has: page.locator("summary", { hasText: titulo }) });
const linha = (page, texto) => page.getByRole("row").filter({ hasText: texto });


test.describe("app", () => {
  test("Carteira: totais, divisão, tabelas e histórico", async ({ page }) => {
    await ir(page, "/carteira");
    await expect(page).toHaveTitle("Carteira · Meus Investimentos");
    await expect(page.getByRole("heading", { name: "Minha carteira" })).toBeVisible();
    await expect(page.locator(".tile").filter({ has: page.locator(".k", { hasText: /^Patrimônio total$/ }) })).toContainText(/R\$ [\d.]+,\d\d/);
    await expect(page.locator(".pl-row")).toHaveCount(4); // renda variável, renda fixa, cripto e moedas
    await expect(page.locator(".pie-box canvas")).toBeVisible();
    await expect(tabela(page, "Ações, FIIs e cripto")).toContainText("8 ativos");
    await expect(tabela(page, "Renda fixa")).toContainText("4 títulos");
    await expect(linha(page, "CDB Banco Exemplo")).toContainText("105% do CDI");
    await expect(linha(page, "LCI Banco Fictício")).toContainText("isento");
    await expect(tabela(page, "Bens")).toContainText("fora dos investimentos");
    await expect(page.getByRole("heading", { name: "Evolução do patrimônio" })).toBeVisible();
    await expect(page.locator("header").getByText(/^Atualizado às \d\d:\d\d$/)).toBeVisible();
  });

  test("Carteira: passar o mouse na categoria mostra os ativos", async ({ page, isMobile }) => {
    test.skip(isMobile, "sem mouse no celular");
    await ir(page, "/carteira");
    await page.locator(".pl-row").filter({ hasText: "Renda fixa" }).hover();
    const tip = page.locator("#bk-tip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText("valores líquidos de IR");
    await expect(tip).toContainText("Tesouro IPCA+ 2032");
    await page.getByRole("heading", { name: "Minha carteira" }).hover();
    await expect(tip).toBeHidden();
  });

  test("Carteira: adicionar ação vira uma compra em Operações", async ({ page }) => {
    await ir(page, "/carteira");
    await expect(linha(page, "ITSA4")).toBeVisible();
    // a quantidade de quem tem operações vem de lá: não é editável nem removível aqui
    await expect(linha(page, "ITSA4").getByRole("link", { name: "400" })).toHaveAttribute("href", "/operacoes");
    await expect(linha(page, "ITSA4").getByRole("button", { name: /Remover/ })).toHaveCount(0);

    await page.getByPlaceholder("Ticker (ex.: BBDC4, AAPL)").fill("bbas3");
    await page.getByPlaceholder("Quantidade", { exact: true }).fill("10");
    await page.getByLabel("Preço", { exact: true }).fill("25");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByText("Salvo ✓")).toBeVisible();
    await expect(linha(page, "BBAS3")).toContainText(/R\$ [\d.]+,\d\d/);
    await expect(tabela(page, "Ações, FIIs e cripto")).toContainText("9 ativos");

    await page.getByRole("navigation", { name: "Páginas" }).getByRole("link", { name: "Operações" }).click();
    await expect(page.getByRole("row").filter({ hasText: "BBAS3" }).first()).toContainText("R$ 25,00");
  });

  test("Carteira: aplicação em renda fixa e resgate total", async ({ page }) => {
    await ir(page, "/carteira");
    await page.getByRole("button", { name: "Renda fixa", exact: true }).click();
    await page.getByPlaceholder("Ex.: CDB Banco Inter").fill("CDB Teste");
    await page.getByLabel("Tipo").selectOption("LCA");
    await expect(page.getByLabel("Isento de IR")).toBeChecked();
    await page.getByPlaceholder("Ex.: 110").fill("95");
    await page.getByLabel(/^Valor aplicado/).fill("1000");
    await page.getByLabel("Data da aplicação").fill("2026-01-02");
    await page.getByRole("button", { name: "Aplicar", exact: true }).click();
    await expect(tabela(page, "Renda fixa")).toContainText("5 títulos");
    await expect(linha(page, "CDB Teste")).toContainText("95% do CDI");
    // sem editar nem remover direto na tabela: só resgate
    await expect(linha(page, "CDB Banco Exemplo").getByRole("button", { name: /Editar|Remover/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Resgatar CDB Banco Exemplo" }).click();
    const resgate = page.getByRole("form", { name: "Resgate de CDB Banco Exemplo" });
    await expect(resgate.getByLabel(/^Valor presente/)).not.toHaveValue(""); // vem da curva
    await resgate.getByLabel(/^Valor recebido/).fill("16000");
    await resgate.getByRole("button", { name: "Resgatar", exact: true }).click();
    await expect(tabela(page, "Renda fixa")).toContainText("4 títulos");
    await expect(linha(page, "CDB Banco Exemplo")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Páginas" }).getByRole("link", { name: "Operações" }).click();
    const resg = page.getByRole("row").filter({ hasText: /Resgate/ }).filter({ hasText: "CDB Banco Exemplo" });
    await expect(resg).toContainText("R$ 16.000,00");
    await expect(page.getByRole("row").filter({ hasText: /Aplicação/ }).filter({ hasText: "CDB Teste" })).toContainText("R$ 1.000,00");
  });

  test("Carteira: comparativo com o mercado abre e troca o período", async ({ page }) => {
    await ir(page, "/carteira");
    const cmp = page.locator("details.acc").filter({ hasText: "Carteira × CDI, Ibovespa e IFIX" });
    await expect(cmp).toContainText("toque para calcular");
    await cmp.locator("summary").click();
    await expect(cmp.locator(".tile").filter({ hasText: "Sua carteira" })).toContainText("%");
    await expect(cmp.locator("summary")).toContainText(/1 ano: carteira [+−-]?[\d,]+% · CDI/);
    await cmp.getByRole("button", { name: "6 meses" }).click();
    await expect(cmp.locator("summary")).toContainText(/6 meses: carteira/);
    await page.reload();
    await expect(page.locator("details.acc").filter({ hasText: "Carteira × CDI" })).toHaveAttribute("open", "");
  });

  test("Carteira: importar backup não existe no modo demonstração", async ({ page }) => {
    await ir(page, "/carteira");
    page.once("dialog", d => d.accept());
    const aviso = page.waitForEvent("dialog");
    await page.locator('input[type="file"]').setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from("{}") });
    expect((await aviso).message()).toBe("Importar backup não está disponível no modo demonstração.");
  });
});

test.describe("Evolução do patrimônio", () => {
  const painel = page => page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Evolução do patrimônio" }) });

  test("mostra só os investimentos (sem bens)", async ({ page }) => {
    await ir(page, "/carteira");
    const p = painel(page);
    await expect(p.locator(".legend")).toContainText("Investimentos");
    await expect(p.locator(".legend")).not.toContainText("Patrimônio total");
    await expect(p.locator(".tile").first()).toContainText("investimentos");
    await expect(p).toContainText("nos dias de pregão da B3");
  });

  test("escolher um dia mostra as posições, com PV, PPV e PnL", async ({ page }) => {
    await ir(page, "/carteira");
    const p = painel(page);
    const lista = p.getByRole("combobox", { name: "Posições do dia" });
    await expect(lista.locator("option").nth(1)).toBeAttached();
    const dia = await lista.locator("option").nth(1).getAttribute("value"); // o mais recente
    await lista.selectOption(dia);
    const [a, m, d] = dia.split("-");
    await expect(p.getByRole("heading", { name: new RegExp(`^Posições em ${d}/${m}/${a}`) })).toContainText("comparadas com");
    for (const col of ["Ativo", "Quantidade", "Preço", "PV", "PPV", "PnL do dia"]) await expect(p.getByRole("columnheader", { name: col, exact: true })).toBeVisible();
    await expect(p.getByRole("row").filter({ hasText: "ITSA4" })).toContainText(/R\$ [\d.]+,\d\d/);
    await expect(p.getByRole("row").filter({ hasText: "CDB Banco Exemplo" })).toContainText("Renda fixa");
    await expect(p.getByRole("row").filter({ hasText: "Carro de exemplo" })).toHaveCount(0); // bens não são posição
    await expect(p.getByRole("row").filter({ hasText: "Total" })).toContainText(/R\$ [\d.]+,\d\d/);
    await p.getByRole("button", { name: "Fechar" }).click();
    await expect(p.getByRole("heading", { name: /^Posições em/ })).toBeHidden();
  });

  test("clicar no gráfico abre as posições daquele dia", async ({ page }) => {
    await ir(page, "/carteira");
    const canvas = painel(page).locator(".proj-box canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box.width * 0.5, y: box.height / 2 } }); // meio da área do gráfico (o eixo fica à direita)
    await expect(painel(page).getByRole("heading", { name: /^Posições em \d\d\/\d\d\/\d{4}/ })).toBeVisible();
    await expect(painel(page).getByRole("row").filter({ hasText: "BTC" })).toBeVisible();
  });
});
