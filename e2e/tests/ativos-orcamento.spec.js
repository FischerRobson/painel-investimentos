// Ativos e Orçamento: os mesmos testes no app atual ("") e no React ("/novo"), mais a paridade do texto inteiro da página
// ao abrir e depois de mexer. Valores vêm dos dados fixos do modo demonstração (DemoDataService).
import { test, expect } from "./base.js";

const linha = (page, texto) => page.getByRole("row").filter({ hasText: texto });

for (const base of ["", "/novo"]) {
  const app = base ? "React" : "atual";
  const ir = (page, caminho) => page.goto(base + caminho);

  test.describe(`app ${app}`, () => {
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

    test("Orçamento: importar extrato não existe no modo demonstração", async ({ page }) => {
      await ir(page, "/orcamento#2026-03");
      await page.locator('input[type="file"]').setInputFiles({ name: "extrato.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
      await expect(page.getByText("Não deu para ler extrato.pdf: Indisponível no modo demonstração")).toBeVisible();
    });
  });
}

// ---------- Paridade ----------
async function texto(page, base, caminho, pronto, acoes = async () => {}) {
  await page.goto(base + caminho);
  await page.reload(); // o hash do mês vale ao abrir
  await expect(pronto(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await acoes(page);
  await page.waitForLoadState("networkidle");
  const partes = base ? ["main"] : caminho.startsWith("/ativos") ? ["#ativos-controls", "#app"] : ["#budget"];
  const textos = [];
  for (const p of partes) textos.push(await page.locator(p).innerText());
  return textos.join(" ").replace(/\s+/g, " ").trim();
}
const prontoAtivos = page => page.locator(".card").nth(1);
const prontoOrcamento = page => page.getByRole("heading", { name: "Últimos 12 meses" });

const CASOS = [
  ["Ativos", "/ativos", prontoAtivos, async () => {}],
  ["Ativos (5 anos, ordenado por DY e proventos abertos)", "/ativos", prontoAtivos, async page => {
    await page.getByRole("button", { name: "5A", exact: true }).click();
    await expect(page.getByText("Variação do preço em 5 anos")).toBeVisible();
    await page.getByRole("columnheader", { name: "DY 12m" }).click();
    await page.locator(".card").first().locator("summary").filter({ hasText: "Proventos" }).click();
  }],
  ["Ativos (outra lista)", "/ativos", prontoAtivos, async page => {
    await page.getByPlaceholder("Ex.: BBDC4, EGIE3, KNRI11").fill("KNRI11, bbdc4; VALE3");
    await page.getByRole("button", { name: "Carregar" }).click();
    await expect(page.locator(".card")).toHaveCount(3);
  }],
  ["Orçamento", "/orcamento#2026-03", prontoOrcamento, async () => {}],
  ["Orçamento (mês sem entradas usa a renda anterior)", "/orcamento#2026-03", prontoOrcamento, async page => {
    await page.getByRole("group", { name: "Tipo de lançamento" }).getByRole("button", { name: "Entradas" }).click();
    for (const nome of ["Salário", "Freelance"]) {
      page.once("dialog", d => d.accept());
      await linha(page, nome).getByRole("button", { name: /Remover|×/ }).click();
      await expect(linha(page, nome)).toHaveCount(0);
    }
    await expect(page.getByText("Nenhuma entrada em")).toBeVisible();
  }],
  ["Orçamento (saída nova, filtro e todos os lançamentos)", "/orcamento#2026-03", prontoOrcamento, async page => {
    await page.getByLabel("Descrição", { exact: true }).fill("Farmácia");
    await page.getByLabel("Valor (R$)").fill("120");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(linha(page, "Farmácia")).toBeVisible();
    await page.getByLabel("Ordenar").selectOption({ label: "Maior valor" });
    await page.getByRole("button", { name: "Entrada", exact: true }).click();
    await page.locator("summary").filter({ hasText: "Metas por área" }).click();
    await page.locator("summary").filter({ hasText: "Regras de descrição" }).click();
  }],
];
for (const [nome, caminho, pronto, acoes] of CASOS) {
  test(`paridade de texto: ${nome}`, async ({ page }) => {
    const atual = await texto(page, "", caminho, pronto, acoes);
    await page.evaluate(() => localStorage.removeItem("range"));
    const novo = await texto(page, "/novo", caminho, pronto, acoes);
    expect(atual.length).toBeGreaterThan(200);
    expect(novo).toBe(atual);
  });
}
