// Service worker: depois da primeira visita, o app abre sem internet (o index.html, os assets do build e o glossário ficam
// guardados). Os outros testes bloqueiam o service worker; este liga.
import { test, expect, ir } from "./base.js";

test.use({ serviceWorkers: "allow" });

test("sem internet, o app abre com a cópia guardada", async ({ page, context }) => {
  await ir(page, "/glossario");
  await expect(page.getByText(/^\d+ termos para consultar/)).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // agora a página é controlada pelo service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByText(/^\d+ termos para consultar/)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Meus Investimentos" })).toBeVisible();
  await expect(page.getByText(/^\d+ termos para consultar/)).toBeVisible();
  await context.setOffline(false);
});
