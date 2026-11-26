// Mapa da carteira e desempenho por ativo, os dois sobre os últimos 30 dias. As cotações de ações e FIIs são as que a página
// já buscou (nenhuma consulta a mais na brapi); o /api/benchmarks traz cripto, câmbio, CDI e IPCA.
// A busca (useComparativo) fica na página da Carteira, que espera o resultado antes de mostrar tudo.
import type { Comparativo } from "../../lib/comparativo";
import { Mapa } from "./Mapa";
import { Desempenho } from "./Desempenho";

export function UltimosDias({ d, erro, versao }: { d: Comparativo | null; erro: string | null; versao: string }) {
  return <>
    <Mapa d={d} erro={erro} />
    <Desempenho d={d} erro={erro} versao={versao} />
  </>;
}
