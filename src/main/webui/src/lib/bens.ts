// Bens (tabela FIPE): consulta à /api/fipe e atualização do preço do mês dos bens salvos. Usado pelas páginas Bens e Carteira.
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { carteiraStore, useCarteira, type Bem } from "./carteira";

export type PrecoFipe = {
  brand: string; model: string; modelYear: number | string; fuel: string; codeFipe: string; month: string; price: number;
  history: { month: string; price: number }[];
};

export const bemNome = (b: Bem) => b.apelido || b.info?.model || "Veículo";

export async function fipeGet<T>(kind: string, params: Record<string, string>): Promise<T> {
  const j = await (await apiFetch(`/api/fipe/${kind}?${new URLSearchParams(params)}`)).json();
  if (j.error) throw new Error(j.error);
  return j.data;
}

// Junta o preço do mês no histórico do bem (sem mudar o original)
export function comPreco(b: Bem, d: PrecoFipe): Bem {
  const hist = { ...(b.hist || {}) };
  for (const h of d.history || []) if (h.price) hist[h.month] = h.price;
  return { ...b, hist, info: { brand: d.brand, model: d.model, modelYear: d.modelYear, fuel: d.fuel, codeFipe: d.codeFipe }, last: { month: d.month, price: d.price } };
}

// Preço FIPE do mês de cada bem salvo, uma vez por página aberta (como o loadBensPrices do app atual); se mudou algo,
// grava na carteira. Sem resposta da FIPE, vale o último preço salvo no bem.
export function usePrecosBens() {
  const carteira = useCarteira();
  const [precos, setPrecos] = useState<Record<string, PrecoFipe>>({});
  const [erro, setErro] = useState<string | null>(null);
  const atualizou = useRef(false);

  useEffect(() => {
    if (!carteira.doc || atualizou.current) return;
    atualizou.current = true;
    const lista = carteira.doc.bens ?? [];
    if (!lista.length) return;
    void (async () => {
      const novos: Record<string, PrecoFipe> = {};
      await Promise.all(lista.map(async b => {
        try { novos[b.id] = await fipeGet<PrecoFipe>("price", { type: b.type, brand: b.brand, model: b.model, year: b.year }); }
        catch (e) { setErro("FIPE: " + (e as Error).message + ". Usando o último valor salvo."); }
      }));
      setPrecos(p => ({ ...p, ...novos }));
      const doc = carteiraStore.get().doc;
      if (!doc?.bens) return;
      const atualizados = doc.bens.map(b => novos[b.id] ? comPreco(b, novos[b.id]) : b);
      if (JSON.stringify(atualizados) !== JSON.stringify(doc.bens)) carteiraStore.atualizar(d => ({ ...d, bens: atualizados }));
    })();
  }, [carteira.doc]);

  const valor = (b: Bem): number | null => precos[b.id]?.price ?? b.last?.price ?? null;
  // Bem novo salvo na página Bens: o preço já veio da consulta
  const guardar = (id: string, p: PrecoFipe) => setPrecos(atual => ({ ...atual, [id]: p }));
  return { valor, erro, guardar };
}
