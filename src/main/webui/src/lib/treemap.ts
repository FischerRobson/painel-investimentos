// Mapa em retângulos (treemap "squarified"): cada item ocupa uma área proporcional ao valor, com retângulos o mais perto
// possível de um quadrado.
export type Retangulo = { x: number; y: number; w: number; h: number };

export function treemap<T>(itens: T[], valor: (i: T) => number, largura: number, altura: number): (Retangulo & { item: T })[] {
  const ordenados = itens.filter(i => valor(i) > 0).sort((a, b) => valor(b) - valor(a));
  const total = ordenados.reduce((s, i) => s + valor(i), 0);
  if (!total || !(largura > 0) || !(altura > 0)) return [];
  const areas = ordenados.map(i => ({ item: i, area: valor(i) / total * largura * altura }));
  const out: (Retangulo & { item: T })[] = [];
  const livre = { x: 0, y: 0, w: largura, h: altura };
  // a pior proporção (maior lado ÷ menor) de uma faixa encostada num lado de comprimento `lado`
  const pior = (faixa: { area: number }[], lado: number) => {
    const soma = faixa.reduce((s, a) => s + a.area, 0), espessura = soma / lado;
    return Math.max(...faixa.map(a => { const comp = a.area / espessura; return Math.max(comp / espessura, espessura / comp); }));
  };
  let i = 0;
  while (i < areas.length) {
    const lado = Math.min(livre.w, livre.h);
    let fim = i + 1;
    while (fim < areas.length && pior(areas.slice(i, fim + 1), lado) <= pior(areas.slice(i, fim), lado)) fim++;
    const faixa = areas.slice(i, fim);
    const espessura = faixa.reduce((s, a) => s + a.area, 0) / lado;
    let pos = 0;
    const emColuna = livre.w >= livre.h; // faixa vertical à esquerda quando sobra mais largura que altura
    for (const a of faixa) {
      const comp = a.area / espessura;
      out.push(emColuna ? { item: a.item, x: livre.x, y: livre.y + pos, w: espessura, h: comp } : { item: a.item, x: livre.x + pos, y: livre.y, w: comp, h: espessura });
      pos += comp;
    }
    if (emColuna) { livre.x += espessura; livre.w -= espessura; } else { livre.y += espessura; livre.h -= espessura; }
    i = fim;
  }
  return out;
}
