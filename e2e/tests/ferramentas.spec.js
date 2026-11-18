import { test, expect } from "./base.js";

const FERRAMENTAS = [
  ["renda-fixa", "Projeção da renda fixa"],
  ["aportes", "Simulador de aportes"],
  ["ipca-pre", "IPCA+ × Prefixado"],
  ["termometro", "Termômetro econômico"],
  ["comparador", "Comparador de renda fixa"],
  ["marcacao", "Marcação a mercado"],
  ["analisador", "Analisador de ações e FIIs"],
  ["planejador", "Planejador de metas"],
];

// Os mesmos testes no app atual ("") e no React ("/novo")
for (const base of ["", "/novo"]) {
  const ir = (page, caminho) => page.goto(base + caminho);
  test.describe(`app ${base ? "React" : "atual"}`, () => {
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
}

// Paridade: o texto inteiro de cada ferramenta (números, tabelas e avisos) é igual nos dois apps
const texto = async (page, caminho) => {
  await page.goto(caminho);
  await page.reload(); // abre direto na ferramenta, como um link compartilhado
  const area = page.locator(caminho.startsWith("/novo") ? "main" : "#ferramentas");
  await expect(area.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  return (await area.innerText()).replace(/\s+/g, " ").trim();
};
for (const [id, nome] of [["", "Ferramentas"], ...FERRAMENTAS]) {
  test(`paridade de texto: ${nome}`, async ({ page }) => {
    const caminho = "/ferramentas" + (id ? "#" + id : "");
    const atual = await texto(page, caminho);
    const novo = await texto(page, "/novo" + caminho);
    expect(novo).toBe(atual);
  });
}

// Paridade depois de mexer: os mesmos passos nos dois apps levam ao mesmo texto
const preencherEm = async (page, rotulo, valor) => {
  await page.getByLabel(rotulo).fill(valor);
  await page.getByLabel(rotulo).press("Tab");
};
const ACOES = [
  ["comparador", "exemplo e título da carteira", async page => {
    await page.getByRole("button", { name: "Carregar exemplo" }).click();
    await page.getByRole("button", { name: "Comparar este investimento" }).click();
    await page.getByLabel("Ordenar por").selectOption({ label: "Maior rentabilidade real" });
    await page.getByLabel("Cenário de juros e inflação").selectOption({ label: "Focus: juros sobem (Selic no máximo)" });
  }],
  ["marcacao", "título da carteira e taxa de mercado", async page => {
    await page.getByRole("button", { name: "Usar este título" }).click();
    await preencherEm(page, /^Taxa de mercado hoje/, "7.5");
  }],
  ["renda-fixa", "um título, 5 anos e CDI projetado", async page => {
    await page.getByLabel(/^Títulos/).selectOption({ index: 1 });
    await page.getByRole("button", { name: "5 anos" }).click();
    await preencherEm(page, "CDI projetado (% a.a.)", "10");
  }],
  ["aportes", "premissa AUVP e sem reais de hoje", async page => {
    await page.getByRole("button", { name: "Premissa AUVP: 8% reais" }).click();
    await preencherEm(page, "Aporte mensal (R$)", "2500");
    await page.getByLabel("Mostrar em reais de hoje (descontando a inflação)").uncheck();
  }],
  ["ipca-pre", "prazo e inflação de equilíbrio", async page => {
    await page.getByRole("button", { name: "10 anos" }).click();
    await page.getByRole("button", { name: "Inflação de equilíbrio" }).click();
  }],
  ["analisador", "ações do mesmo setor e FII", async page => {
    await page.getByLabel(/^Tickers/).fill("ITSA4, BBDC4, KNRI11");
    await page.getByRole("button", { name: "Analisar" }).click();
    await expect(page.getByText("Consultando os indicadores…")).toBeHidden();
    await expect(page.getByRole("cell", { name: "KNRI11" }).first()).toBeVisible();
  }],
  ["planejador", "meta, prazo e taxa", async page => {
    await preencherEm(page, "Valor da meta (R$)", "50000");
    await preencherEm(page, "Prazo (meses)", "18");
    await preencherEm(page, "Rentabilidade (% a.a.)", "9");
  }],
];
const textoDepois = async (page, base, id, acoes) => {
  await page.goto(base + "/ferramentas#" + id);
  await page.reload();
  const area = page.locator(base ? "main" : "#ferramentas");
  await expect(area.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await acoes(page);
  await page.waitForLoadState("networkidle");
  return (await area.innerText()).replace(/\s+/g, " ").trim();
};
for (const [id, desc, acoes] of ACOES) {
  test(`paridade depois de mexer: ${id} (${desc})`, async ({ page }) => {
    const atual = await textoDepois(page, "", id, acoes);
    await page.evaluate(() => { for (const k of ["comparador", "marcacao", "ipcaPre", "analisador", "planejador"]) localStorage.removeItem(k); });
    const novo = await textoDepois(page, "/novo", id, acoes);
    expect(novo).toBe(atual);
  });
}

// Preferências guardadas no navegador valem nos dois apps (mesmas chaves do localStorage)
test("preferências: o que foi configurado no React aparece igual no app atual", async ({ page }) => {
  await page.goto("/novo/ferramentas#comparador");
  await page.getByRole("button", { name: "Carregar exemplo" }).click();
  await page.getByLabel("Cenário de juros e inflação").selectOption({ label: "Focus: inflação sobe (IPCA no máximo)" });
  await page.goto("/novo/ferramentas#ipca-pre");
  await page.getByRole("button", { name: "20 anos" }).click();
  for (const id of ["comparador", "ipca-pre"]) {
    const novo = await texto(page, "/novo/ferramentas#" + id);
    const atual = await texto(page, "/ferramentas#" + id);
    expect(atual).toBe(novo);
    expect(atual).toContain(id === "comparador" ? "Focus: inflação sobe (IPCA no máximo)" : "em 20 anos");
  }
});
