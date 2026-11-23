// Preferências das ferramentas.
// - usePreferencia: JSON no localStorage, com as chaves ipcaPre, comparador, marcacao, analisador, planejador).
// - usePrefCarteira: dentro do documento da carteira (preferencias.projecao e preferencias.simulador), salvas no servidor.
// O setter recebe uma função ou um objeto parcial que é mesclado.
import { useCallback, useState } from "react";
import { store } from "./store";
import { carteiraStore, useCarteira } from "./carteira";

type Mudanca<T> = Partial<T> | ((atual: T) => T);
const aplicar = <T extends object>(atual: T, m: Mudanca<T>): T => typeof m === "function" ? m(atual) : { ...atual, ...m };

export function usePreferencia<T extends object>(chave: string, padrao: T): [T, (m: Mudanca<T>) => void] {
  const [valor, setValor] = useState<T>(() => ({ ...padrao, ...store.json<Partial<T>>(chave, {}) }));
  const mudar = useCallback((m: Mudanca<T>) => {
    setValor(atual => {
      const novo = aplicar(atual, m);
      store.set(chave, JSON.stringify(novo));
      return novo;
    });
  }, [chave]);
  return [valor, mudar];
}

// null enquanto a carteira não carregou
export function usePrefCarteira<T extends object>(chave: string, padrao: T): [T | null, (m: Mudanca<T>) => void] {
  const { doc } = useCarteira();
  const valor = doc ? { ...padrao, ...((doc.preferencias?.[chave] ?? {}) as Partial<T>) } : null;
  const mudar = useCallback((m: Mudanca<T>) => {
    carteiraStore.atualizar(d => {
      const atual = { ...padrao, ...((d.preferencias?.[chave] ?? {}) as Partial<T>) };
      return { ...d, preferencias: { ...(d.preferencias ?? {}), [chave]: aplicar(atual, m) } };
    });
    // padrao é um literal fixo de cada ferramenta: a dependência fica só na chave
  }, [chave]);
  return [valor, mudar];
}
