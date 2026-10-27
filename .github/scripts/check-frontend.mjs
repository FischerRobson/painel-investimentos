// Valida a sintaxe do JavaScript inline do index.html (sem executar) e o manifest da PWA.
import { readFileSync } from "node:fs";

const base = "src/main/resources/META-INF/resources";
const html = readFileSync(`${base}/index.html`, "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length === 0) throw new Error("nenhum <script> inline no index.html");
scripts.forEach(code => new Function(code));

const manifest = JSON.parse(readFileSync(`${base}/manifest.json`, "utf8"));
for (const icon of manifest.icons) readFileSync(`${base}${icon.src}`);

console.log(`index.html: ${scripts.length} script(s) ok · manifest e ícones ok`);
