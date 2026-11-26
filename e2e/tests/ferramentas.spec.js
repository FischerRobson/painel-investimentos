import { test, expect, ir } from "./base.js";

const FERRAMENTAS = [
  ["renda-fixa", "Projeção da renda fixa"],
  ["aportes", "Simulador de aportes"],
  ["ipca-pre", "IPCA+ × Prefixado"],
  ["termometro", "Termômetro econômico"],
  ["comparador", "Comparador de renda fixa"],
  ["marcacao", "Marcação a mercado"],
  ["analisador", "Analisador de ações e FIIs"],
  ["planejador", "Planejador de metas"],
  ["moradia", "Alugar × Financiar"],
  ["monte-carlo", "Monte Carlo"],
];

test.describe("app", () => {
  test("o hub lista as ferramentas e cada card abre a sua", async ({ page }) => {
    await ir(page, "/ferramentas");
    for (const [id, nome] of FERRAMENTAS) {
      await page.getByRole("link").filter({ has: page.getByRole("heading", { name: nome, exact: true }) }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page).toHaveTitle(`${nome} · Meus Investimentos`);
      await expect(page.getByRole("heading", { name: nome, exact: true })).toBeVisible();
      await page.getByRole("link", { name: "← Ferramentas" }).click();
      await expect(page).toHaveTitle("Ferramentas · Meus Investimentos");
    }
  });

  test("IPCA+ × Prefixado: inflação de equilíbrio e empate", async ({ page }) => {
    await ir(page, "/ferramentas#ipca-pre");
    await page.getByLabel("Valor investido (R$)").fill("10000");
    await page.getByLabel("Prazo até o vencimento (anos)").fill("5");
    await page.getByLabel("Prefixado (% a.a.)").fill("12");
    await page.getByLabel("IPCA+: juro real (% a.a.)").fill("6");
    // (1,12 / 1,06) − 1 = 5,66%
    await expect(page.getByText("5,66% a.a.")).toBeVisible();
    await page.getByRole("button", { name: "Inflação de equilíbrio" }).click();
    await expect(page.getByText("os dois rendem o mesmo")).toBeVisible();
  });

  // Os formulários recalculam no "change" (ao sair do campo), por isso o Tab depois de cada fill.
  const preencher = async (page, rotulo, valor) => {
    await page.getByLabel(rotulo).fill(valor);
    await page.getByLabel(rotulo).press("Tab");
  };

  test("Simulador de aportes recalcula ao mudar o aporte", async ({ page }) => {
    await ir(page, "/ferramentas#aportes");
    await preencher(page, "Valor inicial (R$)", "0");
    await preencher(page, "Aporte mensal (R$)", "1000");
    await expect(page.getByText("aportado R$ 120.000,00", { exact: false }).first()).toBeVisible();
    await preencher(page, "Aporte mensal (R$)", "2000");
    await expect(page.getByText("aportado R$ 240.000,00", { exact: false }).first()).toBeVisible();
  });

  test("Termômetro mostra os números do Banco Central", async ({ page }) => {
    await ir(page, "/ferramentas#termometro");
    await expect(page.getByText("IPCA em 12 meses").first()).toBeVisible();
    await expect(page.getByText("4,63%").first()).toBeVisible();
    await expect(page.getByText("13,75% a.a.").first()).toBeVisible();
  });

  test("Comparador lista os produtos com o cenário do Focus", async ({ page }) => {
    await ir(page, "/ferramentas#comparador");
    await expect(page.getByLabel("Cenário de juros e inflação")).toBeVisible();
    await expect(page.getByRole("table").first()).toBeVisible();
  });

  test("Marcação a mercado usa um título da carteira", async ({ page }) => {
    await ir(page, "/ferramentas#marcacao");
    await page.getByRole("button", { name: "Usar este título" }).click();
    await expect(page.getByLabel("Quantidade de títulos")).not.toHaveValue("");
    await expect(page.getByText(/Vender hoje/i).first()).toBeVisible();
  });

  test("Analisador dá nota aos tickers", async ({ page }) => {
    await ir(page, "/ferramentas#analisador");
    await page.getByLabel(/^Tickers/).fill("BBDC4, KNRI11");
    await page.getByRole("button", { name: "Analisar" }).click();
    const tabela = page.getByRole("table").first();
    await expect(tabela.getByRole("cell", { name: "BBDC4" })).toBeVisible();
    await expect(tabela.getByRole("cell", { name: "KNRI11" })).toBeVisible();
  });

  test("Planejador compara com o orçamento", async ({ page }) => {
    await ir(page, "/ferramentas#planejador");
    await preencher(page, "Valor da meta (R$)", "30000");
    await preencher(page, "Prazo (meses)", "24");
    const aporte = page.getByText("Aporte mensal necessário").locator("xpath=following-sibling::*[1]");
    await expect(aporte).toHaveText(/^R\$ [\d.]+,\d\d$/);
    const antes = await aporte.innerText();
    await preencher(page, "Prazo (meses)", "12");
    await expect(aporte).not.toHaveText(antes);
    await expect(page.getByText("Sobra do orçamento", { exact: true })).toBeVisible();
  });
});
