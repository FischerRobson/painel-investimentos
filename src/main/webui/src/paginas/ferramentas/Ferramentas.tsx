// /ferramentas: hub de cards; cada ferramenta abre em /ferramentas#<id> (as contas ficam no motor).
import { useEffect, type ComponentType } from "react";
import { Link, useLocation } from "react-router";
import { useTitulo } from "../../lib/useTitulo";
import { useRendaFixa } from "../../lib/dados";
import { TOOL_ART } from "./arte";
import { ProjecaoRF } from "./ProjecaoRF";
import { Simulador } from "./Simulador";
import { IpcaPre } from "./IpcaPre";
import { Termometro } from "./Termometro";
import { Comparador } from "./Comparador";
import { Marcacao } from "./Marcacao";
import { Analisador } from "./Analisador";
import { Planejador } from "./Planejador";

type Ferramenta = { id: string; nome: string; desc: string; Componente: ComponentType };

export const TOOLS: Ferramenta[] = [
  { id: "renda-fixa", nome: "Projeção da renda fixa", desc: "Quanto os seus títulos de renda fixa vão valer numa data futura, já descontado o IR.", Componente: ProjecaoRF },
  { id: "aportes", nome: "Simulador de aportes", desc: "Quanto você terá aportando todo mês, e quando chega na meta de patrimônio ou de renda.", Componente: Simulador },
  { id: "ipca-pre", nome: "IPCA+ × Prefixado", desc: "Qual inflação faz os dois títulos empatarem, e quem ganha com a inflação que você espera.", Componente: IpcaPre },
  { id: "termometro", nome: "Termômetro econômico", desc: "IPCA, Selic, CDI e juros reais, com histórico e expectativas do mercado.", Componente: Termometro },
  { id: "comparador", nome: "Comparador de renda fixa", desc: "CDB, LCI, LCA e Tesouro lado a lado, com IR e cenários de juros e inflação do Focus.", Componente: Comparador },
  { id: "marcacao", nome: "Marcação a mercado", desc: "Quanto você recebe vendendo um Tesouro antes do vencimento, e se compensa mais que manter.", Componente: Marcacao },
  { id: "analisador", nome: "Analisador de ações e FIIs", desc: "Pontuação de 0 a 100 de ações e FIIs pelos fundamentos, com o peso de cada critério.", Componente: Analisador },
  { id: "planejador", nome: "Planejador de metas", desc: "Quanto aportar por mês para chegar na sua meta, comparado com o que sobra do seu orçamento.", Componente: Planejador },
];

export function Ferramentas() {
  const { hash } = useLocation();
  const tool = TOOLS.find(t => t.id === hash.slice(1));
  useTitulo(tool ? tool.nome : "Ferramentas");
  // A página já carrega a carteira e as taxas do BCB (as ferramentas usam; o cabeçalho mostra a hora)
  useRendaFixa();
  useEffect(() => { scrollTo(0, 0); }, [tool]);
  if (tool) return <><Voltar /><tool.Componente /></>;
  return <>
    <div className="panel">
      <h2>Ferramentas</h2>
      <div className="hint" style={{ margin: 0 }}>Simuladores e calculadoras para planejar seus investimentos. Os resultados são estimativas com as premissas que você escolher, não previsões.</div>
    </div>
    <div className="tools">
      {TOOLS.map(t => (
        <Link key={t.id} className="tool-card" to={{ hash: t.id }}>
          {/* SVG estático do próprio app (arte.ts), sem dado do usuário */}
          <div className="tool-art" dangerouslySetInnerHTML={{ __html: TOOL_ART[t.id] }} />
          <div className="tool-body"><h3>{t.nome}</h3><p>{t.desc}</p></div>
        </Link>
      ))}
    </div>
  </>;
}

function Voltar() {
  return <Link className="tool-back" to={{ hash: "" }}>← Ferramentas</Link>;
}
