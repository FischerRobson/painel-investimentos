// Orçamento: lançamentos recorrentes, próximos meses (comprometido), avisos de gasto e o gasto pago com VR.
// Demonstração: três regras recorrentes a partir do mês atual (Academia 119,90 · Seguro do carro 210,00 · Aluguel recebido 1.200,00)
// e, nos meses futuros, só as parcelas Notebook (389,90) e Geladeira (219,00) até acabarem.
import { test, expect, ir } from "./base.js";

const painel = (page, titulo) => page.locator(".panel").filter({ has: page.getByRole("heading", { name: titulo, exact: true }) });
const linha = (loc, texto) => loc.getByRole("row").filter({ hasText: texto });
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

test("abrir o mês cria os lançamentos das regras recorrentes, marcados", async ({ page }) => {
  await ir(page, "/orcamento");
  const lista = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Lançamentos", exact: true }) });
  await expect(linha(lista, "Academia")).toContainText("recorrente");
  await expect(linha(lista, "Academia")).toContainText("R$ 119,90");
  await expect(linha(lista, "Seguro do carro")).toContainText("R$ 210,00");
  await expect(linha(lista, "Aluguel recebido")).toContainText("+ R$ 1.200,00");
  // os criados pela regra não oferecem "repetir todo mês"; os comuns oferecem
  await expect(linha(lista, "Academia").getByRole("button", { name: /Repetir/ })).toHaveCount(0);
  await expect(linha(lista, "Supermercado").getByRole("button", { name: "Repetir Supermercado todo mês" })).toBeVisible();
});

test("a lista de recorrentes mostra as regras e cria uma nova a partir de um lançamento (↻)", async ({ page }) => {
  await ir(page, "/orcamento#2026-03");
  const rec = page.locator(".panel").filter({ has: page.locator("summary", { hasText: "Lançamentos recorrentes" }) });
  await expect(rec.locator("summary")).toContainText("3 regras");
  // ↻ abre a seção já preenchida; a regra começa no mês seguinte ao do lançamento, que já existe
  await linha(page, "Supermercado").getByRole("button", { name: "Repetir Supermercado todo mês" }).click();
  const form = rec.locator("form");
  await expect(form.locator("[name=description]")).toHaveValue("Supermercado");
  await expect(form.locator("[name=day]")).toHaveValue("8");
  await expect(form.locator("[name=start]")).toHaveValue("2026-04");
  await form.getByRole("button", { name: "Criar recorrente" }).click();
  await expect(rec.locator("summary")).toContainText("4 regras");
  await expect(linha(rec, "Supermercado")).toContainText("desde 04/2026");
  // editar e remover
  await linha(rec, "Supermercado").getByRole("button", { name: "Editar recorrente Supermercado" }).click();
  await form.locator("[name=amount]").fill("1300");
  await form.getByRole("button", { name: "Salvar recorrente" }).click();
  await expect(linha(rec, "Supermercado")).toContainText("R$ 1.300,00");
  page.once("dialog", d => d.accept());
  await linha(rec, "Supermercado").getByRole("button", { name: "Remover recorrente Supermercado" }).click();
  await expect(rec.locator("summary")).toContainText("3 regras");
});

test("próximos meses: parcelas do cartão, recorrentes previstos e entradas", async ({ page }) => {
  await ir(page, "/orcamento");
  const p = painel(page, "Próximos meses");
  await expect(p.locator(".tile").filter({ hasText: "Comprometido em 6 meses" })).toBeVisible();
  const primeiro = p.locator("tbody tr").first();
  await expect(primeiro).toContainText("R$ 608,90");   // Notebook + Geladeira
  await expect(primeiro).toContainText("R$ 329,90");   // Academia + Seguro, previstos
  await expect(primeiro).toContainText("R$ 938,80");   // comprometido
  await expect(primeiro).toContainText("R$ 1.200,00"); // aluguel recebido previsto
  await expect(primeiro).toContainText("+R$ 261,20");  // sobra prevista
  await expect(p.locator("tbody tr")).toHaveCount(6);
});

test("avisos de gasto: passou da meta e perto da meta", async ({ page }) => {
  const mes = mesAtual();
  await page.route(`**/api/budget/months/${mes}`, route => route.request().method() !== "GET" ? route.fallback() : route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      incomes: [{ id: "i1", date: `${mes}-01`, description: "Salário", amount: 10000 }],
      expenses: [{ id: "e1", date: `${mes}-02`, description: "Curso", amount: 700, area: "education" },
        { id: "e2", date: `${mes}-03`, description: "Jogos", amount: 900, area: "pleasures" }],
    }),
  }));
  await ir(page, "/orcamento");
  const avisos = painel(page, "Avisos do mês");
  // renda do mês = 10.000 + 1.200 (aluguel recebido); metas: educação 5% = 560, prazeres 10% = 1.120
  await expect(avisos).toContainText("Educação passou da meta: R$ 700,00 de R$ 560,00 (R$ 140,00 acima)");
  await expect(avisos).toContainText("Prazeres já usou 80% da meta");
  await expect(avisos.locator(".b-aviso.estourou")).toHaveCount(1);
  // outro mês: sem avisos
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByRole("heading", { name: "Avisos do mês" })).toBeHidden();
});

test("gasto pago com VR aparece no mês, fora das metas", async ({ page }) => {
  await ir(page, "/orcamento");
  const tile = page.locator(".tile").filter({ has: page.locator(".k", { hasText: "Pago com VR" }) });
  await expect(tile.locator(".v")).toHaveText(/^R\$ [\d.]+,\d\d$/);
  await expect(tile).toContainText("fora das metas");
  await tile.getByRole("link", { name: "ver VR" }).click();
  await expect(page).toHaveURL(/\/orcamento\/vr$/);
});
