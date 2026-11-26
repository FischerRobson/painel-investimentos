// Carteira: totais, divisão, tabelas, formulários, comparativo e backup. Valores vêm dos dados fixos do modo demonstração
// (DemoDataService).
import { test, expect, ir } from "./base.js";

const tabela = (page, titulo) => page.locator("details.acc").filter({ has: page.locator("summary", { hasText: titulo }) });
const linha = (page, texto) => page.getByRole("row").filter({ hasText: texto });
// as seções da carteira começam fechadas
const abrir = (page, titulo) => tabela(page, titulo).locator("summary").click();


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
    await abrir(page, "Renda fixa");
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

  test("Carteira: nada se adiciona à mão; a quantidade abre a venda em Operações", async ({ page }) => {
    await ir(page, "/carteira");
    await abrir(page, "Ações, FIIs e cripto");
    await expect(linha(page, "ITSA4")).toBeVisible();
    await expect(page.getByPlaceholder(/^Ticker/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Adicionar" })).toHaveCount(0);
    await expect(linha(page, "ITSA4").getByRole("button", { name: /Remover/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Lançar operação" })).toHaveAttribute("href", "/operacoes");

    await linha(page, "ITSA4").getByRole("link", { name: "400" }).click();
    await expect(page).toHaveURL(/\/operacoes\?classe=rv&mov=saida&ativo=ITSA4/);
    const venda = page.getByRole("form", { name: /Venda de ações/ });
    await expect(venda.getByLabel("Ativo")).toHaveValue("ITSA4");
    await expect(venda).toContainText("você tem 400");
  });

  test("Carteira: renda fixa entra e sai por Operações (aplicação e resgate)", async ({ page }) => {
    await ir(page, "/operacoes");
    await page.getByRole("group", { name: "Classe do ativo" }).getByRole("button", { name: "Renda fixa" }).click();
    const ap = page.getByRole("form", { name: "Aplicação em renda fixa" });
    await ap.getByPlaceholder("Ex.: CDB Banco Inter").fill("CDB Teste");
    await ap.getByLabel("Tipo do título").selectOption("LCA");
    await expect(ap.getByLabel("Isento de IR")).toBeChecked();
    await ap.getByPlaceholder("Ex.: 110").fill("95");
    await ap.getByLabel(/^Valor aplicado/).fill("1000");
    await ap.getByLabel("Data da aplicação").fill("2026-01-02");
    await ap.getByRole("button", { name: "Aplicar", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: /Aplicação/ }).filter({ hasText: "CDB Teste" })).toContainText("R$ 1.000,00");

    await page.getByRole("navigation", { name: "Páginas" }).getByRole("link", { name: "Carteira" }).click();
    await expect(tabela(page, "Renda fixa")).toContainText("5 títulos");
    await abrir(page, "Renda fixa"); // fica aberta nas próximas visitas
    await expect(linha(page, "CDB Teste")).toContainText("95% do CDI");
    await expect(linha(page, "CDB Banco Exemplo").getByRole("button", { name: /Editar|Remover/ })).toHaveCount(0);

    // Resgatar leva para Operações com o título já escolhido
    await page.getByRole("link", { name: "Resgatar CDB Banco Exemplo" }).click();
    const resgate = page.getByRole("form", { name: "Resgate de renda fixa" });
    await expect(resgate.getByRole("combobox")).toHaveValue("demo-cdb");
    await expect(resgate.getByLabel(/^Valor presente/)).not.toHaveValue(""); // vem da curva
    await resgate.getByLabel(/^Valor recebido/).fill("16000");
    await resgate.getByRole("button", { name: "Resgatar", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: /Resgate/ }).filter({ hasText: "CDB Banco Exemplo" })).toContainText("R$ 16.000,00");

    await page.getByRole("navigation", { name: "Páginas" }).getByRole("link", { name: "Carteira" }).click();
    await expect(tabela(page, "Renda fixa")).toContainText("4 títulos");
    await expect(linha(page, "CDB Banco Exemplo")).toHaveCount(0);
  });

  test("Carteira: as seções começam fechadas, mesmo com o valor antigo salvo, e lembram o que você abriu", async ({ page }) => {
    await page.addInitScript(() => { for (const k of ["rv", "rf", "fx", "bens"]) localStorage.setItem("acc_" + k, "1"); });
    await ir(page, "/carteira");
    for (const t of ["Ações, FIIs e cripto", "Renda fixa", "Moedas", "Bens"]) await expect(tabela(page, t)).not.toHaveAttribute("open");
    await abrir(page, "Renda fixa");
    await expect(linha(page, "CDB Banco Exemplo")).toBeVisible();
    await page.reload();
    await expect(tabela(page, "Renda fixa")).toHaveAttribute("open", "");
    await expect(tabela(page, "Bens")).not.toHaveAttribute("open");
  });

  test("Carteira: gráfico com todos os ativos e a régua do total investido", async ({ page }) => {
    await ir(page, "/carteira");
    const g = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Desempenho dos seus ativos" }) });
    const legenda = g.locator(".leg-ativos");
    await expect(legenda.getByRole("button", { name: /^Total investido/ })).toBeVisible();
    for (const nome of ["ITSA4", "HGLG11", "AAPL", "BTC", "CDB Banco Exemplo", "USD"]) await expect(legenda.getByRole("button", { name: nome })).toBeVisible();
    await expect(legenda).not.toContainText("Carro de exemplo"); // bens ficam de fora
    await expect(g.locator("canvas")).toBeVisible();
    await expect(g.locator(".hint")).toContainText("últimos 30 dias");
    await expect(g.getByRole("group")).toHaveCount(0); // sem botões de período ou de classe
    await legenda.getByRole("button", { name: "HGLG11" }).click();
    await expect(legenda.getByRole("button", { name: "HGLG11" })).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("Carteira: o mapa tem um retângulo por ativo, e os 30 dias não buscam as cotações de novo", async ({ page }) => {
    const pedidos = [];
    page.on("request", r => { if (r.url().includes("/api/data?")) pedidos.push(new URL(r.url()).search); });
    await ir(page, "/carteira");
    const mapa = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Mapa da carteira" }) });
    await expect(mapa.locator(".mapa-item")).toHaveCount(14); // 6 ações e FIIs, 2 criptos, 4 títulos e 2 moedas; sem bens
    await mapa.getByRole("button", { name: /^CDB Banco Exemplo:/ }).click();
    await expect(mapa.getByRole("status")).toContainText("CDB Banco Exemplo (Renda fixa)");
    await expect(mapa.getByRole("status")).toContainText("em 30 dias");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toContain("range=1mo");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("Ferramentas: carteira contra o mercado abre e troca o período", async ({ page }) => {
    await ir(page, "/carteira");
    await expect(page.getByText("Carteira × CDI, Ibovespa e IFIX")).toHaveCount(0);
    await ir(page, "/ferramentas#carteira-mercado");
    const tile = page.locator(".tile").filter({ hasText: "Sua carteira" });
    await expect(tile).toContainText("%");
    await page.getByRole("button", { name: "6 meses" }).click();
    await expect(page.getByRole("button", { name: "6 meses" })).toHaveAttribute("aria-pressed", "true");
    await expect(tile).toContainText("%");
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
    for (const grupo of ["Renda fixa", "Ações", "FIIs", "Exterior", "Cripto", "Moedas"]) await expect(p.getByRole("rowheader", { name: grupo, exact: true })).toBeVisible();
    await expect(p.getByRole("cell", { name: "ETH", exact: true })).toBeVisible(); // só o nome, sem o tipo ao lado
    await expect(p.getByRole("row").filter({ hasText: "CDB Banco Exemplo" })).toContainText(/R\$ [\d.]+,\d\d \(R\$ [\d.]+,\d\d\)/);
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
