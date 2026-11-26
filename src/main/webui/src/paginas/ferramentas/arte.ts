// Desenhos dos cards do hub de ferramentas: SVG estático montado por código.
// Só tem constantes e o rótulo de acessibilidade; nada vem do usuário.
const ART = (inner: string, label: string) => `<svg viewBox="0 0 260 112" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">${inner}</svg>`;
export const TOOL_ART: Record<string, string> = {
  "renda-fixa": ART(`<path d="M24 92 C84 86 144 72 204 44 L204 96 L24 96Z" style="fill:var(--s2);opacity:.16"/>
    <path d="M24 92 C84 86 144 72 204 44" style="fill:none;stroke:var(--s2);stroke-width:3;stroke-linecap:round"/>
    <path d="M204 18 V96" style="stroke:var(--text-3);stroke-width:1.5;stroke-dasharray:4 4"/>
    <circle cx="24" cy="92" r="4" style="fill:var(--text-3)"/><circle cx="204" cy="44" r="6" style="fill:var(--s2)"/>
    <rect x="132" y="12" width="62" height="22" rx="6" style="fill:var(--surface);stroke:var(--border)"/>
    <path d="M142 23 h42" style="stroke:var(--text-2);stroke-width:3;stroke-linecap:round"/>`, "Curva da renda fixa subindo até uma data futura"),
  aportes: ART(`${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${28 + i * 30}" y="${92 - 8 - i * 7}" width="16" height="${8 + i * 7}" rx="3" style="fill:var(--s2);opacity:.45"/>`).join("")}
    <path d="M36 82 C100 76 160 56 222 20" style="fill:none;stroke:var(--s1);stroke-width:3;stroke-linecap:round"/>
    <path d="M24 30 H236" style="stroke:var(--s3);stroke-width:1.5;stroke-dasharray:5 4"/>
    <path d="M226 14 v18 M226 14 h14 l-4 5 4 5 h-14" style="fill:none;stroke:var(--s3);stroke-width:2;stroke-linejoin:round"/>
    <path d="M24 96 H236" style="stroke:var(--border);stroke-width:1.5"/>`, "Aportes mensais crescendo até a meta"),
  "ipca-pre": ART(`<path d="M24 80 Q132 62 236 16" style="fill:none;stroke:var(--s2);stroke-width:3;stroke-linecap:round"/>
    <path d="M24 80 L236 38" style="fill:none;stroke:var(--s1);stroke-width:3;stroke-linecap:round"/>
    <path d="M24 80 Q132 74 236 58" style="fill:none;stroke:var(--s2);stroke-width:2.5;stroke-dasharray:5 4;stroke-linecap:round"/>
    <path d="M60 100 H200" style="stroke:var(--border);stroke-width:4;stroke-linecap:round"/>
    <path d="M60 100 H150" style="stroke:var(--s2);stroke-width:4;stroke-linecap:round"/>
    <circle cx="150" cy="100" r="6" style="fill:var(--surface);stroke:var(--s2);stroke-width:2.5"/>`, "Prefixado entre duas curvas de IPCA+ com inflações diferentes"),
  termometro: ART(`<path d="M24 70 L60 58 L96 64 L132 40 L168 46 L204 30 L236 34" style="fill:none;stroke:var(--text-3);stroke-width:2.5;stroke-linejoin:round"/>
    <path d="M24 88 L60 84 L96 78 L132 80 L168 70 L204 72 L236 66" style="fill:none;stroke:var(--text-3);stroke-width:2.5;stroke-dasharray:5 4"/>`, "Linhas de inflação e juros"),
  comparador: ART([60, 120, 90, 160].map((w, i) => `<rect x="24" y="${18 + i * 22}" width="${w + 50}" height="14" rx="4" style="fill:var(--text-3);opacity:${0.35 + i * 0.12}"/>`).join(""), "Barras comparando investimentos"),
  marcacao: ART(`<path d="M30 20 Q90 86 236 92" style="fill:none;stroke:var(--text-3);stroke-width:2.5"/><circle cx="96" cy="66" r="6" style="fill:var(--text-3)"/>`, "Preço do título caindo quando a taxa sobe"),
  analisador: ART([[24, 150, 0.8], [84, 110, 0.55], [144, 170, 0.35], [204, 90, 0.65]].map(([x, h, o]) => `<rect x="${x}" y="${100 - h / 2 - 8}" width="36" height="${h / 2}" rx="5" style="fill:var(--text-3);opacity:${o}"/>`).join(""), "Barras de pontuação de ativos"),
  planejador: ART(`<path d="M30 14 L40 14 L40 96" style="fill:none;stroke:var(--text-3);stroke-width:2.5;stroke-linecap:round"/>
    <path d="M40 18 L110 18 L96 32 L110 46 L40 46 Z" style="fill:var(--text-3);opacity:.5"/>
    <path d="M60 96 V80 M100 96 V66 M140 96 V52 M180 96 V40 M220 96 V26" style="stroke:var(--text-3);stroke-width:8;stroke-linecap:round;opacity:.35"/>`, "Bandeira de meta e barras de aportes subindo"),
  "carteira-mercado": ART(`<path d="M24 82 C70 70 110 76 150 48 S212 36 236 18" style="fill:none;stroke:var(--s1);stroke-width:3;stroke-linecap:round"/>
    <path d="M24 82 L236 48" style="fill:none;stroke:var(--s2);stroke-width:2.5;stroke-dasharray:5 4"/>
    <path d="M24 82 C60 94 104 54 150 70 S210 52 236 64" style="fill:none;stroke:var(--s3);stroke-width:2.5"/>
    <path d="M24 96 H236" style="stroke:var(--border);stroke-width:1.5"/>`, "Linha da carteira comparada com o CDI e a bolsa"),
  moradia: ART(`<path d="M34 54 L68 26 L102 54 V96 H34 Z" style="fill:var(--s1);opacity:.35;stroke:var(--s1);stroke-width:2.5;stroke-linejoin:round"/>
    <path d="M128 90 C158 84 190 62 232 22" style="fill:none;stroke:var(--s2);stroke-width:3;stroke-linecap:round"/>
    <path d="M128 70 C164 66 198 54 232 46" style="fill:none;stroke:var(--s1);stroke-width:3;stroke-linecap:round"/>
    <path d="M24 96 H236" style="stroke:var(--border);stroke-width:1.5"/>`, "Casa ao lado de duas linhas de patrimônio"),
  "monte-carlo": ART(`<path d="M24 74 C90 62 160 36 236 12 L236 70 C160 76 90 76 24 74 Z" style="fill:var(--s1);opacity:.16"/>
    <path d="M24 74 C80 60 120 74 160 48 S212 40 236 24" style="fill:none;stroke:var(--text-3);stroke-width:1.5"/>
    <path d="M24 74 C70 84 120 54 170 66 S214 54 236 62" style="fill:none;stroke:var(--text-3);stroke-width:1.5"/>
    <path d="M24 74 C90 68 160 54 236 38" style="fill:none;stroke:var(--s1);stroke-width:3;stroke-linecap:round"/>
    <path d="M24 96 H236" style="stroke:var(--border);stroke-width:1.5"/>`, "Vários caminhos possíveis abrindo em leque"),
};
