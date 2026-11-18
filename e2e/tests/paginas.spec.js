import { test, expect, ir } from "./base.js";

const PAGINAS = [
  { caminho: "/carteira", titulo: "Carteira", heading: "Minha carteira" },
  { caminho: "/orcamento", titulo: "Orçamento", heading: "Meta × realizado" },
  { caminho: "/ferramentas", titulo: "Ferramentas", heading: "Ferramentas" },
  { caminho: "/ativos", titulo: "Ativos", heading: "Comparativo de desempenho" },
  { caminho: "/moedas", titulo: "Moedas", heading: "Moedas" },
  { caminho: "/bens", titulo: "Bens", heading: "Consultar tabela FIPE" },
  { caminho: "/custos", titulo: "Custos", heading: "Custos da AWS" },
  { caminho: "/glossario", titulo: "Glossário", heading: "Glossário" },
];

for (const p of PAGINAS) {
  test(`${p.titulo} abre`, async ({ page }) => {
    await ir(page, p.caminho);
    await expect(page).toHaveTitle(`${p.titulo} · Meus Investimentos`);
    await expect(page.getByRole("heading", { name: p.heading, exact: true })).toBeVisible();
  });
}

test("a raiz abre a carteira", async ({ page }) => {
  await ir(page, "/");
  await expect(page).toHaveTitle("Carteira · Meus Investimentos");
});

test("/projecao vai para a ferramenta de renda fixa", async ({ page }) => {
  await ir(page, "/projecao");
  await expect(page).toHaveURL(/\/ferramentas#renda-fixa$/);
  await expect(page.getByRole("heading", { name: "Projeção da renda fixa" })).toBeVisible();
});

test("o menu leva a cada página", async ({ page }) => {
  await ir(page, "/carteira");
  const menu = page.getByRole("navigation", { name: "Páginas" });
  for (const p of PAGINAS.slice(1)) {
    await menu.getByRole("link", { name: p.titulo }).click();
    await expect(page).toHaveTitle(`${p.titulo} · Meus Investimentos`);
  }
});

test("modo demonstração avisa e esconde o e-mail", async ({ page }) => {
  await ir(page, "/carteira");
  await expect(page.getByText("Modo demonstração: todos os dados são fictícios")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair da demonstração" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sair", exact: true })).toBeHidden();
});

test("carteira mostra os investimentos fictícios", async ({ page }) => {
  await ir(page, "/carteira");
  await expect(page.getByText("CDB Banco Exemplo").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolução do patrimônio" })).toBeVisible();
});

test("glossário abre o termo pelo link", async ({ page }) => {
  await ir(page, "/glossario#cdi");
  await expect(page.getByRole("heading", { name: "CDI", exact: true })).toBeVisible();
});
