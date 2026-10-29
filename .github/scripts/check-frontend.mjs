// Valida a sintaxe do JavaScript inline do index.html (sem executar) e o manifest da PWA.
import { readFileSync } from "node:fs";

const base = "src/main/resources/META-INF/resources";
const html = readFileSync(`${base}/index.html`, "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length === 0) throw new Error("nenhum <script> inline no index.html");
scripts.forEach(code => new Function(code));

const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, "utf8"));
for (const icon of manifest.icons) readFileSync(`${base}${icon.src}`);

// Glossário: ids únicos, categoria existente, campos obrigatórios e "relacionados" apontando para termos que existem.
const glossario = JSON.parse(readFileSync(`${base}/glossario.json`, "utf8"));
const cats = new Set(glossario.categorias.map(c => c.id));
const ids = new Set();
const erros = [];
for (const t of glossario.termos) {
  if (!/^[a-z0-9-]+$/.test(t.id ?? "")) erros.push(`id inválido: ${t.id}`);
  if (ids.has(t.id)) erros.push(`id repetido: ${t.id}`);
  ids.add(t.id);
  if (!cats.has(t.categoria)) erros.push(`${t.id}: categoria desconhecida "${t.categoria}"`);
  if (!t.nome || !t.resumo) erros.push(`${t.id}: falta nome ou resumo`);
}
for (const t of glossario.termos) {
  for (const r of t.relacionados ?? []) if (!ids.has(r)) erros.push(`${t.id}: relacionado "${r}" não existe`);
}
if (erros.length) throw new Error("glossario.json:\n" + erros.join("\n"));

console.log(`index.html: ${scripts.length} script(s) ok · manifest e ícones ok · glossário: ${ids.size} termos ok`);
