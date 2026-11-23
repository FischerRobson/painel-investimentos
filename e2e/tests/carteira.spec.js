// Carteira: os mesmos testes no app atual ("") e no React ("/novo"), mais a paridade do texto inteiro da página
// (ao abrir e depois de mexer). Valores vêm dos dados fixos do modo demonstração (DemoDataService).
import { test, expect } from "./base.js";

const tabela = (page, titulo) => page.locator("details.acc").filter({ has: page.locator("summary", { hasText: titulo }) });
const linha = (page, texto) => page.getByRole("row").filter({ hasText: texto });

for (const base of ["", "/novo"]) {
  const app = base ? "React" : "atual";
  const ir = (page, caminho) => page.goto(base + caminho);

  test.describe(`app ${app}`, () => {
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

    test("Carteira: adicionar, mudar quantidade e remover ação", async ({ page }) => {
      await ir(page, "/carteira");
      await expect(linha(page, "ITSA4")).toBeVisible();
      await page.getByPlaceholder("Ticker (ex.: BBDC4, AAPL)").fill("bbas3");
      await page.getByPlaceholder("Quantidade", { exact: true }).fill("10");
      await page.getByRole("button", { name: "Adicionar", exact: true }).click();
      await expect(page.getByText("Salvo ✓")).toBeVisible();
      await expect(linha(page, "BBAS3")).toContainText(/R\$ [\d.]+,\d\d/);
      await expect(tabela(page, "Ações, FIIs e cripto")).toContainText("9 ativos");

      const qtd = linha(page, "ITSA4").getByRole("spinbutton");
      await qtd.fill("1");
      await qtd.press("Tab");
      await expect(linha(page, "ITSA4").getByRole("spinbutton")).toHaveValue("1");

      await linha(page, "BBAS3").getByRole("button", { name: /Remover|×/ }).click();
      await expect(linha(page, "BBAS3")).toHaveCount(0);
      await expect(tabela(page, "Ações, FIIs e cripto")).toContainText("8 ativos");
    });

    test("Carteira: título de renda fixa novo e edição", async ({ page }) => {
      await ir(page, "/carteira");
      await page.getByRole("button", { name: "Renda fixa", exact: true }).click();
      await page.getByPlaceholder("Ex.: CDB Banco Inter").fill("CDB Teste");
      await page.getByLabel("Tipo").selectOption("LCA");
      await expect(page.getByLabel("Isento de IR")).toBeChecked();
      await page.getByPlaceholder("Ex.: 110").fill("95");
      await page.getByLabel(/^Valor aplicado/).fill("1000");
      await page.getByLabel("Data da aplicação").fill("2026-01-02");
      await page.getByRole("button", { name: "Adicionar", exact: true }).click();
      await expect(tabela(page, "Renda fixa")).toContainText("5 títulos");
      await expect(linha(page, "CDB Teste")).toContainText("95% do CDI");

      await linha(page, "CDB Banco Exemplo").getByRole("button", { name: /Editar|✎/ }).click();
      await expect(page.getByText("Editando um título.")).toBeVisible();
      await expect(page.getByPlaceholder("Ex.: CDB Banco Inter")).toHaveValue("CDB Banco Exemplo");
      await page.getByPlaceholder("Ex.: 110").fill("120");
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await expect(linha(page, "CDB Banco Exemplo")).toContainText("120% do CDI");
      await expect(page.getByText("Editando um título.")).toBeHidden();
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
}

// Paridade: o texto inteiro da Carteira (números, tabelas e avisos) é igual nos dois apps
const area = (page, base) => page.locator(base ? "main" : "#wallet");
async function textoCarteira(page, base, acoes = async () => {}) {
  await page.goto(base + "/carteira");
  await expect(area(page, base).getByRole("heading", { name: "Evolução do patrimônio" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await acoes(page);
  await page.waitForLoadState("networkidle");
  return (await area(page, base).innerText()).replace(/\s+/g, " ").trim();
}
const limpar = page => page.evaluate(() => { for (const k of ["addTab", "acc_cmp", "cmpRange", "acc_rv", "acc_rf", "acc_fx", "acc_bens"]) localStorage.removeItem(k); });

test("paridade de texto: Carteira", async ({ page }) => {
  const atual = await textoCarteira(page, "");
  const novo = await textoCarteira(page, "/novo");
  expect(atual).toContain("Proventos 12 meses");
  expect(atual).toContain("Tesouro Prefixado 2029");
  expect(novo).toBe(atual);
});

const ACOES = [
  ["ação nova, quantidade e cripto removida", async page => {
    await page.getByPlaceholder("Ticker (ex.: BBDC4, AAPL)").fill("BBAS3");
    await page.getByPlaceholder("Quantidade", { exact: true }).fill("10");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(linha(page, "BBAS3")).toContainText(/R\$ [\d.]+,\d\d/);
    await linha(page, "WEGE3").getByRole("spinbutton").fill("75");
    await linha(page, "WEGE3").getByRole("spinbutton").press("Tab");
    await linha(page, "ETH").getByRole("button", { name: /Remover|×/ }).click();
    await expect(linha(page, "ETH")).toHaveCount(0);
  }],
  ["renda fixa nova e editada", async page => {
    await page.getByRole("button", { name: "Renda fixa", exact: true }).click();
    await page.getByPlaceholder("Ex.: CDB Banco Inter").fill("Tesouro Selic 2031");
    await page.getByLabel("Tipo").selectOption("Tesouro Selic");
    await page.getByLabel(/^Valor aplicado/).fill("2500");
    await page.getByLabel("Data da aplicação").fill("2025-06-10");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(linha(page, "Tesouro Selic 2031")).toBeVisible();
    await linha(page, "LCI Banco Fictício").getByRole("button", { name: /Editar|✎/ }).click();
    await page.getByLabel(/^Valor aplicado/).fill("9000");
  }],
  ["comparativo aberto em 5 anos e seções fechadas", async page => {
    const cmp = page.locator("details.acc").filter({ hasText: "Carteira × CDI, Ibovespa e IFIX" });
    await cmp.locator("summary").click();
    await cmp.getByRole("button", { name: "5 anos" }).click();
    await expect(cmp.locator("summary")).toContainText(/5 anos: carteira/);
    await page.locator("summary").filter({ hasText: "Ações, FIIs e cripto" }).click();
    await page.locator("summary").filter({ hasText: "Moedas" }).click();
    await page.getByRole("button", { name: "Cripto", exact: true }).click();
  }],
];
for (const [desc, acoes] of ACOES) {
  test(`paridade depois de mexer: Carteira (${desc})`, async ({ page }) => {
    const atual = await textoCarteira(page, "", acoes);
    await limpar(page);
    const novo = await textoCarteira(page, "/novo", acoes);
    expect(novo).toBe(atual);
  });
}
