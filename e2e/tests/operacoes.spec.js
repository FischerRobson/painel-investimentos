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
  // cabeçalho + 14 de renda variável + 4 aplicações de renda fixa + 2 compras de moeda
  await expect(painel(page, "Histórico de operações").getByRole("row")).toHaveCount(21);
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

test("compra digitando o ticker; venda escolhendo da carteira, sem passar do que tem", async ({ page }) => {
  await ir(page, "/operacoes");
  const compra = page.getByRole("form", { name: /Compra de ações/ });
  await compra.getByLabel("Ativo").fill("BBAS3");
  await compra.getByLabel("Quantidade").fill("10");
  await compra.getByLabel("Preço").fill("25");
  await compra.getByLabel("Taxas (R$)").fill("1");
  await compra.getByRole("button", { name: "Lançar" }).click();
  await expect(linha(painel(page, "Posições e preço médio"), "BBAS3")).toContainText("R$ 25,10"); // (250 + 1) ÷ 10

  await page.getByRole("group", { name: "Operação" }).getByRole("button", { name: "Venda" }).click();
  const venda = page.getByRole("form", { name: /Venda de ações/ });
  await venda.getByLabel("Ativo").selectOption("BBAS3");
  await expect(venda).toContainText("você tem 10");
  await venda.getByLabel("Quantidade").fill("15");
  await expect(page.getByText(/você tinha 10 de BBAS3/)).toBeVisible();
  await expect(venda.getByRole("button", { name: "Lançar" })).toBeDisabled();
  await venda.getByRole("button", { name: "Tudo" }).click();
  await expect(venda.getByLabel("Quantidade")).toHaveValue("10");
  await venda.getByLabel("Preço").fill("26");
  await venda.getByRole("button", { name: "Lançar" }).click();
  await expect(linha(painel(page, "Histórico de operações"), "BBAS3").filter({ hasText: /Venda/ })).toContainText("R$ 260,00");

  // cripto: a venda só oferece as moedas que você tem
  await page.getByRole("group", { name: "Classe do ativo" }).getByRole("button", { name: "Cripto" }).click();
  await page.getByRole("group", { name: "Operação" }).getByRole("button", { name: "Venda" }).click();
  const opcoes = await page.getByRole("form", { name: /Venda de cripto/ }).getByLabel("Ativo").locator("option").allTextContents();
  expect(opcoes.map(o => o.split(" ")[0]).sort()).toEqual(["BTC", "ETH"]);
});

test("estornar: a operação fica no histórico, sai das contas e volta preenchida para corrigir", async ({ page }) => {
  await ir(page, "/operacoes");
  const hist = painel(page, "Histórico de operações");
  // HGLG11: comprou 40 e vendeu 10 em 20/08/2026
  await expect(linha(painel(page, "Posições e preço médio"), "HGLG11")).toContainText("30");
  const venda = linha(hist, "HGLG11").filter({ hasText: /Venda/ });
  await expect(venda).toContainText("R$ 1.649,00"); // 10 × 165 − 1
  await expect(hist.getByRole("button", { name: /Remover|Editar/ })).toHaveCount(0);
  page.once("dialog", d => d.accept("quantidade errada"));
  await venda.getByRole("button", { name: /^Estornar/ }).click();
  await expect(venda).toContainText("estornada");
  await expect(venda.getByRole("button", { name: /^Estornar/ })).toHaveCount(0);
  await expect(linha(hist, /Estorno/).filter({ hasText: "HGLG11" })).toContainText("quantidade errada");
  await expect(linha(painel(page, "Posições e preço médio"), "HGLG11")).toContainText("40");
  await expect(page.getByRole("heading", { name: "Lançar de novo, corrigida" })).toBeVisible();
  const form = page.getByRole("form", { name: /Venda de ações/ });
  await expect(form.getByLabel("Ativo")).toHaveValue("HGLG11");
  await expect(form.getByLabel("Quantidade")).toHaveValue("10");
  await expect(page.getByRole("group", { name: "Operação" }).getByRole("button", { name: "Venda" })).toHaveAttribute("aria-pressed", "true");
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
