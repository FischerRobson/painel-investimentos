// Mapa da carteira e desempenho por ativo, os dois sobre os últimos 30 dias. As cotações de ações e FIIs são as que a página
// já buscou (nenhuma consulta a mais na brapi); o /api/benchmarks traz cripto, câmbio, CDI e IPCA.
import { useComparativo } from "../../lib/useComparativo";
import type { Composicao, ItemAtivo } from "../../lib/composicao";
import { Mapa } from "./Mapa";
import { Desempenho } from "./Desempenho";

export function UltimosDias({ c, itens, pronta }: { c: Composicao; itens: ItemAtivo[]; pronta: boolean }) {
  const { d, erro, versao } = useComparativo(c, "1mo", pronta, itens);
  return <>
    <Mapa d={d} erro={erro} />
    <Desempenho d={d} erro={erro} versao={versao} />
  </>;
}
