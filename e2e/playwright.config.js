// Testes de ponta a ponta do painel, sempre em modo demonstração (dados fictícios, nada é gravado).
// Sobe o jar já empacotado (../target/quarkus-app) com uma pasta de dados própria, nunca a data/ real.
import { defineConfig, devices } from "@playwright/test";

const PORT = 8766;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    // O service worker do app responde /api/* antes do page.route (e o Termômetro iria ao BCB de verdade)
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `java -Djava.net.preferIPv4Stack=true -Dquarkus.http.port=${PORT} -Dquarkus.scheduler.enabled=false `
      + `-Dpainel.storage.dir=e2e/.dados -Dpainel.rates-cache-file=e2e/.dados/cache_taxas.json -Dpainel.tesouro-cache-file=e2e/.dados/cache_tesouro.json -jar target/quarkus-app/quarkus-run.jar`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/api/version`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
