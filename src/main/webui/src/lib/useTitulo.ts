import { useEffect } from "react";
import { tituloDaPagina } from "../rotas";

// <title> da página: "Carteira · Meus Investimentos"
export function useTitulo(titulo: string): void {
  useEffect(() => { document.title = tituloDaPagina(titulo); }, [titulo]);
}
