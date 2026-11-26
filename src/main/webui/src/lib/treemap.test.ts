import { describe, expect, it } from "vitest";
import { treemap } from "./treemap";

const area = (r: { w: number; h: number }) => r.w * r.h;

describe("treemap", () => {
  const valores = [60, 25, 10, 4, 0.5, 0.5];
  const r = treemap(valores, v => v, 800, 400);
  it("área proporcional ao valor e o mapa inteiro preenchido", () => {
    expect(r).toHaveLength(6);
    for (const x of r) expect(area(x)).toBeCloseTo(x.item / 100 * 320_000, 4);
    expect(r.reduce((s, x) => s + area(x), 0)).toBeCloseTo(320_000, 4);
  });
  it("tudo dentro do quadro e sem sobreposição", () => {
    for (const a of r) {
      expect(a.x).toBeGreaterThanOrEqual(-1e-6);
      expect(a.y).toBeGreaterThanOrEqual(-1e-6);
      expect(a.x + a.w).toBeLessThanOrEqual(800 + 1e-6);
      expect(a.y + a.h).toBeLessThanOrEqual(400 + 1e-6);
      for (const b of r) {
        if (a === b) continue;
        const sx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), sy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(Math.min(sx, sy)).toBeLessThan(1e-6);
      }
    }
  });
  it("ignora valores zerados e aguenta lista vazia", () => {
    expect(treemap([0, 5], v => v, 100, 100)).toEqual([{ item: 5, x: 0, y: 0, w: 100, h: 100 }]);
    expect(treemap([], (v: number) => v, 100, 100)).toEqual([]);
  });
});
