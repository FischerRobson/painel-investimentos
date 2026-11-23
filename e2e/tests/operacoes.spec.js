// Operações: preço médio, lançamentos, imposto de renda, proventos e declaração. Dados fixos do modo demonstração
// (DemoDataService: compras de 2025, day trade de PETR4 em março/2026, venda de ITSA4 e de HGLG11 em 2026).
import { test, expect, ir } from "./base.js";

const painel = (page, titulo) => page.locator(".panel").filter({ has: page.getByRole("heading", { name: titulo, exact: true }) });
const linha = (loc, texto) => loc.getByRole("row").filter({ hasText: texto });

test("posições com preço médio, custo e lucro realizado", async ({ page }) => {
  await ir(page, "/operacoes");
  await expect(page).toHaveTitle("Operações · Meus Investimentos");
  const pos = painel(page, "Posições e preço médio");
  // ITSA4: 300 a 9,20 (+1,50) e 200 a 10,10 (+1,00) → preço médio 9,565; vendeu 100 a 11,40 (−1,00)
  await expect(linha(pos, "ITSA4")).toContainText("400");
  await expect(linha(pos, "ITSA4")).toContainText("R$ 9,57");
  await expect(linha(pos, "ITSA4")).toContainText("R$ 182,50"); // 1139 − 956,50
  await expect(linha(pos, "AAPL")).toContainText("Exterior");
  await expect(painel(page, "Histórico de operações").getByRole("row")).toHaveCount(15); // cabeçalho + 14
});

test("imposto: day trade gera DARF e venda pequena de FII acumula", async ({ page }) => {
  await ir(page, "/operacoes");
  const ir_ = painel(page, "Imposto de renda");
  await ir_.getByLabel("Ano do imposto").selectOption("2026");
  // PETR4 em 04/03: lucro 98 → 20% = 19,60 − IRRF de 0,98
  await expect(linha(ir_, "Março")).toContainText("R$ 18,62");
  await expect(linha(ir_, "Março")).toContainText("30/04/2026");
  await expect(linha(ir_, "Junho")).toContainText("isento");
  await expect(linha(ir_, "Agosto")).toContainText("acumula");
});

test("lançar compra e venda; vender mais do que tem avisa", async ({ page }) => {
  await ir(page, "/operacoes");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Lançar" }) }).first();
  await form.getByLabel("Ativo").fill("BBAS3");
  await form.getByLabel("Quantidade").fill("10");
  await form.getByLabel(/^Preço/).fill("25");
  await form.getByLabel("Taxas (R$)").fill("1");
  await form.getByRole("button", { name: "Lançar" }).click();
  await expect(linha(painel(page, "Posições e preço médio"), "BBAS3")).toContainText("R$ 25,10"); // (250 + 1) ÷ 10

  await form.getByLabel("Tipo").selectOption("venda");
  await form.getByLabel("Ativo").fill("BBAS3");
  await form.getByLabel("Quantidade").fill("15");
  await form.getByLabel(/^Preço/).fill("26");
  await form.getByRole("button", { name: "Lançar" }).click();
  // mesmo dia: 10 viram day trade e sobra uma venda de 5 sem posição
  await expect(page.getByText(/BBAS3 em \d\d\/\d\d\/\d{4}: venda de 5 com só 0 em carteira/)).toBeVisible();
});

test("proventos: totais do ano e lançamento", async ({ page }) => {
  await ir(page, "/operacoes");
  const p = painel(page, "Proventos recebidos");
  await p.getByLabel("Ano dos proventos").selectOption("2026");
  await expect(p.locator(".tile").first()).toContainText("R$ 276,90"); // 48 + 96 + 44 + 30,40 + 25,50 + 33
  const form = p.locator("form");
  await form.getByLabel("Ativo").fill("WEGE3");
  await form.getByLabel("Valor recebido (R$)").fill("12.5");
  await form.getByRole("button", { name: "Lançar" }).click();
  await expect(p.locator(".tile").first()).toContainText("R$ 289,40");
});

test("declaração: bens e direitos pelo custo e rendimentos", async ({ page }) => {
  await ir(page, "/operacoes");
  const d = painel(page, "Declaração do imposto de renda");
  await d.getByLabel("Ano-calendário").selectOption("2025");
  await expect(linha(d, "ITSA4")).toContainText("R$ 4.782,50"); // custo em 31/12/2025
  await expect(linha(d, "HGLG11").first()).toContainText("07 – Fundos");
  await expect(linha(d, "BTC")).toContainText("01 – Bitcoin");
  await expect(d).toContainText("Lucros e dividendos recebidos");
});

test("Carteira mostra a rentabilidade sem aportes", async ({ page }) => {
  await ir(page, "/carteira");
  const evo = painel(page, "Evolução do patrimônio");
  await expect(evo.locator(".tile").filter({ hasText: "Rentabilidade sem aportes" })).toContainText(/[+−-]?[\d,]+%/);
});
