// Booleano guardado no localStorage ("1"/"0"): acordeões abertos ou fechados
import { useState } from "react";
import { store } from "./store";

export function useAberto(chave: string, padrao: "1" | "0"): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => store.get(chave, padrao) === "1");
  return [v, novo => { setV(novo); store.set(chave, novo ? "1" : "0"); }];
}
